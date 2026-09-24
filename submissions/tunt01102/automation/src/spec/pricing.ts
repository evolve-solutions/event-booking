// Executable form of the pricing and refund rules in round-1-brief.md.
// Every expected number in the API and E2E suites comes from here, never from the system under test.

export type TicketTypeName = 'STANDARD' | 'VIP' | 'STUDENT';

export interface CartLine {
  ticketTypeName: TicketTypeName;
  unitPrice: number;
  quantity: number;
}

export interface Totals {
  gross: number;
  discount: number;
  serviceFee: number;
  total: number;
}

export const SERVICE_FEE_RATE = 0.05;
export const VIP_CAP_PER_ORDER = 4;
export const CART_HOLD_MINUTES = 10;
export const SESSION_MINUTES = 30;

/** Known discount codes and their percentage off Standard tickets (GAP-01: found by probing, not in the brief). */
export const DISCOUNT_CODES: Record<string, number> = { WELCOME10: 10 };

export function discountPercentFor(code: string | null | undefined): number {
  if (!code) return 0;
  const pct = DISCOUNT_CODES[code.trim().toUpperCase()];
  return pct ?? 0;
}

/** REQ-PRICE-01, REQ-DISC-01, REQ-DISC-02: discount on Standard only, applied once, fee on what is left. */
export function expectedTotals(lines: CartLine[], discountCode?: string | null): Totals {
  const gross = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const standard = lines
    .filter((l) => l.ticketTypeName === 'STANDARD')
    .reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const discount = Math.round((standard * discountPercentFor(discountCode)) / 100);
  const afterDiscount = gross - discount;
  const serviceFee = Math.round(afterDiscount * SERVICE_FEE_RATE);
  return { gross, discount, serviceFee, total: afterDiscount + serviceFee };
}

/** REQ-REF-01..03. Exactly 24 h before the start counts as "within 24 hours" (GAP-02). */
export function refundPercent(cancelledAt: Date, startsAt: Date): 0 | 50 | 100 {
  const msBefore = startsAt.getTime() - cancelledAt.getTime();
  if (msBefore <= 0) return 0;
  if (msBefore <= 24 * 60 * 60 * 1000) return 50;
  return 100;
}

export function expectedRefund(totalAmount: number, cancelledAt: Date, startsAt: Date): number {
  return Math.round((totalAmount * refundPercent(cancelledAt, startsAt)) / 100);
}

/** REQ-BOOK-02: would adding `adding` VIP tickets to `inCart` break the per-order cap? */
export function vipAddAllowed(inCart: number, adding: number): boolean {
  return inCart + adding <= VIP_CAP_PER_ORDER;
}

/** REQ-BOOK-03: the hold ends 10 minutes after the most recent add. */
export function holdExpiresAt(lastAdd: Date): Date {
  return new Date(lastAdd.getTime() + CART_HOLD_MINUTES * 60 * 1000);
}
