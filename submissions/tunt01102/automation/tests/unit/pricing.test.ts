import { describe, expect, it } from 'vitest';
import {
  discountPercentFor,
  expectedRefund,
  expectedTotals,
  holdExpiresAt,
  refundPercent,
  vipAddAllowed,
} from '../../src/spec/pricing';

const std = (quantity: number, unitPrice = 100_000) => ({ ticketTypeName: 'STANDARD' as const, unitPrice, quantity });
const vip = (quantity: number, unitPrice = 300_000) => ({ ticketTypeName: 'VIP' as const, unitPrice, quantity });
const student = (quantity: number, unitPrice = 50_000) => ({ ticketTypeName: 'STUDENT' as const, unitPrice, quantity });

describe('expectedTotals (REQ-PRICE-01, REQ-DISC-01)', () => {
  it('charges 5% on the subtotal when there is no discount', () => {
    expect(expectedTotals([std(1)])).toEqual({ gross: 100_000, discount: 0, serviceFee: 5_000, total: 105_000 });
  });

  it('charges the fee on what is left after the discount, not on the subtotal', () => {
    // The worked example behind BUG-07: 2 x 100,000 with 10% off.
    expect(expectedTotals([std(2)], 'WELCOME10')).toEqual({ gross: 200_000, discount: 20_000, serviceFee: 9_000, total: 189_000 });
  });

  it('discounts only the Standard part of a mixed cart', () => {
    const t = expectedTotals([std(2), vip(1), student(1)], 'WELCOME10');
    expect(t.gross).toBe(550_000);
    expect(t.discount).toBe(20_000);
    expect(t.serviceFee).toBe(26_500);
    expect(t.total).toBe(556_500);
  });

  it('gives no discount to VIP or Student only carts', () => {
    expect(expectedTotals([vip(1)], 'WELCOME10').discount).toBe(0);
    expect(expectedTotals([student(2)], 'WELCOME10').discount).toBe(0);
  });

  it('ignores unknown and empty codes', () => {
    expect(expectedTotals([std(1)], 'NOPE').discount).toBe(0);
    expect(expectedTotals([std(1)], null).discount).toBe(0);
    expect(expectedTotals([std(1)], '').discount).toBe(0);
  });

  it('returns zeros for an empty cart', () => {
    expect(expectedTotals([], 'WELCOME10')).toEqual({ gross: 0, discount: 0, serviceFee: 0, total: 0 });
  });

  it('rounds to whole dong', () => {
    const t = expectedTotals([std(1, 33_333)]);
    expect(Number.isInteger(t.serviceFee)).toBe(true);
    expect(t.serviceFee).toBe(1_667);
  });
});

describe('discountPercentFor', () => {
  it('matches codes after trimming and upper-casing', () => {
    expect(discountPercentFor('WELCOME10')).toBe(10);
    expect(discountPercentFor(' welcome10 ')).toBe(10);
    expect(discountPercentFor(undefined)).toBe(0);
  });
});

describe('refundPercent (REQ-REF-01..03)', () => {
  const start = new Date('2026-10-04T17:30:00Z');
  const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);

  it('refunds 100% more than 24 h before the start', () => {
    expect(refundPercent(hoursBefore(24.01), start)).toBe(100);
    expect(refundPercent(hoursBefore(240), start)).toBe(100);
  });

  it('refunds 50% within 24 h, exactly 24 h included (GAP-02)', () => {
    expect(refundPercent(hoursBefore(24), start)).toBe(50);
    expect(refundPercent(hoursBefore(1), start)).toBe(50);
  });

  it('refunds 0% at or after the start', () => {
    expect(refundPercent(start, start)).toBe(0);
    expect(refundPercent(hoursBefore(-5), start)).toBe(0);
  });

  it('turns the percentage into an amount', () => {
    expect(expectedRefund(210_000, hoursBefore(48), start)).toBe(210_000);
    expect(expectedRefund(210_000, hoursBefore(2), start)).toBe(105_000);
    expect(expectedRefund(210_000, hoursBefore(-1), start)).toBe(0);
  });
});

describe('vipAddAllowed (REQ-BOOK-02)', () => {
  it('allows up to four VIP tickets in one order', () => {
    expect(vipAddAllowed(0, 4)).toBe(true);
    expect(vipAddAllowed(3, 1)).toBe(true);
  });
  it('refuses the fifth VIP ticket however it arrives', () => {
    expect(vipAddAllowed(0, 5)).toBe(false);
    expect(vipAddAllowed(4, 1)).toBe(false);
    expect(vipAddAllowed(3, 3)).toBe(false);
  });
});

describe('holdExpiresAt (REQ-BOOK-03)', () => {
  it('is ten minutes after the most recent add', () => {
    expect(holdExpiresAt(new Date('2026-09-23T19:45:18.079Z')).toISOString()).toBe('2026-09-23T19:55:18.079Z');
  });
});
