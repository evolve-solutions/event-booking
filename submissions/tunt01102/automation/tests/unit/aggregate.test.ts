import { describe, expect, it } from 'vitest';
import {
  buildRtm,
  checkCatalogue,
  classify,
  coverageTotals,
  extractIds,
  flattenPlaywright,
  summarise,
} from '../../src/report/aggregate';

const report = {
  suites: [
    {
      title: 'cart.spec.ts',
      file: 'tests/api/cart.spec.ts',
      specs: [],
      suites: [
        {
          title: 'Cart',
          specs: [
            {
              title: '[TC-CART-01] adds one ticket',
              file: 'tests/api/cart.spec.ts',
              tests: [{ projectName: 'api', status: 'expected', annotations: [], results: [{ status: 'passed', duration: 120 }] }],
            },
            {
              title: '[TC-CART-02] refuses quantity 0',
              file: 'tests/api/cart.spec.ts',
              tests: [{
                projectName: 'api', status: 'unexpected',
                annotations: [{ type: 'bug', description: 'BUG-04 zero accepted' }],
                results: [{ status: 'failed', duration: 80, error: { message: '\u001b[31mexpect(received).toBe(expected)\u001b[39m\nReceived 200' } }],
              }],
            },
            {
              title: '[TC-CART-04] refuses 1.5',
              file: 'tests/api/cart.spec.ts',
              tests: [{ projectName: 'api', status: 'unexpected', annotations: [], results: [{ status: 'failed', duration: 10, error: { message: 'boom' } }] }],
            },
            {
              title: '[TC-CAN-04] 50% tier',
              tests: [{ projectName: 'api', status: 'skipped', annotations: [{ type: 'skip', description: 'GAP-08' }], results: [] }],
            },
            {
              title: '[TC-CART-06] hold expiry',
              tests: [{ projectName: 'api', status: 'flaky', annotations: [], results: [{ status: 'failed', duration: 5 }, { status: 'passed', duration: 5 }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe('extractIds', () => {
  it('finds unique test case and bug ids', () => {
    expect(extractIds('[TC-DISC-01] and TC-DISC-01, TC-VIP-02', 'tc')).toEqual(['TC-DISC-01', 'TC-VIP-02']);
    expect(extractIds('BUG-05 BUG-07', 'bug')).toEqual(['BUG-05', 'BUG-07']);
    expect(extractIds('nothing', 'tc')).toEqual([]);
  });
});

describe('classify', () => {
  it('separates known-bug failures from unexplained ones and retries from clean passes', () => {
    expect(classify('expected', [], 0)).toBe('passed');
    expect(classify('passed', [], 1)).toBe('flaky');
    expect(classify('flaky', [], 1)).toBe('flaky');
    expect(classify('unexpected', ['BUG-01'], 0, 'expect(received).toBe(expected)')).toBe('failed-known-bug');
    expect(classify('unexpected', [], 0, 'expect(received).toBe(expected)')).toBe('failed-unexplained');
  });
  it('never lets a timeout, crash or missing error hide behind a known bug', () => {
    expect(classify('unexpected', ['BUG-01'], 0, 'Test timeout of 60000ms exceeded.')).toBe('failed-unexplained');
    expect(classify('unexpected', ['BUG-01'], 0, 'locator.click: Timeout 30000ms exceeded.')).toBe('failed-unexplained');
    expect(classify('unexpected', ['BUG-01'], 0, 'apiRequestContext: connect ECONNREFUSED')).toBe('failed-unexplained');
    expect(classify('unexpected', ['BUG-01'], 0, 'TypeError: cannot read properties of undefined')).toBe('failed-unexplained');
    expect(classify('unexpected', ['BUG-01'], 0)).toBe('failed-unexplained');
    expect(classify('skipped', [], 0)).toBe('skipped');
  });
});

describe('flattenPlaywright', () => {
  const rows = flattenPlaywright(report);

  it('produces one row per test with ids, outcome and mechanism', () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ tcIds: ['TC-CART-01'], outcome: 'passed', mechanism: 'first-attempt', project: 'api', durationMs: 120 });
    expect(rows[0].title).toBe('Cart › [TC-CART-01] adds one ticket');
    expect(rows[1]).toMatchObject({ bugIds: ['BUG-04'], outcome: 'failed-known-bug' });
    expect(rows[1].error).toBe('expect(received).toBe(expected)\nReceived 200');
    expect(rows[2].outcome).toBe('failed-unexplained');
    expect(rows[3]).toMatchObject({ outcome: 'skipped', mechanism: 'not-run', skipReason: 'GAP-08' });
    expect(rows[4]).toMatchObject({ outcome: 'flaky', mechanism: 'retry' });
  });

  it('copes with an empty or missing report', () => {
    expect(flattenPlaywright({})).toEqual([]);
    expect(flattenPlaywright(null)).toEqual([]);
  });

  it('derives a status when the test object has none', () => {
    const r = flattenPlaywright({ suites: [{ title: '', specs: [{ title: 'x', tests: [{ results: [{ status: 'passed' }] }] }] }] });
    expect(r[0].outcome).toBe('passed');
    const s = flattenPlaywright({ suites: [{ title: '', specs: [{ title: 'y', tests: [{ results: [] }] }] }] });
    expect(s[0].outcome).toBe('skipped');
    const f = flattenPlaywright({ suites: [{ title: '', specs: [{ title: 'z', tests: [{ results: [{ status: 'failed' }] }] }] }] });
    expect(f[0].outcome).toBe('failed-unexplained');
  });
});

describe('summarise', () => {
  it('counts by outcome and by project', () => {
    const s = summarise(flattenPlaywright(report));
    expect(s.total).toBe(5);
    expect(s.byOutcome).toEqual({ passed: 1, 'failed-known-bug': 1, 'failed-unexplained': 1, skipped: 1, flaky: 1 });
    expect(s.byProject.api.passed).toBe(1);
  });
});

describe('coverageTotals', () => {
  it('reads an istanbul json-summary and rejects anything else', () => {
    const t = { total: { lines: { pct: 91 }, statements: { pct: 90 }, functions: { pct: 88 }, branches: { pct: 84 } } };
    expect(coverageTotals(t)).toEqual({ lines: 91, statements: 90, functions: 88, branches: 84 });
    expect(coverageTotals({})).toBeNull();
  });
});

describe('buildRtm and checkCatalogue', () => {
  const reqs = [
    { id: 'REQ-BOOK-01', area: 'Booking', rule: 'qty >= 1' },
    { id: 'REQ-REF-02', area: 'Refunds', rule: '50%' },
    { id: 'REQ-BOOK-03', area: 'Booking', rule: 'hold' },
    { id: 'REQ-TZ-01', area: 'TZ', rule: 'VN' },
  ];
  const cases = [
    { id: 'TC-CART-01', title: '', requirements: ['REQ-BOOK-01'], type: 'positive', priority: 'P1', suite: 'api' },
    { id: 'TC-CART-02', title: '', requirements: ['REQ-BOOK-01'], type: 'boundary', priority: 'P1', suite: 'api' },
    { id: 'TC-CAN-04', title: '', requirements: ['REQ-REF-02'], type: 'boundary', priority: 'P1', suite: 'api', automated: false },
    { id: 'TC-CART-06', title: '', requirements: ['REQ-BOOK-03'], type: 'boundary', priority: 'P2', suite: 'api' },
    { id: 'TC-UI-99', title: '', requirements: ['REQ-BOOK-03'], type: 'positive', priority: 'P3', suite: 'regression' },
  ];
  const bugs = [
    { id: 'BUG-04', title: '', severity: 'Critical', requirements: ['REQ-BOOK-01'], status: 'Open' },
    { id: 'BUG-99', title: '', severity: 'Low', requirements: ['REQ-TZ-01'], status: 'Open' },
  ];
  const results = flattenPlaywright(report);

  it('gives every requirement an explicit state, never a blank', () => {
    const rtm = buildRtm(reqs, cases, results, bugs);
    expect(rtm.map((r) => [r.requirement.id, r.state])).toEqual([
      ['REQ-BOOK-01', 'covered-failing'],
      ['REQ-REF-02', 'designed-not-run'],
      ['REQ-BOOK-03', 'covered-passing'],
      ['REQ-TZ-01', 'not-covered'],
    ]);
    expect(rtm[0]).toMatchObject({ testCases: ['TC-CART-01', 'TC-CART-02'], automatedTests: 2, bugs: ['BUG-04'] });
  });

  it('lists every drift between catalogue, code and bug list', () => {
    expect(checkCatalogue(cases, results, bugs)).toEqual({
      notAutomated: ['TC-UI-99'],
      unknownInTests: ['TC-CART-04'],
      bugsWithoutTest: ['BUG-99'],
      unknownBugsInTests: [],
      passedWithOpenBug: [],
    });
  });

  it('flags a test tagged with an open bug that passed, and ignores fixed bugs', () => {
    const passing = flattenPlaywright({ suites: [{ title: '', specs: [{ title: '[TC-CART-01] x', tests: [{ projectName: 'api', status: 'expected', annotations: [{ type: 'bug', description: 'BUG-04' }], results: [{ status: 'passed' }] }] }] }] });
    expect(checkCatalogue(cases, passing, bugs).passedWithOpenBug).toEqual(['TC-CART-01 (BUG-04)']);
    const fixed = bugs.map((b) => ({ ...b, status: 'Fixed' }));
    expect(checkCatalogue(cases, passing, fixed).passedWithOpenBug).toEqual([]);
  });
});
