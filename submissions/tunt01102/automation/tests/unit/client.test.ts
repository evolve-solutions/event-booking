import { describe, expect, it, vi } from 'vitest';
import { ApiClient, redact, type FetchLike } from '../../src/api/client';
import { newBuyer, uniqueEmail } from '../../src/data/factory';

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: string; setCookie?: string[] }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    const r = handler(url, init);
    const headers = new Headers();
    for (const c of r.setCookie ?? []) headers.append('set-cookie', c);
    return new Response(r.body ?? '', { status: r.status ?? 200, headers });
  };
  return { impl, calls };
}

describe('ApiClient', () => {
  it('stores the session cookie from login and sends it afterwards', async () => {
    const { impl, calls } = fakeFetch((url) =>
      url.endsWith('/api/auth/login')
        ? { body: '{"id":1}', setCookie: ['token=abc.def.ghi; Path=/; HttpOnly; Secure; SameSite=Strict'] }
        : { body: '{"id":1,"email":"x"}' },
    );
    const api = new ApiClient('https://sut', impl);
    await api.login('x@example.invalid', 'eventpass123');
    expect(api.sessionToken).toBe('abc.def.ghi');
    await api.me();
    expect((calls[1].init.headers as Record<string, string>).cookie).toBe('token=abc.def.ghi');
  });

  it('drops a cookie the server clears', async () => {
    const { impl } = fakeFetch(() => ({ body: '{"ok":true}', setCookie: ['token=; Path=/; Max-Age=0'] }));
    const api = new ApiClient('https://sut', impl);
    api.setCookie('token', 'old');
    await api.logout();
    expect(api.sessionToken).toBeUndefined();
  });

  it('ignores malformed cookie lines and keeps cookie-less requests header-free', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: '', setCookie: ['=nothing'] }));
    const api = new ApiClient('https://sut', impl);
    const r = await api.health();
    expect(r.body).toBeNull();
    expect((calls[0].init.headers as Record<string, string>).cookie).toBeUndefined();
    api.setCookie('a', '1');
    api.clearCookies();
    expect(api.cookieHeader).toBe('');
  });

  it('keeps non-JSON bodies as text', async () => {
    const { impl } = fakeFetch(() => ({ body: 'User-agent: *\nDisallow: /' }));
    const r = await new ApiClient('https://sut', impl).robots();
    expect(r.body).toContain('Disallow: /');
  });

  it('builds every documented route with the right method and path', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: '{}' }));
    const a = new ApiClient('https://sut', impl);
    await Promise.all([
      a.config(), a.openapi(), a.register({ email: 'e', password: 'p' }), a.listEvents(), a.listEvents({ q: 'rock', page: 2 }),
      a.getEvent(7), a.createEvent({}), a.updateEvent(7, {}), a.deleteEvent(7), a.updateTicketType(19, { remaining: 1 }),
      a.cart(), a.addToCart(19, 1), a.updateCartItem(3, 2), a.applyDiscount('WELCOME10'),
      a.checkout({ recipientName: 'r', phone: '0912345678' }), a.orders(), a.order(9), a.cancelOrder(9),
      a.profile(), a.updateProfile({ phone: '0912345678' }), a.changePassword('a', 'b'),
      a.adminOrders(), a.adminOrders({ status: 'CONFIRMED' }), a.adminOrdersCsv(), a.adminOrdersCsv({ status: 'CANCELLED' }), a.adminDeleteOrder(9),
    ]);
    const seen = calls.map((c) => `${c.init.method} ${c.url.replace('https://sut', '')}`);
    expect(seen).toEqual(expect.arrayContaining([
      'GET /api/config', 'GET /docs/json', 'POST /api/auth/register', 'GET /api/events', 'GET /api/events?q=rock&page=2',
      'GET /api/events/7', 'POST /api/events', 'PUT /api/events/7', 'DELETE /api/events/7', 'PATCH /api/ticket-types/19',
      'GET /api/cart', 'POST /api/cart/items', 'PATCH /api/cart/items/3', 'POST /api/cart/discount', 'POST /api/orders',
      'GET /api/orders', 'GET /api/orders/9', 'POST /api/orders/9/cancel', 'GET /api/profile', 'PATCH /api/profile',
      'POST /api/profile/password', 'GET /api/admin/orders', 'GET /api/admin/orders?status=CONFIRMED', 'GET /api/admin/orders.csv',
      'GET /api/admin/orders.csv?status=CANCELLED', 'DELETE /api/admin/orders/9',
    ]));
  });

  it('logs each exchange without passwords or tokens', async () => {
    const { impl } = fakeFetch(() => ({ body: '{"token":"eyJa.eyJb.sig","note":"Bearer eyJx.eyJy.zz"}' }));
    const api = new ApiClient('https://sut', impl);
    await api.login('x@example.invalid', 'eventpass123');
    expect(api.log).toHaveLength(1);
    expect(JSON.stringify(api.log)).not.toContain('eventpass123');
    expect(JSON.stringify(api.log)).not.toContain('eyJa');
    expect(api.log[0]).toMatchObject({ method: 'POST', path: '/api/auth/login', status: 200 });
  });
});

describe('redact', () => {
  it('walks arrays and objects and leaves other values alone', () => {
    expect(redact([{ password: 'x', n: 1 }, 'eyJa.eyJb.c', null])).toEqual([{ password: '<redacted>', n: 1 }, '<redacted-jwt>', null]);
  });
});

describe('factory', () => {
  it('generates unique example.invalid addresses', () => {
    expect(uniqueEmail('qa', () => 'abcd')).toBe('qa-abcd@example.invalid');
    expect(uniqueEmail()).toMatch(/^qa-[0-9a-f]{8}@example\.invalid$/);
  });

  it('registers and logs in a buyer', async () => {
    const { impl } = fakeFetch((url) =>
      url.endsWith('/login') ? { body: '{}', setCookie: ['token=t.t.t; Path=/'] } : { body: '{}' },
    );
    const buyer = await newBuyer(new ApiClient('https://sut', impl));
    expect(buyer.email).toMatch(/@example\.invalid$/);
    expect(buyer.api.sessionToken).toBe('t.t.t');
  });

  it('fails loudly when registration or login does not succeed (no empty world)', async () => {
    const regFail = fakeFetch(() => ({ status: 400, body: '{"message":"bad"}' }));
    await expect(newBuyer(new ApiClient('https://sut', regFail.impl))).rejects.toThrow(/register failed/);
    const loginFail = fakeFetch((url) => (url.endsWith('/login') ? { status: 401, body: '{}' } : { body: '{}' }));
    await expect(newBuyer(new ApiClient('https://sut', loginFail.impl))).rejects.toThrow(/login failed/);
  });

  it('uses the global fetch by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"status":"ok"}'));
    const r = await new ApiClient('https://sut').health();
    expect(r.body).toEqual({ status: 'ok' });
    spy.mockRestore();
  });
});
