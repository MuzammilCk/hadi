import { Test, TestingModule } from '@nestjs/testing';
import { PolicyEvaluationService } from '../../src/modules/commission/services/policy-evaluation.service';
import { CommissionRule } from '../../src/modules/commission/entities/commission-rule.entity';

describe('PolicyEvaluationService', () => {
  let service: PolicyEvaluationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyEvaluationService],
    }).compile();

    service = module.get<PolicyEvaluationService>(PolicyEvaluationService);
  });

  describe('evaluateEligibility', () => {
    it('should return false if order value is below minimum', () => {
      const rule = new CommissionRule();
      rule.min_order_value = 100;

      const result = service.evaluateEligibility({ 
        orderValue: 50, 
        productCategories: ['perfume'], 
        sellerStatus: 'active' 
      }, rule);

      expect(result).toBe(false);
    });

    it('should return false if category is not eligible', () => {
      const rule = new CommissionRule();
      rule.eligible_categories = ['premium_perfume'];

      const result = service.evaluateEligibility({ 
        orderValue: 200, 
        productCategories: ['standard_perfume'], 
        sellerStatus: 'active' 
      }, rule);

      expect(result).toBe(false);
    });

    it('should return true if all conditions are met', () => {
      const rule = new CommissionRule();
      rule.min_order_value = 50;
      rule.eligible_categories = ['perfume'];
      rule.eligible_seller_statuses = ['active'];

      const result = service.evaluateEligibility({ 
        orderValue: 100, 
        productCategories: ['perfume'], 
        sellerStatus: 'active' 
      }, rule);

      expect(result).toBe(true);
    });
  });

  describe('isEventProhibited', () => {
    it('should flag signup as prohibited', () => {
      expect(service.isEventProhibited('signup')).toBe(true);
    });

    it('should flag rank_upgrade as prohibited', () => {
      expect(service.isEventProhibited('rank_upgrade')).toBe(true);
    });

    it('should flag self_purchase as prohibited', () => {
      expect(service.isEventProhibited('self_purchase')).toBe(true);
    });

    it('should allow retail_sale', () => {
      expect(service.isEventProhibited('retail_sale')).toBe(false);
    });
  });
});
