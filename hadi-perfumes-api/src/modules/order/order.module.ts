import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckoutSession } from './entities/checkout-session.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { Payment } from './entities/payment.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { OrderAuditLog } from './entities/order-audit-log.entity';
import { MoneyEventOutbox } from './entities/money-event-outbox.entity';
import { CheckoutService } from './services/checkout.service';
import { OrderService } from './services/order.service';
import { PaymentService } from './services/payment.service';
import { OrderController } from './controllers/order.controller';
import { PaymentController } from './controllers/payment.controller';
import { AdminOrderController } from './controllers/admin-order.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { ListingModule } from '../listing/listing.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CheckoutSession,
      Order,
      OrderItem,
      OrderStatusHistory,
      Payment,
      PaymentWebhookEvent,
      OrderAuditLog,
      MoneyEventOutbox,
    ]),
    InventoryModule,
    ListingModule,
    AuthModule,
  ],
  providers: [CheckoutService, OrderService, PaymentService],
  controllers: [OrderController, PaymentController, AdminOrderController],
  exports: [OrderService, CheckoutService, PaymentService],
})
export class OrderModule {}
