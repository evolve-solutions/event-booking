import { ApiClient } from '../../src/api/client';
import { EVENTS, VALID_PHONE, VALID_RECIPIENT } from '../../src/data/factory';
import { expectedRefund, expectedTotals } from '../../src/spec/pricing';
import { bug, expect, test, ticketTypes, tc } from '../support/fixtures';

const OK = { recipientName: VALID_RECIPIENT, phone: VALID_PHONE };

async function buyStandard(api: ApiClient, qty = 1, eventId: number = EVENTS.upcoming.id) {
  const { STANDARD } = await ticketTypes(api, eventId);
  expect((await api.addToCart(STANDARD.id, qty)).status).toBe(200);
  return STANDARD;
}

async function remaining(api: ApiClient, eventId: number, ticketTypeId: number) {
  const e = await api.getEvent(eventId);
  return e.body.ticketTypes.find((t: any) => t.id === ticketTypeId).remaining as number;
}

test.describe('Checkout', () => {
  test(tc('TC-CHK-01', 'valid checkout confirms, empties the cart and takes stock'), async ({ buyer }) => {
    // The quiet event: no other test touches its stock, so the delta is ours alone.
    const std = await buyStandard(buyer.api, 2, EVENTS.quiet.id);
    const before = await remaining(buyer.api, EVENTS.quiet.id, std.id);
    const o = await buyer.api.checkout(OK);
    expect(o.status).toBe(200);
    expect(o.body.status).toBe('CONFIRMED');
    const want = expectedTotals([{ ticketTypeName: 'STANDARD', unitPrice: std.price, quantity: 2 }]);
    expect(o.body.totalAmount).toBe(want.total);
    expect(o.body.serviceFeeAmount).toBe(want.serviceFee);
    expect((await buyer.api.cart()).body.items).toEqual([]);
    // Other candidates may still touch it, so allow for their activity but insist ours was taken.
    expect(await remaining(buyer.api, EVENTS.quiet.id, std.id)).toBeLessThanOrEqual(before - 2);
  });

  test(tc('TC-CHK-02', 'checkout of an empty cart is refused'), async ({ buyer }) => {
    const r = await buyer.api.checkout(OK);
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Your cart is empty');
  });

  test(tc('TC-CHK-03', 'recipient of exactly 50 characters is accepted'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    const name = 'N'.repeat(50);
    const r = await buyer.api.checkout({ ...OK, recipientName: name });
    expect(r.status).toBe(200);
    expect(r.body.recipientName).toBe(name);
  });

  test(tc('TC-CHK-04', 'recipient of 51 characters is refused'), bug('BUG-14'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    const r = await buyer.api.checkout({ ...OK, recipientName: 'N'.repeat(51) });
    expect(r.status, `stored as ${r.body?.recipientName?.length} characters`).toBe(400);
  });

  test(tc('TC-CHK-05', 'blank recipient is refused'), bug('BUG-16'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    expect((await buyer.api.checkout({ ...OK, recipientName: '   ' })).status).toBe(400);
  });

  test(tc('TC-CHK-06', 'phone with 9 digits is refused'), bug('BUG-15'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    expect((await buyer.api.checkout({ ...OK, phone: '091234567' })).status).toBe(400);
  });

  test(tc('TC-CHK-07', 'phone without digits is refused'), bug('BUG-15'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    expect((await buyer.api.checkout({ ...OK, phone: 'abcdefghij' })).status).toBe(400);
  });

  test(tc('TC-CHK-08', 'phone with exactly 10 digits is accepted'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    expect((await buyer.api.checkout({ ...OK, phone: '0912345678' })).status).toBe(200);
  });

  test(tc('TC-CHK-09', 'student ticket without a card number is refused'), async ({ buyer }) => {
    const { STUDENT } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STUDENT.id, 1);
    for (const studentCardNo of [undefined, '   ']) {
      const r = await buyer.api.checkout({ ...OK, ...(studentCardNo === undefined ? {} : { studentCardNo }) });
      expect(r.status).toBe(400);
      expect(r.body.message).toBe('A student ticket requires a student card number');
    }
  });

  test(tc('TC-CHK-10', 'student ticket with any card value is accepted'), async ({ buyer }) => {
    const { STUDENT } = await ticketTypes(buyer.api, EVENTS.upcoming.id);
    await buyer.api.addToCart(STUDENT.id, 1);
    const r = await buyer.api.checkout({ ...OK, studentCardNo: 'ANY-VALUE-1' });
    expect(r.status).toBe(200);
    expect(r.body.studentCardNo).toBe('ANY-VALUE-1');
  });

  test(tc('TC-CHK-11', 'a past event cannot be booked through the API'), bug('BUG-09'), async ({ buyer }) => {
    const past = await ticketTypes(buyer.api, EVENTS.past.id);
    expect(past.event.status).toBe('PAST');
    const add = await buyer.api.addToCart(past.STANDARD.id, 1);
    const o = add.status === 200 ? await buyer.api.checkout(OK) : add;
    expect(o.status, 'a CONFIRMED order for a past event must not exist').toBeGreaterThanOrEqual(400);
  });
});

