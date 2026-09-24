import { expect, test } from '@playwright/test';
import { EVENTS } from '../../src/data/factory';
import { expectedTotals } from '../../src/spec/pricing';
import { recordEvidence, type Evidence } from './evidence';

// One test per bug. A test passes when the bug REPRODUCES, and writes assets/BUG-xx/{recording.webm, screenshot.png,
// network.har, log.json}. A test that fails here means the bug no longer reproduces: that is news, not noise.
const OK = { recipientName: 'QA Buyer', phone: '0912345678' };
test.describe.configure({ mode: 'parallel' });

async function uiAdd(ev: Evidence, eventId: number, type: string, qty: number) {
  await ev.page.goto(`/events/${eventId}`);
  await ev.page.getByTestId(`event-detail-ticket-${type}-qty`).fill(String(qty));
  await ev.page.getByTestId(`event-detail-ticket-${type}-add-button`).click();
  await ev.page.waitForTimeout(800);
}

async function uiApplyCode(ev: Evidence, code: string) {
  await ev.page.getByTestId('cart-discount-input').fill(code);
  await ev.page.getByTestId('cart-apply-discount-button').click();
  await ev.page.waitForTimeout(800);
}

test('[BUG-01] customer can edit an event via PUT', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-01', async (ev) => {
    await ev.step('Log in as a fresh ordinary customer');
    await ev.newBuyer();
    await ev.api('GET', '/api/auth/me');
    await ev.step('Every other admin route from the same customer session (incomplete or no-op bodies only)');
    const t = await ev.tickets(EVENTS.upcoming.id);
    const others = {
      'POST /api/events': (await ev.api('POST', '/api/events', { slug: t.event.slug, title: t.event.title, venue: t.event.venue, startsAt: t.event.startsAt })).status,
      'DELETE /api/events/999999': (await ev.api('DELETE', '/api/events/999999')).status,
      'PATCH /api/ticket-types/{id}': (await ev.api('PATCH', `/api/ticket-types/${t.STANDARD.id}`, { remaining: t.STANDARD.remaining })).status,
      'GET /api/admin/orders': (await ev.api('GET', '/api/admin/orders')).status,
      'GET /api/admin/orders.csv': (await ev.api('GET', '/api/admin/orders.csv')).status,
      'DELETE /api/admin/orders/999999': (await ev.api('DELETE', '/api/admin/orders/999999')).status,
    };
    await ev.step("Admin-only edit, sending the event's own current values (changes nothing)");
    const { slug, title, venue, startsAt } = t.event;
    const put = await ev.api('PUT', `/api/events/${EVENTS.upcoming.id}`, { slug, title, venue, startsAt });
    const summary = `PUT ${put.status}; ${Object.entries(others).map(([k, v]) => `${k} ${v}`).join(', ')}`;
    await ev.verdict('PUT returns 403 like every other admin route', summary);
    await ev.snap();
    return { reproduced: put.status === 200 && Object.values(others).every((v) => v === 403), summary };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-02] a customer can cancel another customer\'s order', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-02', async (ev) => {
    await ev.step('Buyer A buys 1 Standard');
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const order = await ev.api('POST', '/api/orders', OK);
    await ev.step('Log out; log in as buyer B (a different account)');
    await ev.api('POST', '/api/auth/logout');
    await ev.newBuyer();
    await ev.step(`Buyer B cancels A's order ${order.body.id}`);
    const cancel = await ev.api('POST', `/api/orders/${order.body.id}/cancel`);
    await ev.verdict('403 or 404; A\'s order stays CONFIRMED', `${cancel.status}, status ${cancel.body?.status}`);
    await ev.snap();
    return { reproduced: cancel.status === 200 && cancel.body?.status === 'CANCELLED', summary: `B cancel -> ${cancel.status} ${cancel.body?.status}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-03] a customer can read another customer\'s order', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-03', async (ev) => {
    await ev.step('Buyer A buys 1 Standard with recipient "QA Buyer", phone 0912345678');
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const order = await ev.api('POST', '/api/orders', OK);
    await ev.api('POST', '/api/auth/logout');
    await ev.step('Buyer B reads order by id');
    await ev.newBuyer();
    const read = await ev.api('GET', `/api/orders/${order.body.id}`);
    await ev.verdict('403 or 404', `${read.status} with recipient "${read.body?.recipientName}" and phone ${read.body?.phone}`);
    await ev.snap();
    await ev.step('Clean-up as the owner');
    await ev.api('POST', `/api/orders/${order.body.id}/cancel`);
    return { reproduced: read.status === 200 && read.body?.phone === OK.phone, summary: `B read -> ${read.status}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-04] cart accepts zero and negative quantities', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-04', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming.id);
    const zero = await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 0 });
    const neg = await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: -1 });
    await ev.step('Open the cart in the UI');
    await ev.page.goto('/cart');
    await ev.page.waitForTimeout(800);
    await ev.verdict('Both adds 400; cart empty', `adds ${zero.status}/${neg.status}; cart total ${neg.body?.total}`);
    await ev.snap();
    return { reproduced: zero.status === 200 && neg.status === 200 && neg.body.total < 0, summary: `total ${neg.body?.total}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-05] the same discount code stacks', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-05', async (ev) => {
    await ev.newBuyer();
    await ev.step('Add 2 Standard in the UI');
    await uiAdd(ev, EVENTS.upcoming.id, 'STANDARD', 2);
    await ev.page.goto('/cart');
    await ev.step('Apply WELCOME10 three times in the UI');
    for (let i = 0; i < 3; i++) await uiApplyCode(ev, 'WELCOME10');
    const cart = await ev.api('GET', '/api/cart');
    await ev.verdict('discount 10% once', `code "${cart.body.discountCode}", discount ${cart.body.discount} of gross ${cart.body.gross}`);
    await ev.snap();
    return { reproduced: String(cart.body.discountCode).includes(','), summary: `code ${cart.body.discountCode}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-06] discount reduces VIP tickets', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-06', async (ev) => {
    await ev.newBuyer();
    await ev.step('Add 1 VIP only');
    await uiAdd(ev, EVENTS.upcoming.id, 'VIP', 1);
    await ev.page.goto('/cart');
    await uiApplyCode(ev, 'WELCOME10');
    const cart = await ev.api('GET', '/api/cart');
    await ev.verdict('discount 0 (codes apply to Standard only)', `discount ${cart.body.discount}`);
    await ev.snap();
    return { reproduced: cart.body.discount > 0, summary: `discount ${cart.body.discount}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-07] service fee is charged before the discount', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-07', async (ev) => {
    await ev.newBuyer();
    await uiAdd(ev, EVENTS.upcoming.id, 'STANDARD', 2);
    await ev.page.goto('/cart');
    await uiApplyCode(ev, 'WELCOME10');
    const cart = await ev.api('GET', '/api/cart');
    const want = expectedTotals(cart.body.items.map((i: any) => ({ ticketTypeName: i.ticketTypeName, unitPrice: i.unitPrice, quantity: i.quantity })), 'WELCOME10');
    await ev.verdict(`fee ${want.serviceFee}, total ${want.total}`, `fee ${cart.body.serviceFee}, total ${cart.body.total}`);
    await ev.snap();
    // The specific defect: the fee equals 5% of the gross, i.e. it was charged before the discount.
    return { reproduced: cart.body.discount === want.discount && cart.body.serviceFee === Math.round(cart.body.gross * 0.05) && cart.body.serviceFee !== want.serviceFee, summary: `fee ${cart.body.serviceFee} = 5% of gross ${cart.body.gross}; spec ${want.serviceFee}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-08] five VIP tickets are accepted', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-08', async (ev) => {
    await ev.newBuyer();
    await ev.step('Add 5 VIP in the UI');
    await uiAdd(ev, EVENTS.upcoming.id, 'VIP', 5);
    const cart = await ev.api('GET', '/api/cart');
    await ev.page.goto('/cart');
    const qty = cart.body.items.find((i: any) => i.ticketTypeName === 'VIP')?.quantity ?? 0;
    await ev.verdict('Fifth VIP refused: at most 4 per order', `cart holds ${qty} VIP`);
    await ev.snap();
    return { reproduced: qty === 5, summary: `${qty} VIP` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-09] a past event can be booked through the API', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-09', async (ev) => {
    await ev.newBuyer();
    await ev.step('The past event shows no Add button in the UI');
    await ev.page.goto(`/events/${EVENTS.past.id}`);
    await ev.page.waitForTimeout(800);
    const t = await ev.tickets(EVENTS.past.id);
    await ev.step('Add its Standard ticket through the API, then check out in the UI');
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.page.goto('/checkout');
    await ev.page.getByTestId('checkout-recipient-input').fill(OK.recipientName);
    await ev.page.getByTestId('checkout-phone-input').fill(OK.phone);
    await ev.page.getByTestId('checkout-pay-button').click();
    await ev.page.waitForTimeout(1500);
    const status = (await ev.page.getByTestId('order-confirm-status').innerText().catch(() => '')).trim();
    await ev.verdict(`Refused: ${t.event.title} is ${t.event.status}`, `order ${status || 'not created'}`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: status === 'CONFIRMED', summary: status };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-10] cancelling after the start refunds 100%', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-10', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.past.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const o = await ev.api('POST', '/api/orders', OK);
    await ev.step(`Cancel from My Orders; the event started ${t.event.startsAt}`);
    ev.page.on('dialog', (d) => d.accept());
    await ev.page.goto('/my-orders');
    await ev.page.getByTestId(`my-orders-cancel-button-${o.body.id}`).click();
    await ev.page.waitForTimeout(1200);
    const after = await ev.api('GET', `/api/orders/${o.body.id}`);
    await ev.verdict('refund 0', `refund ${after.body.refundAmount} of ${after.body.totalAmount}`);
    await ev.snap();
    return { reproduced: after.body.refundAmount === after.body.totalAmount && after.body.totalAmount > 0, summary: `refund ${after.body.refundAmount}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-11] repeated cancels return stock again each time', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-11', async (ev) => {
    await ev.newBuyer();
    // The quiet event: no other evidence test touches its stock, so the delta is this test's alone.
    const t = await ev.tickets(EVENTS.quiet.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const o = await ev.api('POST', '/api/orders', OK);
    const r = (await ev.tickets(EVENTS.quiet.id)).STANDARD.remaining;
    await ev.step(`Bought 1 ticket; remaining R = ${r}`);
    await ev.api('POST', `/api/orders/${o.body.id}/cancel`);
    const afterFirst = (await ev.tickets(EVENTS.quiet.id)).STANDARD.remaining;
    await ev.step(`First cancel: remaining ${afterFirst} (expected R + 1 = ${r + 1})`);
    const again = await ev.api('POST', `/api/orders/${o.body.id}/cancel`);
    const afterSecond = (await ev.tickets(EVENTS.quiet.id)).STANDARD.remaining;
    const summary = `R ${r}; after cancel ${afterFirst}; second cancel ${again.status}; after second cancel ${afterSecond}`;
    await ev.verdict(`second cancel refused; remaining stays ${r + 1}`, summary);
    await ev.snap();
    return { reproduced: again.status === 200 && afterSecond === afterFirst + 1, summary };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-14] recipient over 50 characters is silently truncated', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-14', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const name = 'Nguyen Thi Bich Ngoc Tran Van Minh Hoang Le Pham Quy'; // 51 characters
    const o = await ev.api('POST', '/api/orders', { ...OK, recipientName: name });
    await ev.page.goto(`/orders/${o.body.id}/confirm`);
    await ev.page.waitForTimeout(800);
    await ev.verdict(`400 for ${name.length} characters`, `${o.status}; stored "${o.body?.recipientName}" (${o.body?.recipientName?.length})`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: o.status === 200 && o.body.recipientName.length === 50, summary: `${o.body?.recipientName?.length} chars` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-15] checkout accepts a 9 digit phone', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-15', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.page.goto('/checkout');
    await ev.page.getByTestId('checkout-recipient-input').fill(OK.recipientName);
    await ev.page.getByTestId('checkout-phone-input').fill('091234567');
    await ev.page.getByTestId('checkout-pay-button').click();
    await ev.page.waitForTimeout(1500);
    const status = (await ev.page.getByTestId('order-confirm-status').innerText().catch(() => '')).trim();
    await ev.verdict('Refused: at least 10 digits', `order ${status || 'not created'} with phone 091234567`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: status === 'CONFIRMED', summary: status };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-16] checkout accepts a blank recipient', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-16', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const o = await ev.api('POST', '/api/orders', { ...OK, recipientName: '   ' });
    await ev.verdict('400', `${o.status} ${o.body?.status}`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: o.status === 200, summary: `${o.status}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-17] registration accepts malformed emails', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-17', async (ev) => {
    const email = `not-an-email-${Date.now().toString(36)}`;
    const reg = await ev.api('POST', '/api/auth/register', { email, password: 'eventpass123' });
    await ev.api('POST', '/api/auth/login', { email, password: 'eventpass123' });
    await ev.page.goto('/profile');
    await ev.page.waitForTimeout(800);
    await ev.verdict('400: not a well-formed address', `${reg.status}; logged in as "${email}"`);
    await ev.snap();
    return { reproduced: reg.status === 200, summary: `${reg.status}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-18] profile accepts a phone made of letters', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-18', async (ev) => {
    const email = await ev.newBuyer();
    await ev.page.goto('/profile');
    await expect(ev.page.getByTestId('profile-email')).toHaveText(email); // form is loaded, so typing is not overwritten
    await ev.page.getByTestId('profile-phone-input').fill('abcdefghij');
    await ev.page.getByTestId('profile-save-button').click();
    await ev.page.waitForTimeout(1000);
    const p = await ev.api('GET', '/api/profile');
    await ev.verdict('Refused: 10 to 15 digits', `stored phone "${p.body.phone}"`);
    await ev.snap();
    return { reproduced: p.body.phone === 'abcdefghij', summary: p.body.phone };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-19] duplicate account through a leading space', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-19', async (ev) => {
    const email = `qa-ev-dup-${Date.now().toString(36)}@example.invalid`;
    const first = await ev.api('POST', '/api/auth/register', { email, password: 'eventpass123' });
    const upper = await ev.api('POST', '/api/auth/register', { email: email.toUpperCase(), password: 'eventpass123' });
    const spaced = await ev.api('POST', '/api/auth/register', { email: ` ${email}`, password: 'eventpass123' });
    await ev.verdict('409 for both variants', `upper ${upper.status}, leading space ${spaced.status} (new id ${spaced.body?.id} vs ${first.body?.id})`);
    await ev.snap();
    return { reproduced: upper.status === 409 && spaced.status === 200, summary: `${spaced.status}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-20] new password equal to the current one is accepted', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-20', async (ev) => {
    const email = await ev.newBuyer();
    await ev.page.goto('/profile');
    await expect(ev.page.getByTestId('profile-email')).toHaveText(email);
    await ev.page.getByTestId('profile-current-password-input').fill('eventpass123');
    await ev.page.getByTestId('profile-new-password-input').fill('eventpass123');
    await ev.page.getByTestId('profile-change-password-button').click();
    await ev.page.waitForTimeout(1000);
    const read = async (id: string) => ((await ev.page.getByTestId(id).count()) ? (await ev.page.getByTestId(id).innerText()).trim() : '');
    const msg = await read('profile-message');
    const err = await read('profile-error');
    await ev.verdict('Refused: must differ from the current one', `message "${msg}" error "${err}"`);
    await ev.snap();
    return { reproduced: /changed/i.test(msg) && !err, summary: msg };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-21] search "rock" finds nothing', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-21', async (ev) => {
    await ev.page.getByTestId('events-search-input').fill('rock');
    await ev.page.getByTestId('events-search-button').click();
    await ev.page.waitForTimeout(1200);
    const n = await ev.page.locator('[data-testid^="events-item-title-"]').count();
    const api = await ev.api('GET', '/api/events?q=rock');
    const prefix = await ev.api('GET', '/api/events?q=hanoi%20rock');
    await ev.verdict('Hanoi Rock Fest listed', `${n} cards; API total ${api.body.total}; "hanoi rock" total ${prefix.body.total}`);
    await ev.snap();
    return { reproduced: api.body.total === 0 && prefix.body.total === 1, summary: `q=rock total ${api.body.total} (${n} cards); q=hanoi rock total ${prefix.body.total}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-22] search "%" returns every event', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-22', async (ev) => {
    await ev.page.getByTestId('events-search-input').fill('%');
    await ev.page.getByTestId('events-search-button').click();
    await ev.page.waitForTimeout(1200);
    const api = await ev.api('GET', '/api/events?q=%25');
    await ev.verdict('0 events', `${api.body.total} events`);
    await ev.snap();
    return { reproduced: api.body.total > 0, summary: `${api.body.total}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-23] sort by name is per page', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-23', async (ev) => {
    const all = (await ev.api('GET', '/api/events?pageSize=100')).body.items as { id: number; title: string }[];
    const want = [...all].sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }))[0].title;
    const sorted = ev.page.waitForResponse((r) => r.url().includes('sort=title'));
    await ev.page.getByTestId('events-sort-select').selectOption('title');
    await sorted;
    const first = await ev.page.locator('[data-testid^="events-item-title-"]').first().innerText();
    const p1 = (await ev.api('GET', '/api/events?sort=title&page=1')).body.items.map((e: any) => e.id);
    const p2 = (await ev.api('GET', '/api/events?sort=title&page=2')).body.items.map((e: any) => e.id);
    await ev.verdict(`First card "${want}"`, `First card "${first}"; API sort=title page 1 ids ${p1.join(',')}, page 2 ids ${p2.join(',')}`);
    await ev.snap();
    return { reproduced: first !== want, summary: `first "${first}", expected "${want}"` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-24] paging repeats an event', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-24', async (ev) => {
    const cards = ev.page.locator('[data-testid^="events-item-title-"]');
    await expect(cards.first()).toBeVisible();
    const first1 = await cards.first().innerText();
    const last1 = await cards.last().innerText();
    await ev.step(`Last card on page 1: ${last1}`);
    await ev.page.getByTestId('events-next-button').click();
    await expect(cards.first()).not.toHaveText(first1);
    await ev.api('GET', '/api/events?page=1');
    await ev.api('GET', '/api/events?page=2');
    const first2 = await cards.first().innerText();
    await ev.verdict('Page 2 starts with a new event', `Page 2 starts with "${first2}"`);
    await ev.snap();
    return { reproduced: first2 === last1, summary: first2 };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-25] at 360 px Add is off screen', async ({ browser }) => {
  const r = await recordEvidence(
    browser,
    'BUG-25',
    async (ev) => {
      await ev.newBuyer();
      await ev.page.goto(`/events/${EVENTS.upcoming.id}`);
      const add = ev.page.getByTestId('event-detail-ticket-STANDARD-add-button');
      await add.waitFor({ state: 'attached' });
      await ev.page.getByTestId('event-detail-ticket-STANDARD').scrollIntoViewIfNeeded();
      const box = await add.boundingBox();
      await ev.verdict('Quantity and Add inside the 360 px screen', `Add at x=${Math.round(box!.x)}..${Math.round(box!.x + box!.width)}`);
      await ev.snap();
      return { reproduced: box!.x + box!.width > 360, summary: `x=${box!.x}` };
    },
    { viewport: { width: 360, height: 740 }, isMobile: true },
  );
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-26] profile scrolls sideways at 360 px', async ({ browser }) => {
  const r = await recordEvidence(
    browser,
    'BUG-26',
    async (ev) => {
      const email = `nguyenvananh${Date.now()}@example.invalid`;
      await ev.api('POST', '/api/auth/register', { email, password: 'eventpass123' });
      await ev.api('POST', '/api/auth/login', { email, password: 'eventpass123' });
      await ev.page.goto('/profile');
      await expect(ev.page.getByTestId('profile-email')).toHaveText(email);
      const sw = await ev.page.evaluate(() => document.documentElement.scrollWidth);
      await ev.page.evaluate(() => window.scrollTo({ left: 200 }));
      await ev.verdict('scrollWidth <= 360', `scrollWidth ${sw}`);
      await ev.snap();
      return { reproduced: sw > 360, summary: `${sw}` };
    },
    { viewport: { width: 360, height: 740 }, isMobile: true },
  );
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-27] event detail shows the UTC date', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-27', async (ev) => {
    const list = (await ev.page.getByTestId(`events-item-starts-${EVENTS.upcoming.id}`).innerText()).trim();
    await ev.step(`List card shows: ${list}`);
    await ev.page.goto(`/events/${EVENTS.upcoming.id}`);
    const detail = (await ev.page.getByTestId('event-detail-starts').innerText()).trim();
    const e = await ev.api('GET', `/api/events/${EVENTS.upcoming.id}`);
    const utcDate = String(e.body.startsAt).slice(0, 10);
    const vn = new Date(new Date(e.body.startsAt).getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
    await ev.verdict(`Vietnam time ${vn} (startsAt ${e.body.startsAt})`, `detail shows "${detail}"`);
    await ev.snap();
    return { reproduced: detail === utcDate && vn.slice(0, 10) !== utcDate, summary: `"${detail}" vs Vietnam ${vn}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-28] checkout phone label focuses the recipient field', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-28', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.page.goto('/checkout');
    await ev.page.getByText('Phone number', { exact: true }).click();
    const focused = await ev.page.evaluate(() => (document.activeElement as HTMLElement)?.dataset?.testid);
    await ev.page.keyboard.type('typed after clicking the Phone label');
    await ev.verdict('Cursor in checkout-phone-input', `Cursor in ${focused}`);
    await ev.snap();
    return { reproduced: focused === 'checkout-recipient-input', summary: String(focused) };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-29] fields without a visible label', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-29', async (ev) => {
    const search = await ev.page.getByTestId('events-search-input').evaluate((el: any) => el.labels?.length ?? 0);
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.page.goto('/cart');
    const discount = await ev.page.getByTestId('cart-discount-input').evaluate((el: any) => el.labels?.length ?? 0);
    await ev.page.getByTestId('cart-discount-input').evaluate((el: HTMLElement) => (el.style.outline = '3px solid #ff4d4f'));
    await ev.verdict('Every field has a visible <label>', `labels: search ${search}, discount ${discount}`);
    await ev.snap();
    return { reproduced: search === 0 && discount === 0, summary: `${search}/${discount}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-30] confirmation total is a bare number', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-30', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const o = await ev.api('POST', '/api/orders', OK);
    await ev.page.goto(`/orders/${o.body.id}/confirm`);
    const total = (await ev.page.getByTestId('order-confirm-total').innerText()).trim();
    const fee = (await ev.page.getByTestId('order-confirm-service-fee').innerText()).trim();
    await ev.page.getByTestId('order-confirm-total').evaluate((el: HTMLElement) => (el.style.outline = '3px solid #ff4d4f'));
    await ev.verdict('Total like "₫210,000"', `Total "${total}", fee "${fee}"`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: /^\d+$/.test(total), summary: total };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-31] admin event screen renders for a customer', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-31', async (ev) => {
    await ev.newBuyer();
    const me = await ev.api('GET', '/api/auth/me');
    await ev.page.goto('/admin/events');
    await ev.page.waitForTimeout(1500);
    const create = await ev.page.getByTestId('admin-events-create-button').count();
    await ev.verdict('Refused for a CUSTOMER', `role ${me.body.role}; Create buttons visible: ${create}. Nothing was submitted.`);
    await ev.snap();
    return { reproduced: me.body.role === 'CUSTOMER' && create > 0, summary: `${create}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-32] Next stays enabled on the last page', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-32', async (ev) => {
    const cards = ev.page.locator('[data-testid^="events-item-title-"]');
    const total = (await ev.api('GET', '/api/events')).body.total;
    const pages = Math.ceil(total / 10);
    for (let p = 1; p < pages; p++) {
      await expect(cards.first()).toBeVisible();
      const first = await cards.first().innerText();
      await ev.page.getByTestId('events-next-button').click();
      await expect(cards.first()).not.toHaveText(first);
    }
    const enabled = await ev.page.getByTestId('events-next-button').isEnabled();
    await ev.step(`On page ${pages} of ${pages}, Next enabled: ${enabled}. Clicking it.`);
    await ev.page.getByTestId('events-next-button').click();
    await expect(ev.page.getByTestId('events-page')).toHaveText(String(pages + 1));
    const footer = (await ev.page.getByTestId('events-page').innerText()).trim();
    await ev.verdict('Next disabled on the last page', `Next enabled; now on page ${footer} of ${pages} with ${await cards.count()} events`);
    await ev.snap();
    return { reproduced: enabled && footer === String(pages + 1), summary: `page ${footer} of ${pages}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-33] success message stays after a failed add', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-33', async (ev) => {
    await ev.newBuyer();
    await uiAdd(ev, EVENTS.upcoming.id, 'STANDARD', 1);
    await ev.step('Now add 6 VIP, which must fail');
    await ev.page.getByTestId('event-detail-ticket-VIP-qty').fill('6');
    await ev.page.getByTestId('event-detail-ticket-VIP-add-button').click();
    await expect(ev.page.getByTestId('event-detail-error')).toBeVisible();
    const msg = (await ev.page.getByTestId('event-detail-message').count()) ? (await ev.page.getByTestId('event-detail-message').innerText()).trim() : '';
    const err = (await ev.page.getByTestId('event-detail-error').innerText()).trim();
    await ev.verdict('Only the VIP error is shown', `message "${msg}" and error "${err}"`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: /added to cart/i.test(msg) && err.length > 0, summary: `"${msg}" + "${err}"` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-34] removing the last cart line leaves the old total', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-34', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.page.goto('/cart');
    const qty = ev.page.locator('[data-testid^="cart-item-qty-"]').first();
    await expect(qty).toBeVisible();
    await ev.step('Set the only line to 0');
    const patched = ev.page.waitForResponse((res) => res.url().includes('/api/cart/items/') && res.request().method() === 'PATCH');
    await qty.fill('0');
    await qty.press('Tab');
    await patched;
    await expect(ev.page.getByTestId('cart-empty')).toBeVisible();
    const shown = (await ev.page.getByTestId('cart-total').count()) ? (await ev.page.getByTestId('cart-total').innerText()).trim() : '(none)';
    const api = await ev.api('GET', '/api/cart');
    await ev.verdict('Empty cart, no total above ₫0', `empty-cart message shown, Total on screen ${shown}, API total ${api.body.total}`);
    await ev.snap();
    return { reproduced: shown !== '(none)' && /[1-9]/.test(shown) && api.body.total === 0, summary: `screen ${shown}, API ${api.body.total}` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-35] cart line names are clipped', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-35', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.VIP.id, quantity: 1 });
    await ev.page.goto('/cart');
    const names = ev.page.locator('[data-testid^="cart-item-name-"]');
    await expect(names).toHaveCount(2);
    const info = await names.evaluateAll((els) => els.map((e) => ({ text: e.textContent, clipped: e.scrollWidth > e.clientWidth, w: e.clientWidth, full: e.scrollWidth })));
    await names.evaluateAll((els) => els.forEach((e) => ((e as HTMLElement).style.outline = '3px solid #ff4d4f')));
    await ev.verdict('Each line shows event and ticket type in full', info.map((i) => `"${i.text}" shown in ${i.w}px of ${i.full}px`).join('; '));
    await ev.snap();
    return { reproduced: info.every((i) => i.clipped), summary: info.map((i) => `${i.w}/${i.full}px`).join(', ') };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-36] cancelled orders still offer Cancel tickets', async ({ browser }) => {
  const r = await recordEvidence(browser, 'BUG-36', async (ev) => {
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    const o = await ev.api('POST', '/api/orders', OK);
    await ev.api('POST', `/api/orders/${o.body.id}/cancel`);
    await ev.page.goto('/my-orders');
    await expect(ev.page.getByTestId(`my-orders-status-${o.body.id}`)).toHaveText('CANCELLED');
    const buttons = await ev.page.getByTestId(`my-orders-cancel-button-${o.body.id}`).count();
    if (buttons) await ev.page.getByTestId(`my-orders-cancel-button-${o.body.id}`).evaluate((e: HTMLElement) => (e.style.outline = '3px solid #ff4d4f'));
    await ev.verdict('No Cancel button on a CANCELLED order', `status CANCELLED, Cancel buttons: ${buttons} (not clicked, to avoid inflating stock)`);
    await ev.snap();
    return { reproduced: buttons > 0, summary: `${buttons} button(s)` };
  });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-37] phone menu is hidden behind the page', async ({ browser }) => {
  const r = await recordEvidence(
    browser,
    'BUG-37',
    async (ev) => {
      // What is on top at the centre of each menu link, highlighted so the recording shows the covered links.
      const covers = async (ids: string[]) => {
        const cover: Record<string, string> = {};
        for (const id of ids) {
          const link = ev.page.getByTestId(id);
          const box = await link.boundingBox();
          cover[id] = box ? String(await ev.page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-testid]')?.getAttribute('data-testid') ?? 'none', [box.x + box.width / 2, box.y + box.height / 2] as const)) : 'not rendered';
          if (box) await link.evaluate((el: HTMLElement) => (el.style.outline = '3px solid #ff4d4f'));
        }
        return cover;
      };
      await ev.step('Not logged in: open the event list and tap Menu');
      await expect(ev.page.getByTestId('events-title')).toBeVisible();
      await ev.page.getByTestId('nav-menu-button').click();
      await ev.page.waitForTimeout(500);
      const loggedOut = await covers(['nav-login-link']);
      await ev.verdict('Log in is on top and opens the login screen', `nav-login-link under ${loggedOut['nav-login-link']}; no other screen links to login`);
      await ev.snap();
      await ev.newBuyer();
      await ev.page.goto(`/events/${EVENTS.upcoming.id}`);
      await expect(ev.page.getByTestId('event-detail-title')).toBeVisible();
      await ev.page.evaluate(() => window.scrollBy(0, 400)); // mouse.wheel is not supported in mobile WebKit
      await ev.page.getByTestId('nav-menu-button').click();
      await ev.page.waitForTimeout(500);
      const loggedIn = await covers(['nav-cart-link', 'nav-my-orders-link', 'nav-profile-link']);
      const all = { ...loggedOut, ...loggedIn };
      const summary = Object.entries(all).map(([k, v]) => `${k} under ${v}`).join('; ');
      await ev.verdict('Logged in: Cart, My orders and Profile are on top and tappable', Object.entries(loggedIn).map(([k, v]) => `${k} under ${v}`).join('; '));
      await ev.page.waitForTimeout(1500);
      return { reproduced: Object.entries(all).every(([k, v]) => v !== k), summary };
    },
    { viewport: { width: 360, height: 740 }, isMobile: true },
  );
  expect(r.reproduced, r.summary).toBe(true);
});
