import { expect, test } from '@playwright/test';
import { EVENTS } from '../../src/data/factory';
import { recordEvidence } from './evidence';

// Real waits (10 and 30 minutes). Recorded as two short clips sharing one session: the set-up before the
// wait (recording-start.webm) and the check after it (recording.webm). A continuous 30 minute video is
// over 100 MB and shows nothing. Run on demand: npm run test:evidence:timing
test.describe.configure({ mode: 'parallel' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('[BUG-12] checkout succeeds after the cart hold lapsed', async ({ browser }) => {
  test.setTimeout(20 * 60_000);
  let hold = '';
  const start = await recordEvidence(browser, 'BUG-12', async (ev) => {
    await ev.step('Part 1 of 2: add one ticket and note holdExpiresAt');
    await ev.newBuyer();
    const t = await ev.tickets(EVENTS.upcoming2.id);
    const add = await ev.api('POST', '/api/cart/items', { ticketTypeId: t.STANDARD.id, quantity: 1 });
    hold = add.body.holdExpiresAt;
    await ev.page.goto('/cart');
    await ev.step(`Hold expires at ${hold}. Now wait until one minute after it, touching nothing.`);
    await ev.snap();
    return { reproduced: add.status === 200, summary: `hold ${hold}` };
  }, { part: 'start' });
  await wait(Math.max(0, new Date(hold).getTime() - Date.now()) + 60_000);
  const r = await recordEvidence(browser, 'BUG-12', async (ev) => {
    await ev.step(`Part 2 of 2: now ${new Date().toISOString()}, hold expired at ${hold}`);
    await ev.page.goto('/cart');
    await ev.api('GET', '/api/cart');
    const o = await ev.api('POST', '/api/orders', { recipientName: 'QA Buyer', phone: '0912345678' });
    await ev.verdict(`Refused: hold expired at ${hold}`, `${o.status} ${o.body?.status}`);
    await ev.snap();
    await ev.cleanup();
    return { reproduced: o.status === 200, summary: `checkout ${o.status} ${o.body?.status} after hold ${hold}` };
  }, { part: 'end', storageState: start.state });
  expect(r.reproduced, r.summary).toBe(true);
});

test('[BUG-13] session still valid after 30 minutes', async ({ browser }) => {
  test.setTimeout(40 * 60_000);
  let loggedInAt = '';
  const start = await recordEvidence(browser, 'BUG-13', async (ev) => {
    await ev.step('Part 1 of 2: log in; the token says exp = iat + 1800 s');
    await ev.newBuyer();
    loggedInAt = new Date().toISOString();
    const me = await ev.api('GET', '/api/auth/me');
    await ev.page.goto('/profile');
    await ev.step(`Logged in at ${loggedInAt}. Now wait 31 minutes.`);
    await ev.snap();
    return { reproduced: me.status === 200, summary: loggedInAt };
  }, { part: 'start' });
  await wait(31 * 60_000);
  const r = await recordEvidence(browser, 'BUG-13', async (ev) => {
    await ev.step(`Part 2 of 2: now ${new Date().toISOString()}, logged in at ${loggedInAt}`);
    const me = await ev.api('GET', '/api/auth/me');
    const cart = await ev.api('GET', '/api/cart');
    await ev.page.goto('/profile');
    await ev.verdict('401 after 30 minutes', `/me ${me.status}, /cart ${cart.status}`);
    await ev.snap();
    return { reproduced: me.status === 200, summary: `/me ${me.status} 31 min after login at ${loggedInAt}` };
  }, { part: 'end', storageState: start.state });
  expect(r.reproduced, r.summary).toBe(true);
});