test.describe('Orders and ownership', () => {
  test(tc('TC-ORD-01', 'my orders lists only my own orders'), async ({ buyer, secondBuyer }) => {
    await buyStandard(buyer.api);
    const o = (await buyer.api.checkout(OK)).body;
    const mine = (await buyer.api.orders()).body.items.map((x: any) => x.id);
    expect(mine).toEqual([o.id]);
    expect((await secondBuyer.api.orders()).body.items).toEqual([]);
  });

  test(tc('TC-ORD-02', 'order detail is readable by its owner'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    const o = (await buyer.api.checkout(OK)).body;
    const r = await buyer.api.order(o.id);
    expect(r.status).toBe(200);
    expect(r.body.totalAmount).toBe(o.totalAmount);
  });

  test(tc('TC-ORD-03', 'another customer cannot read my order'), bug('BUG-03'), async ({ buyer, secondBuyer }) => {
    await buyStandard(buyer.api);
    const o = (await buyer.api.checkout(OK)).body;
    const r = await secondBuyer.api.order(o.id);
    expect([403, 404]).toContain(r.status);
    expect(r.text).not.toContain(VALID_PHONE);
  });

  test(tc('TC-ORD-04', 'another customer cannot cancel my order'), bug('BUG-02'), async ({ buyer, secondBuyer }) => {
    await buyStandard(buyer.api);
    const o = (await buyer.api.checkout(OK)).body;
    const r = await secondBuyer.api.cancelOrder(o.id);
    const after = (await buyer.api.order(o.id)).body;
    expect.soft(after.status, "owner's order status after a stranger's cancel").toBe('CONFIRMED');
    expect([403, 404]).toContain(r.status);
  });
});

