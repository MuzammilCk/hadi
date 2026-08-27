import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
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

export interface CreatePaymentIntentResponse {
  payment: Payment;
  clientSecret: string;
}

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

    // Fix A6: fail-fast if webhook secret is missing in production.
    // An empty secret could allow forged webhooks to mark orders as paid.
    if (
      process.env.NODE_ENV === 'production' &&
      !process.env.STRIPE_WEBHOOK_SECRET
    ) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET must be set in production to validate webhook signatures',
      );
    }
  }

  private get stripeClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Payment processing is temporarily unavailable. Please try again later.',
      );
    }
    return this.stripe;
  }

  async createPaymentIntent(
    orderId: string,
    idempotencyKey: string,
    buyerId: string,
  ): Promise<CreatePaymentIntentResponse> {
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
    if (existing && existing.provider_payment_intent_id) {
      // Re-fetch the PaymentIntent from Stripe to obtain the client_secret
      const pi = await this.stripeClient.paymentIntents.retrieve(
        existing.provider_payment_intent_id,
      );
      return { payment: existing, clientSecret: pi.client_secret! };
    }

    // Validate Stripe is available BEFORE transitioning order state.
    // Without this guard, the order moves to PAYMENT_PENDING but the Stripe
    // call fails, leaving the order stuck in a limbo state with no way to retry.
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Payment processing is temporarily unavailable. Please try again later.',
      );
    }

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
        automatic_payment_methods: { enabled: true },
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
      const saved = await this.paymentRepo.save(payment);
      return { payment: saved, clientSecret: intent.client_secret! };
    } catch (err: any) {
      // Handle unique constraint violation from concurrent request (PSQL code 23505)
      if (
        err?.code === '23505' ||
        err?.message?.includes('UNIQUE constraint failed') ||
        err?.message?.includes('unique constraint')
      ) {
        const duplicate = await this.paymentRepo.findOne({
          where: { order_id: orderId },
        });
        if (duplicate) {
          return { payment: duplicate, clientSecret: intent.client_secret! };
        }
      }
      throw err;
    }
  }

  async getPayment(orderId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { order_id: orderId } });
  }

  /**
   * Synchronous payment verification fallback.
   *
   * After the frontend's stripe.confirmPayment() succeeds, the backend order
   * is still PAYMENT_PENDING because it relies on the async Stripe webhook.
   * This method checks the PaymentIntent status directly from Stripe's API
   * and transitions the order to PAID if payment succeeded.
   *
   * Idempotent: if the webhook already processed the event, the PAID guard
   * prevents double-processing.
   */
  async verifyAndSyncPayment(
    orderId: string,
    buyerId: string,
  ): Promise<{ status: string; synced: boolean }> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId, buyer_id: buyerId },
    });
    if (!order) throw new OrderNotFoundException(orderId);

    // Already paid — nothing to do (idempotent)
    if (order.status === OrderStatus.PAID) {
      return { status: order.status, synced: false };
    }

    // Only verify orders that are in PAYMENT_PENDING state
    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      return { status: order.status, synced: false };
    }

    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId },
    });
    if (!payment || !payment.provider_payment_intent_id) {
      return { status: order.status, synced: false };
    }

    // Check real status from Stripe
    const intent = await this.stripeClient.paymentIntents.retrieve(
      payment.provider_payment_intent_id,
    );

    if (intent.status === 'succeeded') {
      // Run the same atomic transition as the webhook handler
      await this.dataSource.transaction(async (em) => {
        // Update payment record
        const freshPayment = await em.findOne(Payment, {
          where: { id: payment.id },
        });
        if (freshPayment && freshPayment.status !== 'captured') {
          freshPayment.status = 'captured';
          freshPayment.captured_at = new Date();
          freshPayment.provider_charge_id = (intent as any).latest_charge || null;
          await em.save(Payment, freshPayment);
        }

        // Transition order to PAID
        const freshOrder = await em.findOne(Order, {
          where: { id: orderId },
        });
        if (!freshOrder) return;

        // Idempotent guard: if already paid, bail out
        if (freshOrder.status === OrderStatus.PAID) return;

        const prevStatus = freshOrder.status;
        this.stateMachine.transition(freshOrder, OrderStatus.PAID);
        await em.save(Order, freshOrder);

        await em.save(
          OrderStatusHistory,
          em.create(OrderStatusHistory, {
            order_id: orderId,
            from_status: prevStatus,
            to_status: OrderStatus.PAID,
            actor_type: 'system',
            actor_id: null,
            reason: 'Payment verified via server-side Stripe API check',
          }),
        );

        // Confirm inventory reservations
        const items = await em.find(OrderItem, {
          where: { order_id: orderId },
        });
        for (const item of items) {
          if (item.inventory_reservation_id) {
            await this.inventoryService
              .confirmReservationWithEm(
                item.inventory_reservation_id,
                orderId,
                null as any,
                em,
              )
              .catch((err) => {
                this.logger.warn(
                  `Failed to confirm reservation ${item.inventory_reservation_id} in verify tx: ${err.message}`,
                );
              });
          }
        }

        // Write outbox event for commission processing
        await em.save(
          MoneyEventOutbox,
          em.create(MoneyEventOutbox, {
            event_type: 'order.paid',
            aggregate_id: orderId,
            payload: {
              order_id: orderId,
              buyer_id: freshOrder.buyer_id,
              total_amount: freshOrder.total_amount,
              currency: freshOrder.currency,
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

      return { status: OrderStatus.PAID, synced: true };
    }

    if (intent.status === 'requires_payment_method' || intent.status === 'canceled') {
      return { status: 'payment_failed', synced: false };
    }

    // Still processing (e.g., UPI pending approval)
    return { status: order.status, synced: false };
  }

  // Fix B9: Added standard Stripe refund method to be called from OrderService
  // on order cancellation if the payment was already captured.
  async refundPayment(orderId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({
      where: { order_id: orderId },
    });
    if (!payment || !payment.provider_payment_intent_id) {
      throw new Error('No valid payment intent found for this order.');
    }

    if (!this.stripe) {
      throw new Error('Stripe is not configured.');
    }

    try {
      await this.stripe.refunds.create({
        payment_intent: payment.provider_payment_intent_id,
        reason: 'requested_by_customer', // Or a more dynamic reason if available
      });

      // Update payment status locally
      payment.status = 'refunded';
      await this.paymentRepo.save(payment);
    } catch (err: any) {
      this.logger.error(`Stripe refund failed for order ${orderId}: ${err.message}`);
      throw new Error('Failed to issue refund with payment provider.');
    }
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
      // Fix C2: unique constraint means this event was seen before.
      // If the prior attempt errored (processed=false, error set) we must retry —
      // otherwise Stripe retries are silently swallowed and the order never gets paid.
      const existingRecord = await this.webhookRepo.findOne({
        where: { provider_event_id: event.id, provider: 'stripe' },
      });
      if (!existingRecord) return; // lost race, other worker handled it
      if (existingRecord.processed) return; // already succeeded — idempotent
      // Prior attempt errored — retry it
      webhookRecord = existingRecord;
      webhookRecord.error = null; // clear previous error before retry
    }

    // 3. Process event
    try {
      await this.processWebhookEvent(event, webhookRecord);
      webhookRecord.processed = true;
      webhookRecord.processed_at = new Date();
    } catch (err) {
      webhookRecord.error = err instanceof Error ? err.message : String(err);
    }
    await this.webhookRepo.save(webhookRecord);
  }

  private async processWebhookEvent(
    event: Stripe.Event,
    record: PaymentWebhookEvent,
  ): Promise<void> {
    const obj = (event.data as any).object;

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

        // Confirm inventory reservations atomically inside this transaction (Fix H2)
        const items = await em.find(OrderItem, {
          where: { order_id: orderId },
        });
        for (const item of items) {
          if (item.inventory_reservation_id) {
            // Use em-aware confirm so inventory update is atomic with order PAID transition.
            // confirmReservationWithEm is idempotent — safe if already confirmed.
            await this.inventoryService
              .confirmReservationWithEm(
                item.inventory_reservation_id,
                orderId,
                null as any,
                em,
              )
              .catch((err) => {
                this.logger.warn(
                  `Failed to confirm reservation ${item.inventory_reservation_id} in webhook tx: ${err.message}`,
                );
              });
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
        // Fix A4: use releaseReservationWithEm() to join the parent transaction.
        // The old releaseReservation() ran its own nested transaction — if the outer
        // tx rolled back (e.g. state machine threw), inventory was already released
        // but order stayed in 'payment_pending', creating phantom available stock.
        for (const item of items) {
          if (item.inventory_reservation_id) {
            await this.inventoryService
              .releaseReservationWithEm(item.inventory_reservation_id, 'system', false, em)
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
