// Turns raw run output (Playwright JSON reporter, Vitest coverage summary) plus the spec files into the
// data the dashboard and the RTM render. Self-contained on purpose: Node runs it directly with type stripping.

export interface Requirement { id: string; area: string; rule: string; }
export interface TestCase { id: string; title: string; requirements: string[]; type: string; priority: string; suite: string; automated?: boolean; }
export interface Bug { id: string; title: string; severity: string; requirements: string[]; status: string; }

export type Outcome = 'passed' | 'failed-known-bug' | 'failed-unexplained' | 'skipped' | 'flaky';

export interface TestResult {
  title: string;
  file: string;
  project: string;
  tcIds: string[];
  bugIds: string[];
  status: string;
  outcome: Outcome;
  /** Which route produced the result (VERIFICATION.md section 1): first attempt or a retry. */
  mechanism: 'first-attempt' | 'retry' | 'not-run';
  durationMs: number;
  error?: string;
  skipReason?: string;
}

const TC_RE = /\bTC-[A-Z]+-\d{2,3}\b/g;
const BUG_RE = /\bBUG-\d{2,3}\b/g;

export function extractIds(text: string, kind: 'tc' | 'bug'): string[] {
  return [...new Set(text.match(kind === 'tc' ? TC_RE : BUG_RE) ?? [])];
}

