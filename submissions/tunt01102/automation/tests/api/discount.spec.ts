import { EVENTS, VALID_PHONE, VALID_RECIPIENT } from '../../src/data/factory';
import { expectedTotals } from '../../src/spec/pricing';
import { bug, expect, linesOf, test, ticketTypes, tc } from '../support/fixtures';

const totalsOf = (c: any) => ({ gross: c.gross, discount: c.discount, serviceFee: c.serviceFee, total: c.total });

test.describe('Discount codes', () => {
  test(tc('TC-DISC-01', 'WELCOME10 takes 10% off a Standard-only cart'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    const r = await buyer.api.applyDiscount('WELCOME10');
    expect(r.status).toBe(200);
    expect(r.body.discountCode).toBe('WELCOME10');
    expect(r.body.discount).toBe(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 2 }], 'WELCOME10').discount);
  });

  test(tc('TC-DISC-02', 'unknown code is refused and totals do not change'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const before = (await buyer.api.addToCart(STANDARD.id, 1)).body;
    const r = await buyer.api.applyDiscount('NOPE99');
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Discount code not found');
    const after = (await buyer.api.cart()).body;
    expect(after.discountCode).toBeNull();
    expect(totalsOf(after)).toEqual(totalsOf(before));
  });

  test(tc('TC-DISC-03', 'applying the same code twice does not discount twice'), bug('BUG-05'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    await buyer.api.applyDiscount('WELCOME10');
    await buyer.api.applyDiscount('WELCOME10');
    const c = (await buyer.api.cart()).body;
    // Soft: report both the code list and the money, so one failure does not hide the other.
    expect.soft(c.discountCode).toBe('WELCOME10');
    expect(c.discount).toBe(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 2 }], 'WELCOME10').discount);
  });

  test(tc('TC-DISC-04', 'discount does not reduce VIP tickets'), bug('BUG-06'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(VIP.id, 1);
    await buyer.api.applyDiscount('WELCOME10');
    const c = (await buyer.api.cart()).body;
    expect(totalsOf(c)).toEqual(expectedTotals([{ ticketTypeName: 'VIP', unitPrice: VIP.price, quantity: 1 }], 'WELCOME10'));
  });

  test(tc('TC-DISC-05', 'discount does not reduce Student tickets'), bug('BUG-06'), async ({ buyer }) => {
    const { STUDENT } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STUDENT.id, 1);
    await buyer.api.applyDiscount('WELCOME10');
    expect((await buyer.api.cart()).body.discount).toBe(0);
  });

  test(tc('TC-DISC-06', 'mixed cart: discount only on the Standard part'), bug('BUG-06', 'BUG-07'), async ({ buyer }) => {
    const { STANDARD, VIP, STUDENT } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    await buyer.api.addToCart(VIP.id, 1);
    await buyer.api.addToCart(STUDENT.id, 1);
    await buyer.api.applyDiscount('WELCOME10');
    const c = (await buyer.api.cart()).body;
    expect(totalsOf(c)).toEqual(expectedTotals(linesOf(c), 'WELCOME10'));
  });

  test(tc('TC-DISC-07', 'service fee is charged on what is left after the discount'), bug('BUG-07'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    const c = (await buyer.api.applyDiscount('WELCOME10')).body;
    const want = expectedTotals(linesOf(c), 'WELCOME10');
    expect(c.discount).toBe(want.discount); // precondition: the discount itself is right, so the fee is judged alone
    expect(c.serviceFee).toBe(want.serviceFee);
    expect(c.total).toBe(want.total);
  });

  test(tc('TC-DISC-08', 'order confirmation keeps the discount and a single code'), bug('BUG-05', 'BUG-07'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 2);
    await buyer.api.applyDiscount('WELCOME10');
    const o = await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE });
    expect(o.status).toBe(200);
    const want = expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 2 }], 'WELCOME10');
    expect(o.body.discountCode).toBe('WELCOME10');
    expect({ gross: o.body.grossAmount, discount: o.body.discountAmount, serviceFee: o.body.serviceFeeAmount, total: o.body.totalAmount }).toEqual(want);
  });

  test(tc('TC-DISC-09', 'blank code is refused'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const r = await buyer.api.applyDiscount('');
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect((await buyer.api.cart()).body.discountCode).toBeNull();
  });

  test(tc('TC-DISC-10', 'discount follows Standard tickets added after the code'), bug('BUG-07'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const applied = await buyer.api.applyDiscount('WELCOME10');
    test.skip(applied.status !== 200, `the site refused a code on an empty cart (${applied.status}); the brief is silent, so nothing to check`);
    await buyer.api.addToCart(STANDARD.id, 2);
    const c = (await buyer.api.cart()).body;
    expect(totalsOf(c)).toEqual(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 2 }], 'WELCOME10'));
  });

  test(tc('TC-DISC-11', 'anonymous caller cannot apply a code'), async ({ anon }) => {
    expect((await anon.applyDiscount('WELCOME10')).status).toBe(401);
  });

  test(tc('TC-DISC-14', 'smallest discounted cart: one Standard ticket'), bug('BUG-07'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STANDARD.id, 1);
    const c = (await buyer.api.applyDiscount('WELCOME10')).body;
    expect(totalsOf(c)).toEqual(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 1 }], 'WELCOME10'));
  });

  test(tc('TC-DISC-15', 'removing every Standard line takes the discount back to zero'), bug('BUG-06'), async ({ buyer }) => {
    const { STANDARD, VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const std = (await buyer.api.addToCart(STANDARD.id, 1)).body.items[0];
    await buyer.api.addToCart(VIP.id, 1);
    await buyer.api.applyDiscount('WELCOME10');
    expect((await buyer.api.updateCartItem(std.id, 0)).status).toBe(200);
    const c = (await buyer.api.cart()).body;
    expect(c.items.map((i: any) => i.ticketTypeName)).toEqual(['VIP']);
    expect(totalsOf(c)).toEqual(expectedTotals([{ ticketTypeName: 'VIP', unitPrice: VIP.price, quantity: 1 }], 'WELCOME10'));
  });

  test(tc('TC-DISC-16', 'discount follows a quantity change on the Standard line'), bug('BUG-07'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const line = (await buyer.api.addToCart(STANDARD.id, 2)).body.items[0];
    await buyer.api.applyDiscount('WELCOME10');
    const c = (await buyer.api.updateCartItem(line.id, 3)).body;
    expect(totalsOf(c)).toEqual(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 3 }], 'WELCOME10'));
  });
});
