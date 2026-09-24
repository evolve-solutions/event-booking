import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSpec, rawTitles, unknownIdsInSource } from '../../src/spec/catalogue';
import { renderIds } from '../../src/spec/ids';

const spec = (f: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../spec', f), 'utf8'));

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.spec.ts') ? [path.join(dir, d.name)] : []));
}

const req = { requirements: [{ id: 'REQ-BOOK-01', area: 'Booking', rule: 'qty >= 1', quote: 'q', section: 's' }] };
const tc = (over: object = {}) => ({ testCases: [{ id: 'TC-CART-01', title: 't', type: 'positive', priority: 'P1', suite: 'api', steps: ['a'], expected: 'e', preconditions: 'p', requirements: ['REQ-BOOK-01'], ...over }] });
const bug = (over: object = {}) => ({ bugs: [{ id: 'BUG-01', title: 't', severity: 'Medium', status: 'Open', area: 'a', component: 'API', expected: 'e', actual: 'x', impact: 'i', rootCauseGroup: 'g', steps: ['s'], requirements: ['REQ-BOOK-01'], tests: ['TC-CART-01'], ...over }] });

describe('checkSpec on the real spec files', () => {
  it('finds no problem in requirements, test cases and bugs', () => {
    expect(checkSpec(spec('requirements.json'), spec('test-cases.json'), spec('bugs.json'))).toEqual([]);
  });
  it('every test case and bug id used in the test code exists in the catalogue', () => {
    const sources = walk(path.resolve(__dirname, '..')).map((f) => fs.readFileSync(f, 'utf8'));
    const cases = spec('test-cases.json').testCases.map((c: any) => c.id);
    const bugs = spec('bugs.json').bugs.map((b: any) => b.id);
    expect(sources.length).toBeGreaterThan(5);
    expect(unknownIdsInSource(sources, cases, bugs)).toEqual([]);
  });
  it('test titles use tc(), so the compiler checks every id', () => {
    const suites = ['api', 'e2e', 'slow'].flatMap((d) => walk(path.resolve(__dirname, '..', d))).map((f) => fs.readFileSync(f, 'utf8'));
    expect(suites.join('').match(/tc\('TC-/g)?.length ?? 0).toBeGreaterThan(100);
    expect(rawTitles(suites)).toEqual([]);
  });
  it('tests/support/ids.ts is up to date with the catalogue', () => {
    const want = renderIds(spec('test-cases.json').testCases.map((c: any) => c.id), spec('bugs.json').bugs.map((b: any) => b.id));
    expect(fs.readFileSync(path.resolve(__dirname, '../support/ids.ts'), 'utf8')).toBe(want);
  });
});

describe('checkSpec catches broken files', () => {
  it('accepts a minimal valid set', () => {
    expect(checkSpec(req, tc(), bug())).toEqual([]);
  });
  it('rejects empty documents', () => {
    expect(checkSpec({}, {}, {})).toEqual(['requirements.json: no requirements', 'test-cases.json: no testCases', 'bugs.json: no bugs']);
  });
  it('rejects bad enums, missing fields and dangling references', () => {
    const p = checkSpec(req, tc({ type: 'happy', priority: 'P9', suite: 'x', steps: [], requirements: ['REQ-NOPE-01'], bugs: ['BUG-99'] }), bug({ severity: 'Huge', status: 'Maybe', tests: ['TC-NOPE-01'], relatedBugs: ['BUG-77'], rootCauseGroup: '' }));
    expect(p).toEqual(expect.arrayContaining([
      'test case TC-CART-01: type must be one of positive/negative/boundary',
      'test case TC-CART-01: priority must be one of P1/P2/P3',
      'test case TC-CART-01: suite must be one of api/smoke/regression/slow',
      'test case TC-CART-01: needs numbered steps',
      'test case TC-CART-01: unknown requirement REQ-NOPE-01',
      'test case TC-CART-01: unknown bug BUG-99',
      'bug BUG-01: severity must be one of Critical/High/Medium/Low',
      'bug BUG-01: status must be one of Open/Fixed/Closed/Rejected',
      'bug BUG-01: unknown test case TC-NOPE-01',
      'bug BUG-01: unknown related bug BUG-77',
      'bug BUG-01: missing rootCauseGroup',
    ]));
  });
  it('requires a severity rationale on Critical and High bugs only', () => {
    expect(checkSpec(req, tc(), bug({ severity: 'Critical' }))).toEqual(['bug BUG-01: Critical needs a severityRationale']);
    expect(checkSpec(req, tc(), bug({ severity: 'High', severityRationale: 'why' }))).toEqual([]);
    expect(checkSpec(req, tc(), bug({ severity: 'Low' }))).toEqual([]);
  });
  it('rejects bad ids, duplicates and a non-automated case without a reason', () => {
    const r2 = { requirements: [...req.requirements, ...req.requirements, { id: 'bad', area: '', rule: 'r', quote: 'q', section: 's' }] };
    const c2 = { testCases: [...tc().testCases, ...tc().testCases, { ...tc().testCases[0], id: 'TC-X', automated: false }] };
    const b2 = { bugs: [...bug().bugs, ...bug().bugs, { ...bug().bugs[0], id: 'B1' }] };
    const p = checkSpec(r2, c2, b2);
    expect(p).toEqual(expect.arrayContaining([
      'requirement REQ-BOOK-01: duplicate id', 'requirement bad: bad id', 'requirement bad: missing area',
      'test case TC-CART-01: duplicate id', 'test case TC-X: bad id', 'test case TC-X: not automated, so it needs a reason in notes',
      'bug BUG-01: duplicate id', 'bug B1: bad id',
    ]));
  });
});

describe('unknownIdsInSource', () => {
  it('reports ids in titles and bug tags that the catalogue lacks', () => {
    const src = ["test('[TC-CART-01] ok', bug('BUG-01'))", "test('[TC-CART-99] typo', bug('BUG-42'))", "test(tc('TC-CART-98', 'typo'))"];
    expect(unknownIdsInSource(src, ['TC-CART-01'], ['BUG-01'])).toEqual(['BUG-42', 'TC-CART-98', 'TC-CART-99']);
  });
  it('finds raw titles that bypass tc()', () => {
    expect(rawTitles(["test('[TC-CART-01] raw', async () => {})", "test(tc('TC-CART-02', 'ok'), async () => {})"])).toEqual(["test('[TC-CART-01] raw'"]);
  });
  it('renders sorted literal unions', () => {
    const out = renderIds(['TC-B-02', 'TC-A-01'], ['BUG-02', 'BUG-01']);
    expect(out.indexOf("'TC-A-01'")).toBeLessThan(out.indexOf("'TC-B-02'"));
    expect(out).toContain('export type BugId');
  });
});
