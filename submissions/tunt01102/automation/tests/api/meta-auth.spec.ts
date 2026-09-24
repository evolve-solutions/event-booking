import { ApiClient } from '../../src/api/client';
import { DEFAULT_PASSWORD, newBuyer, uniqueEmail } from '../../src/data/factory';
import { SESSION_MINUTES } from '../../src/spec/pricing';
import { bug, expect, test, tc } from '../support/fixtures';
import { OPERATION_MAP } from './operations';

test.describe('Meta', () => {
  test(tc('TC-META-01', 'health endpoint reports ok'), async ({ anon }) => {
    const r = await anon.health();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ status: 'ok' });
  });

  test(tc('TC-META-02', 'every documented operation has an API test'), async ({ anon }) => {
    const r = await anon.openapi();
    expect(r.status).toBe(200);
    const documented = Object.entries(r.body.paths as Record<string, Record<string, unknown>>).flatMap(([path, ops]) =>
      Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
    );
    expect(documented.length).toBeGreaterThan(0);
    const untested = documented.filter((op) => !(op in OPERATION_MAP));
    expect(untested, 'documented operations without an API test case').toEqual([]);
    expect(documented).toHaveLength(27);
  });

  test(tc('TC-META-03', 'config and robots respond'), async ({ anon }) => {
    const c = await anon.config();
    expect(c.status).toBe(200);
    expect(Array.isArray(c.body.flags)).toBe(true);
    const r = await anon.robots();
    expect(r.status).toBe(200);
    expect(r.text).toContain('Disallow: /');
  });
});

test.describe('Registration', () => {
  test(tc('TC-REG-01', 'registers with a well-formed email and 8+ character password'), async ({ anon }) => {
    const email = uniqueEmail();
    const r = await anon.register({ email, password: DEFAULT_PASSWORD });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ email, role: 'CUSTOMER', phone: null });
  });

  test(tc('TC-REG-02', 'refuses a malformed email'), bug('BUG-17'), async ({ anon }) => {
    // Each value is unique per run: a fixed value is registered by the first run (the bug) and then only ever
    // gets 409 "already registered", which would fail this test for the wrong reason.
    const id = uniqueEmail('x').split('@')[0].slice(2);
    for (const email of [`not-an-email-${id}`, `qa-${id}@@example.invalid`, `a${id}@b`]) {
      const r = await anon.register({ email, password: DEFAULT_PASSWORD });
      expect.soft(r.status, `register ${email}`).toBe(400);
    }
  });

  test(tc('TC-REG-03', 'refuses a 7 character password'), async ({ anon }) => {
    const r = await anon.register({ email: uniqueEmail(), password: '1234567' });
    expect(r.status).toBe(400);
    expect(r.text).toMatch(/8/);
  });

  test(tc('TC-REG-04', 'accepts an 8 character password'), async ({ anon }) => {
    const r = await anon.register({ email: uniqueEmail(), password: '12345678' });
    expect(r.status).toBe(200);
  });

  test(tc('TC-REG-05', 'phone length boundaries'), async ({ anon }) => {
    const cases: [string, number][] = [['091234567', 400], ['0912345678', 200], ['123456789012345', 200], ['1234567890123456', 400]];
    for (const [phone, status] of cases) {
      const r = await anon.register({ email: uniqueEmail(), password: DEFAULT_PASSWORD, phone });
      expect(r.status, `phone ${phone} (${phone.length} digits)`).toBe(status);
    }
  });

  test(tc('TC-REG-06', 'refuses a phone made of letters'), bug('BUG-18'), async ({ anon }) => {
    const r = await anon.register({ email: uniqueEmail(), password: DEFAULT_PASSWORD, phone: 'abcdefghij' });
    expect(r.status).toBe(400);
  });

  test(tc('TC-REG-07', 'refuses an email already registered'), async ({ anon }) => {
    const email = uniqueEmail();
    expect((await anon.register({ email, password: DEFAULT_PASSWORD })).status).toBe(200);
    const again = await anon.register({ email, password: DEFAULT_PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.message).toBe('Email already registered');
  });

  test(tc('TC-REG-08', 'refuses the same email in another letter case'), async ({ anon }) => {
    const email = uniqueEmail();
    await anon.register({ email, password: DEFAULT_PASSWORD });
    expect((await anon.register({ email: email.toUpperCase(), password: DEFAULT_PASSWORD })).status).toBe(409);
  });

  test(tc('TC-REG-09', 'refuses the same email with surrounding spaces'), bug('BUG-19'), async ({ anon }) => {
    const email = uniqueEmail();
    await anon.register({ email, password: DEFAULT_PASSWORD });
    const r = await anon.register({ email: ` ${email}`, password: DEFAULT_PASSWORD });
    expect([400, 409]).toContain(r.status);
  });
});

