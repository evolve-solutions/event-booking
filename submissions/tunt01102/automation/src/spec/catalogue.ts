// Shape and cross-reference checks for spec/requirements.json, spec/test-cases.json and spec/bugs.json.
// These files are the source of truth for every generated document, so a typo in them must fail loudly
// (unit test and dashboard build) instead of producing a quietly empty cell.

export type Problem = string;

const REQ_ID = /^REQ-[A-Z]+-\d{2}$/;
const TC_ID = /^TC-[A-Z]+-\d{2,3}$/;
const BUG_ID = /^BUG-\d{2,3}$/;
const TYPES = ['positive', 'negative', 'boundary'];
const PRIORITIES = ['P1', 'P2', 'P3'];
const SUITES = ['api', 'smoke', 'regression', 'slow'];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'Fixed', 'Closed', 'Rejected'];

const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStrList = (v: unknown, min = 1): v is string[] => Array.isArray(v) && v.length >= min && v.every(isStr);

function dupes(ids: string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

export function checkSpec(reqDoc: any, caseDoc: any, bugDoc: any): Problem[] {
  const p: Problem[] = [];
  const reqs: any[] = reqDoc?.requirements ?? [];
  const cases: any[] = caseDoc?.testCases ?? [];
  const bugs: any[] = bugDoc?.bugs ?? [];
  if (!reqs.length) p.push('requirements.json: no requirements');
  if (!cases.length) p.push('test-cases.json: no testCases');
  if (!bugs.length) p.push('bugs.json: no bugs');

  for (const r of reqs) {
    if (!REQ_ID.test(r.id ?? '')) p.push(`requirement ${r.id}: bad id`);
    for (const k of ['area', 'rule', 'quote', 'section']) if (!isStr(r[k])) p.push(`requirement ${r.id}: missing ${k}`);
  }
  const reqIds = new Set(reqs.map((r) => r.id));
  for (const id of dupes(reqs.map((r) => r.id))) p.push(`requirement ${id}: duplicate id`);

  for (const c of cases) {
    if (!TC_ID.test(c.id ?? '')) p.push(`test case ${c.id}: bad id`);
    if (!isStr(c.title)) p.push(`test case ${c.id}: missing title`);
    if (!TYPES.includes(c.type)) p.push(`test case ${c.id}: type must be one of ${TYPES.join('/')}`);
    if (!PRIORITIES.includes(c.priority)) p.push(`test case ${c.id}: priority must be one of ${PRIORITIES.join('/')}`);
    if (!SUITES.includes(c.suite)) p.push(`test case ${c.id}: suite must be one of ${SUITES.join('/')}`);
    if (!isStrList(c.steps)) p.push(`test case ${c.id}: needs numbered steps`);
    if (!isStr(c.expected)) p.push(`test case ${c.id}: missing expected result`);
    if (!isStr(c.preconditions)) p.push(`test case ${c.id}: missing preconditions`);
    if (!isStrList(c.requirements)) p.push(`test case ${c.id}: must trace to a requirement`);
    for (const r of c.requirements ?? []) if (!reqIds.has(r)) p.push(`test case ${c.id}: unknown requirement ${r}`);
    if (c.automated === false && !isStr(c.notes)) p.push(`test case ${c.id}: not automated, so it needs a reason in notes`);
  }
  const caseIds = new Set(cases.map((c) => c.id));
  for (const id of dupes(cases.map((c) => c.id))) p.push(`test case ${id}: duplicate id`);

  for (const b of bugs) {
    if (!BUG_ID.test(b.id ?? '')) p.push(`bug ${b.id}: bad id`);
    if (!SEVERITIES.includes(b.severity)) p.push(`bug ${b.id}: severity must be one of ${SEVERITIES.join('/')}`);
    if (!STATUSES.includes(b.status)) p.push(`bug ${b.id}: status must be one of ${STATUSES.join('/')}`);
    for (const k of ['title', 'area', 'component', 'expected', 'actual', 'impact', 'rootCauseGroup']) if (!isStr(b[k])) p.push(`bug ${b.id}: missing ${k}`);
    if (!isStrList(b.steps)) p.push(`bug ${b.id}: needs reproduction steps`);
    if ((b.severity === 'Critical' || b.severity === 'High') && !isStr(b.severityRationale)) p.push(`bug ${b.id}: ${b.severity} needs a severityRationale`);
    if (!isStrList(b.requirements)) p.push(`bug ${b.id}: must name the requirement it breaks`);
    for (const r of b.requirements ?? []) if (!reqIds.has(r)) p.push(`bug ${b.id}: unknown requirement ${r}`);
    if (!isStrList(b.tests)) p.push(`bug ${b.id}: must name the test cases that expose it`);
    for (const t of b.tests ?? []) if (!caseIds.has(t)) p.push(`bug ${b.id}: unknown test case ${t}`);
    for (const r of b.relatedBugs ?? []) if (!bugs.some((x) => x.id === r)) p.push(`bug ${b.id}: unknown related bug ${r}`);
  }
  const bugIds = new Set(bugs.map((b) => b.id));
  for (const id of dupes(bugs.map((b) => b.id))) p.push(`bug ${id}: duplicate id`);
  for (const c of cases) for (const b of c.bugs ?? []) if (!bugIds.has(b)) p.push(`test case ${c.id}: unknown bug ${b}`);
  return p;
}

/** Ids used in test source files that the catalogue does not know (typos in titles or bug tags). */
export function unknownIdsInSource(sources: string[], caseIds: string[], bugIds: string[]): string[] {
  const text = sources.join('\n');
  const tc = [...new Set([...(text.match(/\[TC-[A-Z]+-\d{2,3}\]/g) ?? []), ...(text.match(/tc\('TC-[A-Z]+-\d{2,3}'/g) ?? [])])].map((s) => s.replace(/^\[|\]$|^tc\('|'$/g, ''));
  const bug = [...new Set(text.match(/['"`]BUG-\d{2,3}['"`]/g) ?? [])].map((s) => s.slice(1, -1));
  return [...tc.filter((id) => !caseIds.includes(id)), ...bug.filter((id) => !bugIds.includes(id))].sort();
}

/** Test titles written as raw '[TC-…]' strings instead of tc('TC-…', …): they would bypass the compile-time id check. */
export function rawTitles(sources: string[]): string[] {
  return sources.flatMap((src) => src.match(/test\('\[TC-[A-Z]+-\d{2,3}\][^']*'/g) ?? []);
}
