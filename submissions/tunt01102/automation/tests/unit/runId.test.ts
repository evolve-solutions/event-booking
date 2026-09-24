import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { currentRunId, latestRun, RUN_ID_PATTERN, runStamp, stampToIso } from '../../src/report/runId';

describe('runStamp', () => {
  it('formats Vietnam time to the millisecond', () => {
    expect(runStamp(new Date('2026-09-24T03:55:22.123Z'))).toBe('20260924T105522123');
  });
  it('crosses midnight into the Vietnam date', () => {
    expect(runStamp(new Date('2026-10-04T17:30:00.007Z'))).toBe('20261005T003000007');
  });
  it('sorts as text in time order', () => {
    const a = runStamp(new Date('2026-09-24T03:55:22.123Z'));
    const b = runStamp(new Date('2026-09-24T03:55:22.124Z'));
    expect([b, a].sort()).toEqual([a, b]);
    expect(a).toMatch(RUN_ID_PATTERN);
  });
});

describe('currentRunId', () => {
  it('creates one id and reuses it, so workers share the run', () => {
    const env: NodeJS.ProcessEnv = {};
    const id = currentRunId(env, () => new Date('2026-09-24T03:55:22.123Z'));
    expect(id).toBe('20260924T105522123');
    expect(currentRunId(env, () => new Date('2030-01-01T00:00:00Z'))).toBe(id);
  });
  it('replaces a malformed id instead of trusting it', () => {
    const env: NodeJS.ProcessEnv = { RUN_ID: 'latest' };
    expect(currentRunId(env, () => new Date('2026-09-24T03:55:22.123Z'))).toBe('20260924T105522123');
  });
  it('uses the real clock by default', () => {
    expect(currentRunId({})).toMatch(RUN_ID_PATTERN);
  });
});

describe('latestRun', () => {
  it('picks the newest stamped entry and ignores everything else', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-'));
    for (const n of ['20260924T105522123.json', '20260924T105522124.json', 'latest.json', 'notes.txt']) fs.writeFileSync(path.join(dir, n), '{}');
    fs.mkdirSync(path.join(dir, '20260924T090000000'));
    expect(path.basename(latestRun(dir)!)).toBe('20260924T105522124.json');
    fs.rmSync(dir, { recursive: true });
  });
  it('returns null for a missing or empty folder', () => {
    expect(latestRun('/definitely/not/here')).toBeNull();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-'));
    expect(latestRun(dir)).toBeNull();
    fs.rmSync(dir, { recursive: true });
  });
});

describe('stampToIso', () => {
  it('round-trips a stamp to the UTC instant', () => {
    expect(stampToIso('20260924T105522123')).toBe('2026-09-24T03:55:22.123Z');
  });
  it('rejects anything that is not a stamp', () => {
    expect(() => stampToIso('latest')).toThrow(/not a run id/);
  });
});
