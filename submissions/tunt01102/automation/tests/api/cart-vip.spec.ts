import { EVENTS } from '../../src/data/factory';
import { CART_HOLD_MINUTES, expectedTotals } from '../../src/spec/pricing';
import { bug, expect, linesOf, test, ticketTypes, tc } from '../support/fixtures';

test.describe('Cart', () => {
  test(tc('TC-CART-01', 'one Standard ticket is priced per the spec'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const r = await buyer.api.addToCart(STANDARD.id, 1);
    expect(r.status).toBe(200);
    expect(r.body.items).toHaveLength(1);
    const { gross, discount, serviceFee, total } = r.body;
    expect({ gross, discount, serviceFee, total }).toEqual(expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: STANDARD.price, quantity: 1 }]));
  });

  test(tc('TC-CART-02', 'quantity 0 is refused'), bug('BUG-04'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    expect((await buyer.api.addToCart(STANDARD.id, 0)).status).toBe(400);
    expect((await buyer.api.cart()).body.items).toEqual([]);
  });

  test(tc('TC-CART-03', 'negative quantity is refused and the total never goes below zero'), bug('BUG-04'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const r = await buyer.api.addToCart(STANDARD.id, -1);
    const cart = (await buyer.api.cart()).body;
    expect(cart.total, 'cart total').toBeGreaterThanOrEqual(0);
    expect(r.status).toBe(400);
  });

  test(tc('TC-CART-04', 'fractional quantity is refused'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    expect((await buyer.api.addToCart(STANDARD.id, 1.5)).status).toBe(400);
  });

  test(tc('TC-CART-05', 'unknown ticket type is refused'), async ({ buyer }) => {
    const r = await buyer.api.addToCart(999999, 1);
    expect(r.status).toBe(404);
    expect(r.body.message).toBe('Ticket type not found');
  });

  test(tc('TC-CART-06', 'hold expiry is 10 minutes after the most recent add'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const check = async () => {
      const r = await buyer.api.addToCart(STANDARD.id, 1);
      const serverNow = new Date(r.headers.get('date')!).getTime();
      const hold = new Date(r.body.holdExpiresAt).getTime();
      expect(Math.abs(hold - serverNow - CART_HOLD_MINUTES * 60_000)).toBeLessThan(5_000);
      return hold;
    };
    const first = await check();
    await new Promise((res) => setTimeout(res, 2_000));
    const second = await check();
    expect(second).toBeGreaterThan(first);
  });

  test(tc('TC-CART-07', 'changing a line quantity reprices the cart'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const added = await buyer.api.addToCart(STANDARD.id, 1);
    const r = await buyer.api.updateCartItem(added.body.items[0].id, 3);
    expect(r.status).toBe(200);
    expect(r.body.gross).toBe(3 * STANDARD.price);
    const { gross, discount, serviceFee, total } = r.body;
    expect({ gross, discount, serviceFee, total }).toEqual(expectedTotals(linesOf(r.body)));
  });

  test(tc('TC-CART-08', 'mixed cart without discount shows the fee on its own line'), async ({ buyer }) => {
    const { VIP, STUDENT } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(VIP.id, 1);
    await buyer.api.addToCart(STUDENT.id, 1);
    const c = (await buyer.api.cart()).body;
    const want = expectedTotals([{ ticketTypeName: 'VIP', unitPrice: VIP.price, quantity: 1 }, { ticketTypeName: 'STUDENT', unitPrice: STUDENT.price, quantity: 1 }]);
    expect({ gross: c.gross, discount: c.discount, serviceFee: c.serviceFee, total: c.total }).toEqual(want);
  });
});

test.describe('VIP cap', () => {
  test(tc('TC-VIP-01', 'four VIP tickets in one add are accepted'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const r = await buyer.api.addToCart(VIP.id, 4);
    expect(r.status).toBe(200);
    expect(r.body.items[0].quantity).toBe(4);
  });

  test(tc('TC-VIP-02', 'five VIP tickets in one add are refused'), bug('BUG-08'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const r = await buyer.api.addToCart(VIP.id, 5);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('An order may contain at most 4 VIP tickets');
  });

  test(tc('TC-VIP-03', 'a fifth VIP added to four is refused'), bug('BUG-08'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(VIP.id, 4);
    expect((await buyer.api.addToCart(VIP.id, 1)).status).toBe(400);
    expect((await buyer.api.cart()).body.items[0].quantity).toBe(4);
  });

  test(tc('TC-VIP-04', 'the cap counts all events in the order'), bug('BUG-08'), async ({ buyer }) => {
    const a = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const b = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    expect((await buyer.api.addToCart(a.VIP.id, 3)).status).toBe(200);
    // Positive control: 3 + 1 across two events is exactly the cap, so it must be accepted.
    expect((await buyer.api.addToCart(b.VIP.id, 1)).status).toBe(200);
    const over = await buyer.api.addToCart(b.VIP.id, 1);
    expect(over.status).toBe(400);
    expect(over.body.message).toBe('An order may contain at most 4 VIP tickets');
  });

  test(tc('TC-VIP-05', 'raising a VIP line above four by PATCH is refused'), bug('BUG-08'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    const added = await buyer.api.addToCart(VIP.id, 4);
    expect((await buyer.api.updateCartItem(added.body.items[0].id, 5)).status).toBe(400);
    expect((await buyer.api.cart()).body.items[0].quantity).toBe(4);
  });

  test(tc('TC-VIP-06', 'checkout refuses an order holding five VIP tickets'), bug('BUG-08'), async ({ buyer }) => {
    const { VIP } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(VIP.id, 4);
    await buyer.api.addToCart(VIP.id, 1);
    const inCart = (await buyer.api.cart()).body.items.reduce((s: number, i: any) => s + i.quantity, 0);
    test.skip(inCart <= 4, 'cart could not reach 5 VIP, so checkout cannot be exercised with 5');
    const r = await buyer.api.checkout({ recipientName: 'QA Buyer', phone: '0912345678' });
    expect(r.status).toBe(400);
  });
});