test.describe('Cart ownership', () => {
  test(tc('TC-ORD-05', 'another customer cannot change a line in my cart'), async ({ buyer, secondBuyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    const line = (await buyer.api.addToCart(STANDARD.id, 2)).body.items[0];
    const r = await secondBuyer.api.updateCartItem(line.id, 3);
    expect([403, 404]).toContain(r.status);
    expect((await buyer.api.cart()).body.items[0].quantity).toBe(2);
  });
});

test.describe('Cancellation and refunds', () => {
  test(tc('TC-CAN-01', 'cancelling more than 24 h ahead refunds 100% and returns stock'), async ({ buyer }) => {
    const event = (await buyer.api.getEvent(EVENTS.quiet.id)).body;
    expect(new Date(event.startsAt).getTime() - Date.now(), 'precondition: the event starts more than 24 h from now').toBeGreaterThan(24 * 3_600_000);
    const std = await buyStandard(buyer.api, 2, EVENTS.quiet.id);
    const o = (await buyer.api.checkout(OK)).body;
    const before = await remaining(buyer.api, EVENTS.quiet.id, std.id);
    const r = await buyer.api.cancelOrder(o.id);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELLED');
    expect(r.body.refundAmount).toBe(expectedRefund(o.totalAmount, new Date(), new Date(event.startsAt)));
    expect(r.body.refundAmount).toBe(o.totalAmount);
    expect(await remaining(buyer.api, EVENTS.quiet.id, std.id)).toBeGreaterThanOrEqual(before + 2);
  });

  test(tc('TC-CAN-02', 'a cancelled order cannot be cancelled again'), bug('BUG-11'), async ({ buyer }) => {
    // The quiet event: no other test in this run touches its stock, so the delta is ours alone.
    const std = await buyStandard(buyer.api, 2, EVENTS.quiet.id);
    const o = (await buyer.api.checkout(OK)).body;
    expect((await buyer.api.cancelOrder(o.id)).status).toBe(200);
    const before = await remaining(buyer.api, EVENTS.quiet.id, std.id);
    const again = await buyer.api.cancelOrder(o.id);
    const after = await remaining(buyer.api, EVENTS.quiet.id, std.id);
    expect.soft(after - before, 'stock returned by the second cancel').toBe(0);
    expect(again.status).toBeGreaterThanOrEqual(400);
  });

  test(tc('TC-CAN-03', 'cancelling after the start refunds 0%'), bug('BUG-10'), async ({ buyer }) => {
    const past = await ticketTypes(buyer.api, EVENTS.past.id);
    await buyer.api.addToCart(past.STANDARD.id, 1);
    const o = await buyer.api.checkout(OK);
    test.skip(o.status !== 200, 'past event could not be booked (BUG-09 fixed), so there is nothing to cancel');
    const r = await buyer.api.cancelOrder(o.body.id);
    // Either outcome satisfies the brief: the cancel is refused, or it refunds 0%. Both are asserted explicitly.
    const refund = r.status === 200 ? r.body.refundAmount : 0;
    expect(r.status === 200 || (r.status >= 400 && r.status < 500), `cancel status ${r.status}`).toBe(true);
    expect(refund).toBe(expectedRefund(o.body.totalAmount, new Date(), new Date(past.event.startsAt)));
  });

  test(tc('TC-CAN-04', 'cancelling within 24 h refunds 50%'), async () => {
    test.skip(true, 'GAP-08: no event starts within 24 h and only an administrator can create one; not substituted with another event');
  });

  test(tc('TC-CAN-05', 'cancelling an unknown order returns 404'), async ({ buyer }) => {
    expect((await buyer.api.cancelOrder(999999)).status).toBe(404);
  });
});

test.describe('Administration is admin-only', () => {
  test(tc('TC-ADM-01', 'customer cannot list all orders'), async ({ buyer }) => {
    expect((await buyer.api.adminOrders({ status: 'CONFIRMED' })).status).toBe(403);
  });

  test(tc('TC-ADM-02', 'customer cannot export orders as CSV'), async ({ buyer }) => {
    const r = await buyer.api.adminOrdersCsv();
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).not.toMatch(/csv/);
  });

  test(tc('TC-ADM-03', 'customer cannot create an event'), async ({ buyer }) => {
    // A valid body that reuses an existing event's slug: if the guard were missing, the unique slug would still
    // stop a junk event appearing on the shared site. (An incomplete body gets 400: the server validates before
    // it authorises, noted as OBS-05.)
    const existing = (await buyer.api.getEvent(EVENTS.upcoming.id)).body;
    const r = await buyer.api.createEvent({ slug: existing.slug, title: existing.title, venue: existing.venue, startsAt: existing.startsAt });
    expect(r.status).toBe(403);
  });

  test(tc('TC-ADM-04', 'customer cannot edit an event'), bug('BUG-01'), async ({ buyer }) => {
    // The event's own current values: an edit that changes nothing, whether PUT merges or replaces.
    const before = (await buyer.api.getEvent(EVENTS.upcoming.id)).body;
    const { slug, title, venue, startsAt } = before;
    const r = await buyer.api.updateEvent(EVENTS.upcoming.id, { slug, title, venue, startsAt });
    const after = (await buyer.api.getEvent(EVENTS.upcoming.id)).body;
    const fields = (e: any) => ({ slug: e.slug, title: e.title, venue: e.venue, startsAt: e.startsAt, status: e.status });
    expect.soft(fields(after), 'the event is unchanged').toEqual(fields(before)); // stock may move with other buyers
    expect(r.status).toBe(403);
  });

  test(tc('TC-ADM-05', 'customer cannot delete an event'), async ({ buyer }) => {
    expect((await buyer.api.deleteEvent(999999)).status).toBe(403);
  });

  test(tc('TC-ADM-06', 'customer cannot adjust ticket stock'), async ({ buyer }) => {
    const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
    expect((await buyer.api.updateTicketType(STANDARD.id, { remaining: STANDARD.remaining })).status).toBe(403);
  });

  test(tc('TC-ADM-07', 'customer cannot delete an order through the admin route'), async ({ buyer }) => {
    await buyStandard(buyer.api);
    const o = (await buyer.api.checkout(OK)).body;
    expect((await buyer.api.adminDeleteOrder(o.id)).status).toBe(403);
    expect((await buyer.api.order(o.id)).status).toBe(200);
  });

  test(tc('TC-ADM-08', 'anonymous callers get 401 on every admin route'), async ({ anon }) => {
    const calls = [
      anon.adminOrders(), anon.adminOrdersCsv(), anon.adminDeleteOrder(999999), anon.createEvent({}),
      anon.updateEvent(999999, {}), anon.deleteEvent(999999), anon.updateTicketType(999999, { remaining: 0 }),
    ];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
  });
});