/** An assertion about the product failed, as opposed to a timeout, a crash or an environment error. */
export function isAssertionFailure(error: string | undefined): boolean {
  if (!error) return false;
  if (/Test timeout|Timeout \d+ms exceeded|timed out|ECONN|ENOTFOUND|net::ERR|Target (page|closed)|browser has been closed/i.test(error)) return false;
  return /expect\(|toBe|toEqual|toContain|toHave|toMatch|toBeGreater|toBeLess|toBeNull|toBeTruthy/.test(error);
}

/**
 * A failure counts as 'known bug' only when the test is tagged with a bug AND it failed on an assertion.
 * A tagged test that times out or crashes is unexplained: a new problem must not hide behind an old bug.
 */
export function classify(status: string, bugIds: string[], retries: number, error?: string): Outcome {
  if (status === 'skipped') return 'skipped';
  if (status === 'flaky') return 'flaky';
  if (status === 'expected' || status === 'passed') return retries > 0 ? 'flaky' : 'passed';
  return bugIds.length && isAssertionFailure(error) ? 'failed-known-bug' : 'failed-unexplained';
}

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Flattens a Playwright JSON report into one row per test per project. */
export function flattenPlaywright(report: any): TestResult[] {
  const out: TestResult[] = [];
  const walk = (suite: any, titles: string[]) => {
    const here = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const results = t.results ?? [];
        const last = results[results.length - 1];
        const annotations: any[] = [...(t.annotations ?? []), ...results.flatMap((r: any) => r.annotations ?? [])];
        const fullTitle = [...here, spec.title].join(' › ');
        const bugIds = [
          ...new Set([
            ...annotations.filter((a) => a.type === 'bug').flatMap((a) => extractIds(String(a.description ?? ''), 'bug')),
          ]),
        ];
        const skip = annotations.find((a) => a.type === 'skip' || a.type === 'fixme');
        const retries = Math.max(0, results.length - 1);
        const status = t.status ?? (last?.status === 'passed' ? 'expected' : last?.status ?? 'skipped');
        const errorText = last?.error?.message ? stripAnsi(String(last.error.message)) : undefined;
        out.push({
          title: fullTitle,
          file: spec.file ?? suite.file ?? '',
          project: t.projectName ?? '',
          tcIds: extractIds(fullTitle, 'tc'),
          bugIds,
          status,
          outcome: classify(status, bugIds, retries, errorText),
          mechanism: status === 'skipped' ? 'not-run' : retries > 0 ? 'retry' : 'first-attempt',
          durationMs: results.reduce((s: number, r: any) => s + (r.duration ?? 0), 0),
          error: errorText?.split('\n').slice(0, 6).join('\n'),
          skipReason: skip?.description,
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, here);
  };
  for (const s of report?.suites ?? []) walk(s, []);
  return out;
}

export interface Summary { total: number; byOutcome: Record<Outcome, number>; byProject: Record<string, Record<Outcome, number>>; }

export function summarise(results: TestResult[]): Summary {
  const empty = (): Record<Outcome, number> => ({ passed: 0, 'failed-known-bug': 0, 'failed-unexplained': 0, skipped: 0, flaky: 0 });
  const byOutcome = empty();
  const byProject: Record<string, Record<Outcome, number>> = {};
  for (const r of results) {
    byOutcome[r.outcome]++;
    (byProject[r.project] ??= empty())[r.outcome]++;
  }
  return { total: results.length, byOutcome, byProject };
}

export interface CoverageTotals { lines: number; statements: number; functions: number; branches: number; }

/** Reads coverage/coverage-summary.json (istanbul json-summary format). */
export function coverageTotals(summary: any): CoverageTotals | null {
  const t = summary?.total;
  if (!t) return null;
  return { lines: t.lines.pct, statements: t.statements.pct, functions: t.functions.pct, branches: t.branches.pct };
}

export type RtmState = 'covered-passing' | 'covered-failing' | 'designed-not-run' | 'not-covered';

export interface RtmRow {
  requirement: Requirement;
  testCases: string[];
  automatedTests: number;
  outcomes: Record<Outcome, number>;
  bugs: string[];
  state: RtmState;
}

/** Requirements Traceability Matrix: requirement ↔ test case ↔ automated result ↔ bug. */
export function buildRtm(reqs: Requirement[], cases: TestCase[], results: TestResult[], bugs: Bug[]): RtmRow[] {
  return reqs.map((req) => {
    const tcs = cases.filter((c) => c.requirements.includes(req.id)).map((c) => c.id);
    const runs = results.filter((r) => r.tcIds.some((id) => tcs.includes(id)));
    const outcomes = summarise(runs).byOutcome;
    const linkedBugs = bugs.filter((b) => b.requirements.includes(req.id)).map((b) => b.id);
    let state: RtmState;
    if (tcs.length === 0) state = 'not-covered';
    else if (runs.length === 0 || runs.every((r) => r.outcome === 'skipped')) state = 'designed-not-run';
    else if (outcomes['failed-known-bug'] + outcomes['failed-unexplained'] > 0) state = 'covered-failing';
    else state = 'covered-passing';
    return { requirement: req, testCases: tcs, automatedTests: runs.length, outcomes, bugs: linkedBugs, state };
  });
}

export interface CatalogueCheck {
  notAutomated: string[];
  unknownInTests: string[];
  bugsWithoutTest: string[];
  unknownBugsInTests: string[];
  /** Tests tagged with an open bug that passed: either the bug is fixed or the test passes for the wrong reason. */
  passedWithOpenBug: string[];
}

/** Keeps the catalogue and the code honest with each other: every drift is listed, never silently ignored. */
export function checkCatalogue(cases: TestCase[], results: TestResult[], bugs: Bug[]): CatalogueCheck {
  const known = new Set(cases.map((c) => c.id));
  const inTests = new Set(results.flatMap((r) => r.tcIds));
  const bugIdsInTests = new Set(results.flatMap((r) => r.bugIds));
  const knownBugs = new Set(bugs.map((b) => b.id));
  return {
    notAutomated: cases.filter((c) => c.automated !== false && !inTests.has(c.id)).map((c) => c.id),
    unknownInTests: [...inTests].filter((id) => !known.has(id)).sort(),
    bugsWithoutTest: bugs.filter((b) => !bugIdsInTests.has(b.id)).map((b) => b.id),
    unknownBugsInTests: [...bugIdsInTests].filter((id) => !knownBugs.has(id)).sort(),
    passedWithOpenBug: results
      .filter((r) => r.outcome === 'passed' && r.bugIds.some((b) => bugs.find((x) => x.id === b)?.status === 'Open'))
      .map((r) => `${r.tcIds[0] ?? r.title} (${r.bugIds.join(', ')})`),
  };
}
