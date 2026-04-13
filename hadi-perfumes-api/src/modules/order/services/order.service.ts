import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { OrderAuditLog } from '../entities/order-audit-log.entity';
import { OrderStateMachine } from '../order-state-machine';
import { CreateOrderDto } from '../dto/create-order.dto';
import { OrderListQueryDto } from '../dto/order-list-query.dto';
import { CheckoutService } from './checkout.service';
import { PaymentService } from './payment.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { ClawbackJob } from '../../../jobs/clawback.job';
import {
  OrderNotFoundException,
  OrderNotCancellableException,
  IdempotencyKeyRequiredException,
} from '../exceptions/order.exceptions';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly stateMachine = new OrderStateMachine();

  // Fix B9 dependency: Add PaymentService to constructor to allow refunds
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(OrderAuditLog)
    private readonly auditRepo: Repository<OrderAuditLog>,
    private readonly checkoutService: CheckoutService,
    private readonly paymentService: PaymentService,
    private readonly inventoryService: InventoryService,
    private readonly clawbackJob: ClawbackJob,
    private readonly dataSource: DataSource,
  ) {}

  async createOrder(
    buyerId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<Order> {
    if (!idempotencyKey || !/^[0-9a-f-]{36}$/i.test(idempotencyKey)) {
      throw new IdempotencyKeyRequiredException();
    }
    return this.checkoutService.initiateCheckout(buyerId, dto, idempotencyKey);
  }

  async getOrder(orderId: string, buyerId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, buyer_id: buyerId },
    });
    if (!order) {
      throw new OrderNotFoundException(orderId);
    }
    return order;
  }

  async getOrderWithItems(
    orderId: string,
    buyerId: string,
  ): Promise<{ order: Order; items: OrderItem[] }> {
    const order = await this.getOrder(orderId, buyerId);
    const items = await this.itemRepo.find({
      where: { order_id: orderId },
    });
    return { order, items };
  }

  async listOrders(
    buyerId: string,
    query: OrderListQueryDto,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.orderRepo
      .createQueryBuilder('order')
      .where('order.buyer_id = :buyerId', { buyerId });

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.from_date) {
      qb.andWhere('order.created_at >= :fromDate', {
        fromDate: query.from_date,
      });
    }
    if (query.to_date) {
      qb.andWhere('order.created_at <= :toDate', { toDate: query.to_date });
    }

    qb.orderBy('order.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async cancelOrder(orderId: string, buyerId: string): Promise<Order> {
    // Verify ownership first (read outside transaction is fine for auth check)
    await this.getOrder(orderId, buyerId);

    return this.dataSource.transaction(async (em) => {
      // Re-read inside transaction to get consistent status
      const freshOrder = await em.findOne(Order, { where: { id: orderId } });
      if (!freshOrder) throw new OrderNotFoundException(orderId);

      // Check cancellability on the transactionally-consistent read
      if (
        !this.stateMachine.canTransition(
          freshOrder.status,
          OrderStatus.CANCELLED,
        )
      ) {
        throw new OrderNotCancellableException(freshOrder.status);
      }

      const prevStatus = freshOrder.status;
      this.stateMachine.transition(freshOrder, OrderStatus.CANCELLED);
      freshOrder.cancelled_at = new Date();
      await em.save(Order, freshOrder);

      const history = em.create(OrderStatusHistory, {
        order_id: orderId,
        from_status: prevStatus,
        to_status: OrderStatus.CANCELLED,
        actor_type: 'customer',
        actor_id: buyerId,
        reason: 'Cancelled by customer',
      });
      await em.save(OrderStatusHistory, history);

      // Release inventory reservations
      const items = await em.find(OrderItem, {
        where: { order_id: orderId },
      });
      for (const item of items) {
        if (item.inventory_reservation_id) {
          // Fix H2: use em-aware release so it's atomic with the order cancellation
          await this.inventoryService
            .releaseReservationWithEm(
              item.inventory_reservation_id,
              buyerId,
              false,
              em,
            )
            .catch((err) => {
              this.logger.warn(
                `Failed to release reservation ${item.inventory_reservation_id}: ${err.message}`,
              );
            });
        }
      }

      // Fix A2: trigger commission clawback for orders that were already paid.
      // Without this, cancelled orders leave intact commissions in the upline —
      // a trivial exploit for commission farming.
      if (
        prevStatus === OrderStatus.PAID ||
        prevStatus === OrderStatus.COMPLETED
      ) {
        // Fix B9: If order was PAID (meaning funds were actually captured), issue a refund automatically
        try {
          await this.paymentService.refundPayment(orderId);
        } catch (err: any) {
          this.logger.error(`Failed to refund order ${orderId} on cancellation: ${err.message}`);
          throw new Error('Order cancellation failed: Could not issue refund. Please try again.');
        }

        await this.clawbackJob.clawbackForOrder(orderId).catch((err) => {
          this.logger.error(
            `Failed to clawback commissions for order ${orderId}: ${err.message}`,
          );
        });
      }

      return freshOrder;
    });
  }

  // --- Admin methods ---

  async adminListOrders(
    query: OrderListQueryDto,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.orderRepo.createQueryBuilder('order').where('1=1');

    if (query.status) {
      qb.andWhere('order.status = :status', { status: query.status });
    }
    if (query.from_date) {
      qb.andWhere('order.created_at >= :fromDate', {
        fromDate: query.from_date,
      });
    }
    if (query.to_date) {
      qb.andWhere('order.created_at <= :toDate', { toDate: query.to_date });
    }

    qb.orderBy('order.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async adminGetOrder(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new OrderNotFoundException(orderId);
    return order;
  }

  async adminUpdateOrderStatus(
    orderId: string,
    newStatus: string,
    adminActorId: string,
    reason?: string,
    ipAddress?: string,
  ): Promise<Order> {
    return this.dataSource.transaction(async (em) => {
      const order = await em.findOne(Order, { where: { id: orderId } });
      if (!order) throw new OrderNotFoundException(orderId);

      const prevStatus = order.status;
      this.stateMachine.transition(order, newStatus as OrderStatus);

      if (newStatus === OrderStatus.COMPLETED) {
        order.completed_at = new Date();
      }
      if (newStatus === OrderStatus.CANCELLED) {
        order.cancelled_at = new Date();
      }

      await em.save(Order, order);

      // Write status history
      const history = em.create(OrderStatusHistory, {
        order_id: orderId,
        from_status: prevStatus,
        to_status: newStatus,
        actor_type: 'admin',
        actor_id: adminActorId,
        reason: reason || null,
      });
      await em.save(OrderStatusHistory, history);

      // Write audit log
      const audit = em.create(OrderAuditLog, {
        order_id: orderId,
        action: 'status_change',
        actor_type: 'admin',
        actor_id: adminActorId,
        old_value: { status: prevStatus },
        new_value: { status: newStatus },
        reason: reason || null,
        ip_address: ipAddress || null,
      });
      await em.save(OrderAuditLog, audit);

      // Fix A3: Release inventory reservations when admin cancels an order.
      // Without this, admin cancellation left reserved stock permanently locked,
      // causing invisible stock shrinkage.
      if (newStatus === OrderStatus.CANCELLED) {
        const items = await em.find(OrderItem, {
          where: { order_id: orderId },
        });
        for (const item of items) {
          if (item.inventory_reservation_id) {
            await this.inventoryService
              .releaseReservationWithEm(
                item.inventory_reservation_id,
                adminActorId,
                false,
                em,
              )
              .catch((err) => {
                this.logger.warn(
                  `Failed to release reservation ${item.inventory_reservation_id}: ${err.message}`,
                );
              });
          }
        }

        // Fix A2: trigger commission clawback for paid/completed orders.
        if (
          prevStatus === OrderStatus.PAID ||
          prevStatus === OrderStatus.COMPLETED
        ) {
          await this.clawbackJob.clawbackForOrder(orderId).catch((err) => {
            this.logger.error(
              `Failed to clawback commissions for order ${orderId}: ${err.message}`,
            );
          });
        }
      }

      return order;
    });
  }
}
