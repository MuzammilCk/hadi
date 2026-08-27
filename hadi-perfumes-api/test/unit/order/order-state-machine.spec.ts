jest.setTimeout(30000);

import { OrderStateMachine } from '../../../src/modules/order/order-state-machine';
import { OrderStatus } from '../../../src/modules/order/entities/order.entity';
import { InvalidOrderTransitionException } from '../../../src/modules/order/exceptions/order.exceptions';

describe('OrderStateMachine', () => {
  let sm: OrderStateMachine;

  beforeEach(() => {
    sm = new OrderStateMachine();
  });

  describe('canTransition()', () => {
    it('created → payment_pending is valid', () => {
      expect(
        sm.canTransition(OrderStatus.CREATED, OrderStatus.PAYMENT_PENDING),
      ).toBe(true);
    });

    it('created → cancelled is valid', () => {
      expect(sm.canTransition(OrderStatus.CREATED, OrderStatus.CANCELLED)).toBe(
        true,
      );
    });

    it('created → paid is INVALID (must go through payment_pending)', () => {
      expect(sm.canTransition(OrderStatus.CREATED, OrderStatus.PAID)).toBe(
        false,
      );
    });

    it('payment_pending → paid is valid', () => {
      expect(
        sm.canTransition(OrderStatus.PAYMENT_PENDING, OrderStatus.PAID),
      ).toBe(true);
    });

    it('payment_pending → payment_failed is valid', () => {
      expect(
        sm.canTransition(
          OrderStatus.PAYMENT_PENDING,
          OrderStatus.PAYMENT_FAILED,
        ),
      ).toBe(true);
    });

    it('paid → packing is valid', () => {
      expect(sm.canTransition(OrderStatus.PAID, OrderStatus.PACKING)).toBe(
        true,
      );
    });

    it('paid → refunded is valid', () => {
      expect(sm.canTransition(OrderStatus.PAID, OrderStatus.REFUNDED)).toBe(
        true,
      );
    });

    it('shipped → delivered is valid', () => {
      expect(sm.canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(
        true,
      );
    });

    it('delivered → completed is valid', () => {
      expect(
        sm.canTransition(OrderStatus.DELIVERED, OrderStatus.COMPLETED),
      ).toBe(true);
    });

    it('payment_failed → payment_pending is valid (retry)', () => {
      expect(
        sm.canTransition(
          OrderStatus.PAYMENT_FAILED,
          OrderStatus.PAYMENT_PENDING,
        ),
      ).toBe(true);
    });

    it('payment_failed → cancelled is valid', () => {
      expect(
        sm.canTransition(OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED),
      ).toBe(true);
    });

    // Terminal states
    it('cancelled → anything is INVALID (terminal)', () => {
      const allStatuses = Object.values(OrderStatus);
      for (const status of allStatuses) {
        expect(sm.canTransition(OrderStatus.CANCELLED, status)).toBe(false);
      }
    });

    it('refunded → anything is INVALID (terminal)', () => {
      const allStatuses = Object.values(OrderStatus);
      for (const status of allStatuses) {
        expect(sm.canTransition(OrderStatus.REFUNDED, status)).toBe(false);
      }
    });

    it('chargeback → anything is INVALID (terminal)', () => {
      const allStatuses = Object.values(OrderStatus);
      for (const status of allStatuses) {
        expect(sm.canTransition(OrderStatus.CHARGEBACK, status)).toBe(false);
      }
    });

    it('completed → packing is INVALID', () => {
      expect(sm.canTransition(OrderStatus.COMPLETED, OrderStatus.PACKING)).toBe(
        false,
      );
    });

    it('completed → refunded is valid', () => {
      expect(
        sm.canTransition(OrderStatus.COMPLETED, OrderStatus.REFUNDED),
      ).toBe(true);
    });

    it('completed → disputed is valid', () => {
      expect(
        sm.canTransition(OrderStatus.COMPLETED, OrderStatus.DISPUTED),
      ).toBe(true);
    });

    it('disputed → refunded is valid', () => {
      expect(sm.canTransition(OrderStatus.DISPUTED, OrderStatus.REFUNDED)).toBe(
        true,
      );
    });

    it('disputed → completed is valid (dispute resolved in merchant favor)', () => {
      expect(
        sm.canTransition(OrderStatus.DISPUTED, OrderStatus.COMPLETED),
      ).toBe(true);
    });
  });

  describe('getAllowedTransitions()', () => {
    it('created allows [payment_pending, cancelled]', () => {
      expect(sm.getAllowedTransitions(OrderStatus.CREATED)).toEqual([
        OrderStatus.PAYMENT_PENDING,
        OrderStatus.CANCELLED,
      ]);
    });

    it('cancelled allows nothing (terminal)', () => {
      expect(sm.getAllowedTransitions(OrderStatus.CANCELLED)).toEqual([]);
    });

    it('refunded allows nothing (terminal)', () => {
      expect(sm.getAllowedTransitions(OrderStatus.REFUNDED)).toEqual([]);
    });

    it('unknown status returns empty array', () => {
      expect(sm.getAllowedTransitions('nonexistent_status')).toEqual([]);
    });
  });

  describe('transition()', () => {
    it('mutates order.status on success', () => {
      const order = { status: OrderStatus.CREATED };
      sm.transition(order, OrderStatus.PAYMENT_PENDING);
      expect(order.status).toBe(OrderStatus.PAYMENT_PENDING);
    });

    it('throws InvalidOrderTransitionException on failure', () => {
      const order = { status: OrderStatus.CREATED };
      expect(() => sm.transition(order, OrderStatus.PAID)).toThrow(
        InvalidOrderTransitionException,
      );
    });

    it('does NOT persist anything (pure function test)', () => {
      const order = { status: OrderStatus.CREATED, id: 'test-123' } as any;
      sm.transition(order, OrderStatus.CANCELLED);
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.id).toBe('test-123'); // unchanged
    });

    it('throws on terminal state transition', () => {
      const order = { status: OrderStatus.CANCELLED };
      expect(() => sm.transition(order, OrderStatus.PAID)).toThrow(
        InvalidOrderTransitionException,
      );
    });
  });
});
