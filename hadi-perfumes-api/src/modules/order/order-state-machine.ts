import { OrderStatus } from './entities/order.entity';
import { InvalidOrderTransitionException } from './exceptions/order.exceptions';

const TRANSITIONS: Record<string, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.PAYMENT_PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAYMENT_PENDING]: [
    OrderStatus.PAYMENT_AUTHORIZED,
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_AUTHORIZED]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAID]: [
    OrderStatus.PACKING,
    OrderStatus.REFUNDED,
    OrderStatus.DISPUTED,
    OrderStatus.CHARGEBACK,
  ],
  [OrderStatus.PACKING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [
    OrderStatus.COMPLETED,
    OrderStatus.REFUNDED,
    OrderStatus.DISPUTED,
  ],
  [OrderStatus.COMPLETED]: [
    OrderStatus.REFUNDED,
    OrderStatus.DISPUTED,
    OrderStatus.CHARGEBACK,
  ],
  [OrderStatus.PAYMENT_FAILED]: [
    OrderStatus.PAYMENT_PENDING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.DISPUTED]: [
    OrderStatus.REFUNDED,
    OrderStatus.CHARGEBACK,
    OrderStatus.COMPLETED,
  ],
  // Terminal states
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
  [OrderStatus.CHARGEBACK]: [],
};

export class OrderStateMachine {
  canTransition(from: string, to: OrderStatus): boolean {
    const allowed = TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  getAllowedTransitions(from: string): OrderStatus[] {
    return TRANSITIONS[from] || [];
  }

  /**
   * Validates and applies the transition. Throws InvalidOrderTransitionException on failure.
   * Does NOT persist anything — the caller must save the order and write history.
   */
  transition(order: { status: string }, to: OrderStatus): void {
    if (!this.canTransition(order.status, to)) {
      throw new InvalidOrderTransitionException(order.status, to);
    }
    order.status = to;
  }
}
