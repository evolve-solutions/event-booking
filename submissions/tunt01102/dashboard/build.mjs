// One command refreshes every derived artefact from the sources (PRINCIPLES 37):
//   spec/*.json + automation/reports/*.json + automation/coverage + assets/BUG-*/log.json
//   -> bugs.md, test-cases.md, rtm.md, dashboard/index.html (the data is inlined: a file:// page cannot fetch a sibling file)
// Run from automation/: `npm run dashboard`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildRtm, checkCatalogue, coverageTotals, flattenPlaywright, summarise } from '../automation/src/report/aggregate.ts';
import { latestRun } from '../automation/src/report/runId.ts';
import { checkSpec } from '../automation/src/spec/catalogue.ts';
import { PROJECTS } from '../automation/src/projects.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const auto = path.join(root, 'automation');
const require = createRequire(path.join(auto, 'package.json'));
const { marked } = require('marked');

const readJson = (p, fallback = null) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);
const reqs = readJson(path.join(root, 'spec/requirements.json'));
const catalogue = readJson(path.join(root, 'spec/test-cases.json'));
const bugsDoc = readJson(path.join(root, 'spec/bugs.json'));
const processLog = readJson(path.join(root, 'spec/process-log.json'));
// Fail closed on a broken source: a typo here would otherwise become an empty cell in every document.
const specProblems = checkSpec(reqs, catalogue, bugsDoc);
if (specProblems.length) {
  console.error(`spec problems (${specProblems.length}):\n- ${specProblems.join('\n- ')}`);
  process.exit(1);
}
const cases = catalogue.testCases;
const bugs = bugsDoc.bugs;
const SEV_ORDER = ['Critical', 'High', 'Medium', 'Low'];
const bySeverity = (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.id.localeCompare(b.id);

// ---- automated results: one report per suite, never merged by hand
const SUITES = PROJECTS.map((p) => p.name);
const runs = {};
let results = [];
for (const s of SUITES) {
  // Newest FULL run of the suite; partial (filtered) runs live in '<suite>-partial' and are never read here.
  const file = latestRun(path.join(auto, 'reports', s));
  const rep = file && readJson(file);
  if (!rep) { runs[s] = { status: 'not-run' }; continue; }
  const rows = flattenPlaywright(rep).map((r) => ({ ...r, suite: s }));
  runs[s] = { status: 'ran', runId: path.basename(file, '.json'), history: fs.readdirSync(path.dirname(file)).length, startedAt: rep.stats?.startTime, durationMs: Math.round(rep.stats?.duration ?? 0), summary: summarise(rows) };
  results = results.concat(rows);
}
const latestJson = (dir) => { const f = latestRun(dir); return f ? readJson(f) : null; };
const evidenceRep = latestJson(path.join(auto, 'reports', 'evidence'));
const covDir = latestRun(path.join(auto, 'coverage'));
const covSummary = covDir ? readJson(path.join(covDir, 'coverage-summary.json')) : null;
const coverage = coverageTotals(covSummary);
const unitFiles = covSummary ?? {};
const unit = {
  coverage,
  files: Object.entries(unitFiles).filter(([k]) => k !== 'total').map(([k, v]) => ({ file: k.split('automation/')[1], lines: v.lines.pct, branches: v.branches.pct, functions: v.functions.pct })),
  runId: covDir ? path.basename(covDir) : null,
  tests: latestJson(path.join(auto, 'reports', 'unit'))?.numTotalTests ?? null,
  passed: latestJson(path.join(auto, 'reports', 'unit'))?.numPassedTests ?? null,
};

// ---- evidence per bug
for (const b of bugs) {
  // Newest evidence run for this bug: assets/BUG-xx/<run id>/
  const dir = latestRun(path.join(root, 'assets', b.id), (d) => fs.existsSync(path.join(d, 'log.json')));
  const log = dir && readJson(path.join(dir, 'log.json'));
  const rel = dir ? path.relative(root, dir).split(path.sep).join('/') : '';
  b.evidence = log
    ? {
        reproduced: log.reproduced, summary: log.summary, recordedAt: log.recordedAt, viewport: log.viewport,
        files: ['recording-start.webm', 'screenshot-start.png', 'network-start.har', 'log-start.json', 'recording.webm', 'screenshot.png', 'network.har', 'log.json'].filter((f) => fs.existsSync(path.join(dir, f))).map((f) => `${rel}/${f}`),
        runId: path.basename(dir), history: fs.readdirSync(path.join(root, 'assets', b.id)).filter((n) => !n.endsWith('.incomplete')).length,
        apiOnly: b.component === 'API',
      }
    : null;
  b.automated = results.filter((r) => r.bugIds.includes(b.id)).map((r) => ({ tc: r.tcIds[0], suite: r.suite, outcome: r.outcome }));
}

const rtm = buildRtm(reqs.requirements, cases, results, bugs);
const drift = checkCatalogue(cases, results, bugs);
const byCase = Object.fromEntries(cases.map((c) => [c.id, results.filter((r) => r.tcIds.includes(c.id))]));

// ---- markdown deliverables
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const caseState = (c) => {
  const rs = byCase[c.id] ?? [];
  if (c.automated === false) return 'not automatable here';
  if (!rs.length) return 'not run';
  return rs.map((r) => r.outcome).join(', ');
};

function bugsMd() {
  const count = (sev) => bugs.filter((b) => b.severity === sev).length;
  const groups = [...new Set(bugs.map((b) => b.rootCauseGroup))];
  let md = `# Bug list\n\n`;
  md += `## Summary\n\n${bugs.length} bugs: ${SEV_ORDER.map((s) => `${count(s)} ${s}`).join(', ')}. They come from ${groups.length} root-cause groups, so the fix work is smaller than the count suggests. What matters most:\n\n`;
  md += `- **Missing server-side checks on who may act.** Any customer can edit an event (BUG-01) and read or cancel any other customer's order (BUG-02, BUG-03). The observed behaviour suggests small, missing server-side guards (a hypothesis: no source was available); they should be fixed first.\n`;
  md += `- **Business rules enforced in the UI or not at all.** Pricing (BUG-05 to BUG-07), quantities and caps (BUG-04, BUG-08), past events, refunds, repeat cancels and the cart hold (BUG-09 to BUG-12) are not enforced by the API.\n`;
  md += `- On phones a visitor cannot even log in or sign up, because the menu opens behind the page (BUG-37), and a logged-in buyer cannot reach quantity or Add (BUG-25).\n\n`;
  md += `Environment: ${bugsDoc.environment}\n\n${bugsDoc.effortNote} Severity scale (who is harmed and how much): ${Object.entries(bugsDoc.severityScale).map(([k, v]) => `**${k}** ${v}`).join('; ')}.\n\n`;
  md += `Evidence: each bug links its newest complete recording run, \`assets/BUG-xx/<YYYYMMDDTHHmmssSSS>/\`: \`recording.webm\` (video), \`screenshot.png\`, \`network.har\` (API traffic, cookies and tokens redacted) and \`log.json\` (every API request and response of the run). For bugs marked **API**, \`log.json\` is the primary evidence and the screenshot shows the on-screen request log. Causes are written as **hypotheses**: without the source code, only the observed behaviour is fact.\n\n`;
  md += `## All bugs, most severe first\n\n| Id | Severity | Title | Root-cause group | Effort |\n|---|---|---|---|---|\n`;
  for (const b of [...bugs].sort(bySeverity)) md += `| [${b.id}](#${b.id.toLowerCase()}) | ${b.severity} | ${esc(b.title)} | ${esc(b.rootCauseGroup)} | ${b.effort} |\n`;
  md += `\n## Root-cause groups (suggested fix order)\n\n`;
  for (const g of groups) {
    const gb = bugs.filter((b) => b.rootCauseGroup === g).sort(bySeverity);
    md += `- **${g}**: ${gb.map((b) => `${b.id} (${b.severity})`).join(', ')}\n`;
  }
  for (const b of [...bugs].sort(bySeverity)) {
    md += `\n## ${b.id}\n\n**${b.title}**\n\n| | |\n|---|---|\n| Severity | ${b.severity} |\n| Status | ${b.status} |\n| Area | ${b.area} (${b.component}) |\n| Requirement | ${b.requirements.join(', ')} |\n| Found by | ${b.tests.join(', ')} |\n| Who is harmed | ${esc(b.impact)} |\n${b.severityRationale ? `| Why this severity | ${esc(b.severityRationale)} |\n` : ''}| Root-cause group | ${esc(b.rootCauseGroup)} |\n| Likely location | ${esc(b.likelyLocation)}${b.frontendFlag ? ` (bundle flag \`${b.frontendFlag}\`)` : ''} |\n| Effort (estimate) | ${b.effort} |\n| Related | ${(b.relatedBugs ?? []).join(', ') || 'none'} |\n\n`;
    md += `**Steps to reproduce**\n\n${b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**Expected:** ${b.expected}\n\n**Actual:** ${b.actual}\n\n**Hypothesis (not verified against source):** ${b.hypothesis}\n\n`;
    if (b.notes) md += `**Note:** ${b.notes}\n\n`;
    if (b.evidence) {
      const shot = b.evidence.files.find((f) => f.endsWith('/screenshot.png'));
      md += `**Evidence** (run ${b.evidence.runId}, ${b.evidence.reproduced ? 'reproduced' : 'NOT reproduced'}: ${esc(b.evidence.summary)}): ${b.evidence.files.map((f) => `[${path.basename(f)}](./${f})`).join(' · ')}\n\n`;
      if (shot) md += `![${b.id}](./${shot})\n`;
    } else md += `**Evidence:** not recorded yet.\n`;
  }
  md += `\n## Observations (not filed as bugs)\n\n${bugsDoc.observations.map((o) => `- **${o.id}** ${o.text}`).join('\n')}\n`;
  return md;
}

function testCasesMd() {
  const flow = cases.filter((c) => c.id.startsWith('TC-DISC-'));
  let md = `# Test cases: applying a discount code\n\n**Flow picked: applying a discount code.** ${flow.length} cases below (${['positive', 'negative', 'boundary'].map((t) => `${flow.filter((c) => c.type === t).length} ${t}`).join(', ')}). Each is automated (API suite \`automation/tests/api/discount.spec.ts\`, UI cases in \`tests/e2e/regression\`) and traced to the brief in [rtm.md](./rtm.md). The full catalogue of ${cases.length} cases for every flow is in \`spec/test-cases.json\` and on the dashboard.\n\n`;
  md += `Rules under test (quoted from the brief): "Discount codes apply to Standard tickets. Each order takes one discount code once." and "take the subtotal, subtract the discount, then charge the 5% service fee on what is left after the discount". The brief names no codes; \`WELCOME10\` (10% off) was found on the live system (GAP-01).\n\n`;
  md += `Priority: **P1** release blocker if it fails; **P2** must be fixed before the next release; **P3** fix when convenient. Amounts use the live prices of the upcoming event at the time of writing (Standard ₫100,000, VIP ₫300,000, Student ₫50,000); the automated checks compute the same figures from the live price, so they stay right if prices change.\n\n`;
  md += `| Id | Title | Type | Priority | Requirement | Last result |\n|---|---|---|---|---|---|\n`;
  for (const c of flow) md += `| [${c.id}](#${c.id.toLowerCase()}) | ${esc(c.title)} | ${c.type} | ${c.priority} | ${c.requirements.join(', ')} | ${caseState(c)} |\n`;
  for (const c of flow) {
    md += `\n## ${c.id}\n\n**${c.title}**\n\n| Type | Priority | Requirement | Suite | Linked bug |\n|---|---|---|---|---|\n| ${c.type} | ${c.priority} | ${c.requirements.join(', ')} | ${c.suite} | ${(c.bugs ?? []).join(', ') || 'none'} |\n\n`;
    md += `**Preconditions:** ${c.preconditions}\n\n**Steps**\n\n${c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n**Expected result:** ${c.expected}\n`;
  }
  return md;
}

function rtmMd() {
  let md = `# Requirements traceability matrix\n\nGenerated from \`spec/requirements.json\`, \`spec/test-cases.json\`, the latest automated runs and \`spec/bugs.json\`. States: **covered-passing** (all linked tests green), **covered-failing** (a linked test is red; see the bug), **designed-not-run** (a case exists but cannot run here, with the reason), **not-covered** (no case; shown so the gap is visible).\n\n`;
  const count = (s) => rtm.filter((r) => r.state === s).length;
  md += `${rtm.length} requirements: ${count('covered-passing')} passing, ${count('covered-failing')} failing, ${count('designed-not-run')} designed but not run, ${count('not-covered')} not covered.\n\n`;
  md += `| Requirement | Rule | Test cases | Automated runs | Passed | Failed | Bugs | State |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of rtm) {
    const failed = r.outcomes['failed-known-bug'] + r.outcomes['failed-unexplained'];
    md += `| ${r.requirement.id} | ${esc(r.requirement.rule)} | ${r.testCases.join(', ') || '—'} | ${r.automatedTests} | ${r.outcomes.passed} | ${failed} | ${r.bugs.join(', ') || '—'} | ${r.state} |\n`;
  }
  md += `\n## Catalogue and code consistency\n\n- Test cases not automated: ${drift.notAutomated.join(', ') || 'none'}\n- Ids in test code missing from the catalogue: ${drift.unknownInTests.join(', ') || 'none'}\n- Bugs without an automated test: ${drift.bugsWithoutTest.join(', ') || 'none'}\n- Bug ids in test code missing from the bug list: ${drift.unknownBugsInTests.join(', ') || 'none'}\n`;
  return md;
}

fs.writeFileSync(path.join(root, 'bugs.md'), bugsMd());
fs.writeFileSync(path.join(root, 'test-cases.md'), testCasesMd());
fs.writeFileSync(path.join(root, 'rtm.md'), rtmMd());

// ---- dashboard
const data = {
  generatedAt: new Date().toISOString(),
  envName: process.env.ENV_NAME ?? 'candidate-01',
  projects: PROJECTS.map((p) => ({ name: p.name, label: p.label, browser: p.browser, device: p.device ?? null, mustPass: p.mustPass })),
  manifest: Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, v.runId ?? null])),
  target: bugsDoc.environment,
  requirements: reqs.requirements,
  gaps: reqs.specGaps,
  testCases: cases.map((c) => ({ ...c, results: (byCase[c.id] ?? []).map((r) => ({ suite: r.suite, outcome: r.outcome, mechanism: r.mechanism, durationMs: r.durationMs, error: r.error, skipReason: r.skipReason, bugIds: r.bugIds })) })),
  results: results.map(({ error, ...r }) => ({ ...r, error: error?.slice(0, 400) })),
  runs,
  unit,
  stability: latestJson(path.join(auto, 'reports', 'stability')),
  evidenceRun: evidenceRep ? { startedAt: evidenceRep.stats?.startTime, expected: evidenceRep.stats?.expected, unexpected: evidenceRep.stats?.unexpected } : null,
  bugs,
  observations: bugsDoc.observations,
  severityScale: bugsDoc.severityScale,
  rtm: rtm.map((r) => ({ id: r.requirement.id, area: r.requirement.area, rule: r.requirement.rule, testCases: r.testCases, automatedTests: r.automatedTests, outcomes: r.outcomes, bugs: r.bugs, state: r.state })),
  drift,
  process: processLog.entries,
  docs: {
    // Tables are wrapped so they span the card and scroll inside it on narrow screens, never stretching it.
    overview: marked.parse(fs.readFileSync(path.join(root, 'project-overview.md'), 'utf8')).replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, '</table></div>'),
    plan: marked.parse(fs.readFileSync(path.join(root, 'test-plan.md'), 'utf8')).replace(/<table>/g, '<div class="doc-table"><table>').replace(/<\/table>/g, '</table></div>'),
  },
};
const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const PLACEHOLDER = '/*__QA_DATA__*/null';
if (template.split(PLACEHOLDER).length !== 2) throw new Error('template.html must contain the data placeholder exactly once');
const safe = JSON.stringify(data).replace(/</g, '\\u003c');
// A function replacement: a string replacement would expand $& or $' found in the rendered docs.
const html = template.replace(PLACEHOLDER, () => safe);
// Read the data back out of the page and compare: the page must carry exactly what was built.
const inlined = html.slice(html.indexOf('const DATA = ') + 'const DATA = '.length, html.indexOf(';\nconst ASSET'));
if (JSON.stringify(JSON.parse(inlined)) !== JSON.stringify(data)) throw new Error('dashboard/index.html does not carry the built data');
fs.writeFileSync(path.join(here, 'index.html'), html);
fs.rmSync(path.join(here, 'data.json'), { force: true }); // the one copy is inside index.html

const s = summarise(results).byOutcome;
const driftProblems = [
  ...drift.notAutomated.map((id) => `case ${id} has no automated run`),
  ...drift.unknownInTests.map((id) => `test id ${id} is not in the catalogue`),
  ...drift.bugsWithoutTest.map((id) => `bug ${id} has no automated test run`),
  ...drift.unknownBugsInTests.map((id) => `bug id ${id} in tests is not in the tracker`),
  ...drift.passedWithOpenBug.map((x) => `${x} passed while its bug is open`),
];
console.log(`dashboard: ${results.length} automated results (${JSON.stringify(s)}), ${bugs.length} bugs, ${rtm.length} requirements, coverage ${coverage ? coverage.lines + '% lines' : 'missing'}`);
if (driftProblems.length) {
  console.error(`catalogue drift (${driftProblems.length}):\n- ${driftProblems.join('\n- ')}`);
  process.exitCode = 1; // files are still written so the dashboard shows the drift, but the build is red
} else console.log('drift: none');
