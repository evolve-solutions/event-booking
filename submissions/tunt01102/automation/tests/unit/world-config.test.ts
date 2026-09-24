import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config';
import { chooseWorld, loadWorld, resetWorldCache } from '../../src/data/world';

const now = new Date('2026-09-24T03:00:00Z');
const ev = (id: number, startsAt: string, status = 'UPCOMING') => ({ id, title: `E${id}`, startsAt, status });

describe('chooseWorld', () => {
  const events = [
    ev(11, '2026-08-15T12:00:00Z', 'PAST'),
    ev(3, '2026-09-25T10:00:00Z'), // less than 48 h away: never used, a cancel could hit the 50% tier
    ev(4, '2026-10-18T01:30:00Z'),
    ev(7, '2026-10-04T17:30:00Z'), // 00:30 on 5 Oct in Vietnam: its dates differ
    ev(9, '2026-12-31T15:00:00Z'),
  ];

  it('assigns every role by rule', () => {
    const w = chooseWorld(events, now);
    expect(w.past.id).toBe(11);
    expect(w.upcoming.id).toBe(7); // preferred because its Vietnam date differs from its UTC date
    expect(w.upcoming2.id).toBe(4);
    expect(w.quiet.id).toBe(9); // latest start, nobody else uses it
    expect(new Set([w.upcoming.id, w.upcoming2.id, w.quiet.id]).size).toBe(3);
    expect(w.chosenAt).toBe(now.toISOString());
  });

  it('falls back to the soonest event when no date crosses midnight', () => {
    const w = chooseWorld([ev(11, '2026-08-15T12:00:00Z', 'PAST'), ev(1, '2026-11-01T03:00:00Z'), ev(2, '2026-11-02T03:00:00Z'), ev(5, '2026-11-03T03:00:00Z')], now);
    expect(w.upcoming.id).toBe(1);
  });

  it('refuses to guess when the site lacks what the tests need', () => {
    expect(() => chooseWorld(events.filter((e) => e.status !== 'PAST'), now)).toThrow(/no PAST event/);
    expect(() => chooseWorld(events.slice(0, 3), now)).toThrow(/need 3 upcoming/);
  });
});

describe('loadWorld', () => {
  afterEach(() => resetWorldCache());

  it('reads the file chosen by global setup and caches it', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'world-')), 'w.json');
    fs.writeFileSync(file, JSON.stringify({ upcoming: { id: 7 } }));
    expect(loadWorld({ WORLD_FILE: file }).upcoming.id).toBe(7);
    fs.writeFileSync(file, JSON.stringify({ upcoming: { id: 99 } }));
    expect(loadWorld({ WORLD_FILE: file }).upcoming.id).toBe(7);
  });

  it('fails loudly without a world file', () => {
    expect(() => loadWorld({})).toThrow(/WORLD_FILE/);
    expect(() => loadWorld({ WORLD_FILE: '/nope/w.json' })).toThrow(/WORLD_FILE/);
  });
});

describe('loadConfig', () => {
  it('has safe local defaults', () => {
    const c = loadConfig({});
    expect(c.baseUrl).toMatch(/^https:\/\//);
    expect(c.displayTimeZone).toBe('Asia/Ho_Chi_Minh');
    expect(c.browserTimeZone).toBe('Europe/London');
    expect(c.workers).toBe(4);
  });

  it('reads the environment and trims a trailing slash', () => {
    const c = loadConfig({ BASE_URL: 'https://staging.example/', ENV_NAME: 'staging', BROWSER_TZ: 'UTC', WORKERS: '1' });
    expect(c).toMatchObject({ baseUrl: 'https://staging.example', envName: 'staging', browserTimeZone: 'UTC', workers: 1 });
  });

  it('refuses to run in CI without an explicit target', () => {
    expect(() => loadConfig({ CI: '1' })).toThrow(/BASE_URL must be set/);
    expect(loadConfig({ CI: '1', BASE_URL: 'https://x.example' }).workers).toBe(2);
  });
});
