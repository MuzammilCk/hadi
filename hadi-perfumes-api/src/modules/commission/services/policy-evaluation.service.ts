import { Injectable } from '@nestjs/common';
import { CommissionRule } from '../entities/commission-rule.entity';

export interface EvaluationEventContext {
  orderValue: number;
  productCategories: string[];
  sellerStatus: string;
}

@Injectable()
export class PolicyEvaluationService {
  /**
   * Pure deterministic rule evaluation to determine if an event is eligible for commission.
   */
  evaluateEligibility(
    event: EvaluationEventContext,
    rule: CommissionRule,
  ): boolean {
    if (rule.min_order_value && event.orderValue < rule.min_order_value) {
      return false;
    }

    if (rule.eligible_categories && rule.eligible_categories.length > 0) {
      const hasEligibleCategory = event.productCategories.some((cat) =>
        rule.eligible_categories.includes(cat),
      );
      if (!hasEligibleCategory) {
        return false;
      }
    }

    if (
      rule.eligible_seller_statuses &&
      rule.eligible_seller_statuses.length > 0
    ) {
      if (!rule.eligible_seller_statuses.includes(event.sellerStatus)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Determines payout delay days.
   */
  calculatePayoutDelay(rule: CommissionRule): number {
    return rule.payout_delay_days || 14;
  }

  /**
   * Checks for prohibited behavior based on the policy version semantics.
   * Example: Rejecting recruitment-only rewards internally.
   */
  isEventProhibited(
    eventType: 'retail_sale' | 'signup' | 'rank_upgrade' | 'self_purchase',
  ): boolean {
    // Non-negotiable FTC constraints implemented purely:
    const prohibitedTypes = ['signup', 'rank_upgrade', 'self_purchase'];
    return prohibitedTypes.includes(eventType);
  }

  /**
   * Evaluates the cap logic
   */
  applyCap(amount: number, rule: CommissionRule): number {
    if (rule.cap_per_order && amount > rule.cap_per_order) {
      return rule.cap_per_order;
    }
    return amount;
  }
}
