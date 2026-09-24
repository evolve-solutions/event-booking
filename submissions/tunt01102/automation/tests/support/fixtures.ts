import { test as base, expect, type BrowserContext } from '@playwright/test';
import { ApiClient, BASE_URL } from '../../src/api/client';
import { newBuyer, type Buyer } from '../../src/data/factory';
import type { CartLine, TicketTypeName } from '../../src/spec/pricing';

export { expect };
import type { BugId, TcId } from './ids';

/** Ticket type ids resolved from the live event, never hard-coded (PRINCIPLES 32). */
export async function ticketTypes(api: ApiClient, eventId: number) {
  const r = await api.getEvent(eventId);
  expect(r.status, `event ${eventId} must exist`).toBe(200);
  const byName = Object.fromEntries(r.body.ticketTypes.map((t: any) => [t.name, t])) as Record<TicketTypeName, { id: number; price: number; remaining: number }>;
  expect(Object.keys(byName).sort()).toEqual(['STANDARD', 'STUDENT', 'VIP']);
  return { event: r.body, ...byName };
}

export function linesOf(cart: any): CartLine[] {
  return cart.items.map((i: any) => ({ ticketTypeName: i.ticketTypeName, unitPrice: i.unitPrice, quantity: i.quantity }));
}

/** Puts an API session into a browser context so UI tests start logged in. */
export async function signInBrowser(context: BrowserContext, api: ApiClient) {
  const token = api.sessionToken;
  if (!token) throw new Error('buyer has no session');
  await context.addCookies([{ name: 'token', value: token, url: BASE_URL, httpOnly: true, secure: true, sameSite: 'Strict' }]);
}

interface Fixtures {
  buyer: Buyer;
  secondBuyer: Buyer;
  anon: ApiClient;
}

/** Every order a test creates is cancelled afterwards, once, so shared stock returns to where it was. */
async function cleanup(b: Buyer) {
  const r = await b.api.orders();
  for (const o of r.body?.items ?? []) if (o.status === 'CONFIRMED') await b.api.cancelOrder(o.id);
}

export const test = base.extend<Fixtures>({
  buyer: async ({}, use) => {
    const b = await newBuyer();
    await use(b);
    await cleanup(b);
  },
  secondBuyer: async ({}, use) => {
    const b = await newBuyer();
    await use(b);
    await cleanup(b);
  },
  anon: async ({}, use) => use(new ApiClient()),
});

/** Declares the bug a test is expected to expose. The test still fails on the bug: nothing is marked expected-to-fail. */
export const bug = (...ids: BugId[]) => ({ annotation: ids.map((id) => ({ type: 'bug', description: id })) });

/** Test title carrying its catalogue id; an id not in spec/test-cases.json does not compile. */
export const tc = (id: TcId, title: string) => `[${id}] ${title}`;