test.describe('Session', () => {
  test(tc('TC-AUTH-01', 'login sets an HttpOnly session cookie and /me identifies the user'), async ({ anon }) => {
    const email = uniqueEmail();
    await anon.register({ email, password: DEFAULT_PASSWORD });
    const r = await anon.login(email, DEFAULT_PASSWORD);
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith('token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    const me = await anon.me();
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(email);
  });

  test(tc('TC-AUTH-02', 'wrong password is refused'), async ({ buyer }) => {
    const fresh = new ApiClient();
    const r = await fresh.login(buyer.email, 'wrongpass1');
    expect(r.status).toBe(401);
    expect(r.body.message).toBe('Incorrect email or password');
    expect(fresh.sessionToken).toBeUndefined();
  });

  test(tc('TC-AUTH-03', 'session token lifetime is 30 minutes'), async ({ buyer }) => {
    const payload = JSON.parse(Buffer.from(buyer.api.sessionToken!.split('.')[1], 'base64url').toString());
    expect(payload.exp - payload.iat).toBe(SESSION_MINUTES * 60);
  });

  test(tc('TC-AUTH-04', 'logout ends the session'), async ({ buyer }) => {
    expect((await buyer.api.logout()).status).toBe(200);
    expect((await buyer.api.me()).status).toBe(401);
  });

  test(tc('TC-AUTH-05', 'login-only endpoints refuse anonymous callers'), async ({ anon }) => {
    const calls = [anon.cart(), anon.orders(), anon.profile(), anon.addToCart(1, 1), anon.checkout({ recipientName: 'x', phone: '0912345678' }), anon.me()];
    for (const r of await Promise.all(calls)) expect(r.status).toBe(401);
  });
});

test.describe('Profile', () => {
  test(tc('TC-PROF-01', 'updates phone with 10 digits'), async ({ buyer }) => {
    expect((await buyer.api.updateProfile({ phone: '0912345678' })).status).toBe(200);
    expect((await buyer.api.profile()).body.phone).toBe('0912345678');
  });

  test(tc('TC-PROF-02', 'refuses 9 and 16 digit phones'), async ({ buyer }) => {
    expect((await buyer.api.updateProfile({ phone: '091234567' })).status).toBe(400);
    expect((await buyer.api.updateProfile({ phone: '1234567890123456' })).status).toBe(400);
  });

  test(tc('TC-PROF-03', 'refuses a phone made of letters'), bug('BUG-18'), async ({ buyer }) => {
    const r = await buyer.api.updateProfile({ phone: 'abcdefghij' });
    expect(r.status).toBe(400);
    expect((await buyer.api.profile()).body.phone).not.toBe('abcdefghij');
  });

  test(tc('TC-PROF-04', 'password change takes effect for the next login'), async () => {
    const b = await newBuyer();
    expect((await b.api.changePassword(b.password, 'newpass1234')).status).toBe(200);
    expect((await new ApiClient().login(b.email, b.password)).status).toBe(401);
    expect((await new ApiClient().login(b.email, 'newpass1234')).status).toBe(200);
  });

  test(tc('TC-PROF-05', 'wrong current password is refused'), async ({ buyer }) => {
    const r = await buyer.api.changePassword('wrongpass9', 'newpass1234');
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('Current password is incorrect');
  });

  test(tc('TC-PROF-06', 'new password equal to the current one is refused'), bug('BUG-20'), async ({ buyer }) => {
    const r = await buyer.api.changePassword(buyer.password, buyer.password);
    expect(r.status).toBe(400);
  });

  test(tc('TC-PROF-07', 'new password of 7 characters is refused'), async ({ buyer }) => {
    expect((await buyer.api.changePassword(buyer.password, 'short12')).status).toBe(400);
  });
});
