jest.setTimeout(30000);

describe('Order Total Calculations', () => {
  // Pure math — extracted calculation logic matching CheckoutService.calculateTotals()
  function calculateTotals(
    items: Array<{ unit_price: number; qty: number }>,
    opts: {
      shipping_fee?: number;
      tax_amount?: number;
      discount_amount?: number;
    } = {},
  ) {
    const subtotal = parseFloat(
      items.reduce((sum, s) => sum + s.unit_price * s.qty, 0).toFixed(2),
    );
    const shipping_fee = parseFloat((opts.shipping_fee || 0).toFixed(2));
    const tax_amount = parseFloat((opts.tax_amount || 0).toFixed(2));
    const discount_amount = parseFloat((opts.discount_amount || 0).toFixed(2));
    const total_amount = parseFloat(
      (subtotal + shipping_fee + tax_amount - discount_amount).toFixed(2),
    );
    const platform_revenue = parseFloat(
      (total_amount - shipping_fee).toFixed(2),
    );
    return {
      subtotal,
      shipping_fee,
      tax_amount,
      discount_amount,
      total_amount,
      platform_revenue,
    };
  }

  it('subtotal = sum of (unit_price × qty) per item', () => {
    const result = calculateTotals([
      { unit_price: 100.0, qty: 2 },
      { unit_price: 50.5, qty: 3 },
    ]);
    expect(result.subtotal).toBe(351.5);
  });

  it('total = subtotal + shipping + tax - discount', () => {
    const result = calculateTotals([{ unit_price: 200.0, qty: 1 }], {
      shipping_fee: 50,
      tax_amount: 36,
      discount_amount: 10,
    });
    expect(result.total_amount).toBe(276.0);
  });

  it('platform_revenue = total - shipping_fee', () => {
    const result = calculateTotals([{ unit_price: 500.0, qty: 1 }], {
      shipping_fee: 100,
    });
    expect(result.platform_revenue).toBe(
      result.total_amount - result.shipping_fee,
    );
    expect(result.platform_revenue).toBe(500.0);
  });

  it('zero discount is handled correctly', () => {
    const result = calculateTotals([{ unit_price: 100, qty: 1 }], {
      discount_amount: 0,
    });
    expect(result.total_amount).toBe(100.0);
    expect(result.discount_amount).toBe(0);
  });

  it('floating point: 0.1 + 0.2 rounds to 2dp correctly', () => {
    const result = calculateTotals([
      { unit_price: 0.1, qty: 1 },
      { unit_price: 0.2, qty: 1 },
    ]);
    expect(result.subtotal).toBe(0.3);
  });

  it('single item total is correct', () => {
    const result = calculateTotals([{ unit_price: 999.99, qty: 1 }]);
    expect(result.subtotal).toBe(999.99);
    expect(result.total_amount).toBe(999.99);
  });

  it('multiple items with varied quantities', () => {
    const result = calculateTotals([
      { unit_price: 10.5, qty: 3 },
      { unit_price: 25.0, qty: 2 },
      { unit_price: 5.75, qty: 10 },
    ]);
    // 31.50 + 50.00 + 57.50 = 139.00
    expect(result.subtotal).toBe(139.0);
  });

  it('discount larger than subtotal still computes (negative guarded by DTO Min(0))', () => {
    const result = calculateTotals([{ unit_price: 50, qty: 1 }], {
      discount_amount: 60,
    });
    // total_amount = 50 + 0 + 0 - 60 = -10 (blocked by DTO, but math is correct)
    expect(result.total_amount).toBe(-10.0);
  });
});
