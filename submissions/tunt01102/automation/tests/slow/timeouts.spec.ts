import { EVENTS, VALID_PHONE, VALID_RECIPIENT } from '../../src/data/factory';
import { CART_HOLD_MINUTES, SESSION_MINUTES } from '../../src/spec/pricing';
import { bug, expect, test, ticketTypes, tc } from '../support/fixtures';

// Real waits, run on demand (npm run test:slow). The server clock cannot be moved from outside, so time has to pass.
test.describe.configure({ mode: 'parallel' });

test(tc('TC-AUTH-06', 'a session older than 30 minutes is refused'), bug('BUG-13'), async ({ buyer }) => {
  test.setTimeout((SESSION_MINUTES + 5) * 60_000);
  expect((await buyer.api.me()).status).toBe(200); // the session works before the wait, so a 401 later means expiry
  await new Promise((r) => setTimeout(r, (SESSION_MINUTES + 1) * 60_000));
  expect((await buyer.api.me()).status).toBe(401);
});

test(tc('TC-CHK-12', 'checkout after the 10 minute hold has lapsed is refused'), bug('BUG-12'), async ({ buyer }) => {
  test.setTimeout((CART_HOLD_MINUTES + 5) * 60_000);
  const { STANDARD } = await ticketTypes(buyer.api, EVENTS.upcoming2.id);
  const added = await buyer.api.addToCart(STANDARD.id, 1);
  expect(added.status).toBe(200);
  const hold = new Date(added.body.holdExpiresAt).getTime();
  await new Promise((r) => setTimeout(r, Math.max(0, hold - Date.now()) + 30_000));
  const r = await buyer.api.checkout({ recipientName: VALID_RECIPIENT, phone: VALID_PHONE });
  expect(r.status, 'checkout 30 s after holdExpiresAt').toBeGreaterThanOrEqual(400);
});
