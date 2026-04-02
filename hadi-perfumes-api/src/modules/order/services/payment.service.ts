import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment } from '../entities/payment.entity';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { MoneyEventOutbox } from '../entities/money-event-outbox.entity';
import { OrderStateMachine } from '../order-state-machine';
import { InventoryService } from '../../inventory/services/inventory.service';
import {
  OrderNotFoundException,
  OrderAlreadyPaidException,
  WebhookSignatureInvalidException,
} from '../exceptions/order.exceptions';

@Injectable()
export class PaymentService {
  private stripe?: Stripe;
  private readonly stateMachine = new OrderStateMachine();
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookRepo: Repository<PaymentWebhookEvent>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(MoneyEventOutbox)
    private readonly outboxRepo: Repository<MoneyEventOutbox>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {
    if (process.env.NODE_ENV !== 'test' && process.env.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-06-20' as any,
      });
    }
  }

  private get stripeClient(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in production.');
    }
    return this.stripe;
  }

  async createPaymentIntent(
    orderId: string,
    idempotencyKey: string,
    buyerId: string,
  ): Promise<Payment> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, buyer_id: buyerId },
    });
    if (!order) throw new OrderNotFoundException(orderId);
    if (order.status === OrderStatus.PAID)
      throw new OrderAlreadyPaidException();

    // Idempotency: return existing payment if already created
    const existing = await this.paymentRepo.findOne({
      where: { order_id: orderId },
    });
    if (existing) return existing;

    // Transition order to payment_pending
    await this.dataSource.transaction(async (em) => {
      const freshOrder = await em.findOne(Order, { where: { id: orderId } });
      if (!freshOrder) throw new OrderNotFoundException(orderId);
      const prevStatus = freshOrder.status;
      this.stateMachine.transition(freshOrder, OrderStatus.PAYMENT_PENDING);
      await em.save(Order, freshOrder);
      const history = em.create(OrderStatusHistory, {
        order_id: orderId,
        from_status: prevStatus,
        to_status: OrderStatus.PAYMENT_PENDING,
        actor_type: 'system',
        actor_id: null,
        reason: 'Payment intent created',
      });
      await em.save(OrderStatusHistory, history);
    });

    // Create Stripe PaymentIntent
    const intent = await this.stripeClient.paymentIntents.create(
      {
        amount: Math.round(Number(order.total_amount) * 100), // smallest currency unit (paise)
        currency: order.currency.toLowerCase(),
        metadata: { order_id: orderId },
      },
      { idempotencyKey },
    );

    // Save payment record
    const payment = this.paymentRepo.create({
      order_id: orderId,
      idempotency_key: idempotencyKey,
      provider: 'stripe',
      provider_payment_intent_id: intent.id,
      status: 'pending',
      amount: Number(order.total_amount),
      currency: order.currency,
    });
    try {
      return await this.paymentRepo.save(payment);
    } catch (err: any) {
      // Handle unique constraint violation from concurrent request (PSQL code 23505)
      if (err?.code === '23505' || err?.message?.includes('UNIQUE constraint failed') || err?.message?.includes('unique constraint')) {
        const duplicate = await this.paymentRepo.findOne({ where: { order_id: orderId } });
        if (duplicate) return duplicate;
      }
      throw err;
    }
  }

  async getPayment(orderId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { order_id: orderId } });
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;

    // 1. Verify signature
    try {
      if (!this.stripe) throw new WebhookSignatureInvalidException();
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
    } catch (err) {
      if (err instanceof WebhookSignatureInvalidException) throw err;
      throw new WebhookSignatureInvalidException();
    }

    // 2. Deduplicate — try insert; unique constraint blocks duplicates
    let webhookRecord: PaymentWebhookEvent;
    try {
      webhookRecord = await this.webhookRepo.save(
        this.webhookRepo.create({
          provider: 'stripe',
          provider_event_id: event.id,
          event_type: event.type,
          payload: event as unknown as Record<string, any>,
          signature_verified: true,
          processed: false,
        }),
      );
    } catch {
      // Unique constraint violation — already processed, return silently (idempotent)
      return;
    }

    // 3. Process event
    try {
      await this.processWebhookEvent(event, webhookRecord);
      webhookRecord.processed = true;
      webhookRecord.processed_at = new Date();
    } catch (err) {
      webhookRecord.error =
        err instanceof Error ? err.message : String(err);
    }
    await this.webhookRepo.save(webhookRecord);
  }

  private async processWebhookEvent(
    event: Stripe.Event,
    record: PaymentWebhookEvent,
  ): Promise<void> {
    const obj = (event.data as any).object as any;

    if (event.type === 'payment_intent.succeeded') {
      const orderId = obj.metadata?.order_id;
      if (!orderId) return;

      await this.dataSource.transaction(async (em) => {
        // Update payment
        const payment = await em.findOne(Payment, {
          where: { provider_payment_intent_id: obj.id },
        });
        if (!payment) return;
        payment.status = 'captured';
        payment.captured_at = new Date();
        payment.provider_charge_id = obj.latest_charge || null;
        await em.save(Payment, payment);

        // Transition order
        const order = await em.findOne(Order, { where: { id: orderId } });
        if (!order) return;

        // Idempotent guard: if already paid, do nothing
        if (order.status === OrderStatus.PAID) return;

        const prevStatus = order.status;
        this.stateMachine.transition(order, OrderStatus.PAID);
        await em.save(Order, order);

        await em.save(
          OrderStatusHistory,
          em.create(OrderStatusHistory, {
            order_id: orderId,
            from_status: prevStatus,
            to_status: OrderStatus.PAID,
            actor_type: 'system',
            actor_id: null,
            reason: `Stripe event ${event.id}`,
          }),
        );

        // Confirm inventory reservations
        const items = await em.find(OrderItem, {
          where: { order_id: orderId },
        });
        for (const item of items) {
          if (item.inventory_reservation_id) {
            await this.inventoryService.confirmReservation(
              item.inventory_reservation_id,
              orderId,
              'system',
            );
          }
        }

        // Link webhook to order/payment
        record.order_id = orderId;
        record.payment_id = payment.id;

        // Write outbox event for Phase 6
        await em.save(
          MoneyEventOutbox,
          em.create(MoneyEventOutbox, {
            event_type: 'order.paid',
            aggregate_id: orderId,
            payload: {
              order_id: orderId,
              buyer_id: order.buyer_id,
              total_amount: order.total_amount,
              currency: order.currency,
              items: items.map((i) => ({
                listing_id: i.listing_id,
                qty: i.qty,
                unit_price: i.unit_price,
              })),
              paid_at: new Date().toISOString(),
            },
            published: false,
          }),
        );
      });
    }

    if (event.type === 'payment_intent.payment_failed') {
      const orderId = obj.metadata?.order_id;
      if (!orderId) return;

      await this.dataSource.transaction(async (em) => {
        const payment = await em.findOne(Payment, {
          where: { provider_payment_intent_id: obj.id },
        });
        if (payment) {
          payment.status = 'failed';
          payment.failed_at = new Date();
          payment.failure_reason =
            obj.last_payment_error?.message || 'Payment failed';
          await em.save(Payment, payment);
          record.payment_id = payment.id;
        }

        const order = await em.findOne(Order, { where: { id: orderId } });
        if (!order) return;
        if (order.status === OrderStatus.PAYMENT_FAILED) return; // idempotent

        const prevStatus = order.status;
        this.stateMachine.transition(order, OrderStatus.PAYMENT_FAILED);
        await em.save(Order, order);
        record.order_id = orderId;

        await em.save(
          OrderStatusHistory,
          em.create(OrderStatusHistory, {
            order_id: orderId,
            from_status: prevStatus,
            to_status: OrderStatus.PAYMENT_FAILED,
            actor_type: 'system',
            actor_id: null,
            reason: `Payment failed — Stripe event ${event.id}`,
          }),
        );

        // Release inventory reservations
        const items = await em.find(OrderItem, {
          where: { order_id: orderId },
        });
        for (const item of items) {
          if (item.inventory_reservation_id) {
            await this.inventoryService
              .releaseReservation(
                item.inventory_reservation_id,
                'system',
              )
              .catch((err) => {
                this.logger.warn(
                  `Failed to release reservation ${item.inventory_reservation_id}: ${err.message}`,
                );
              });
          }
        }
      });
    }
  }
}
