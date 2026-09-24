// CI gate. The API and regression suites are red by design while bugs are open, so a raw exit code says
// nothing. This gate fails only on what needs a person: a missing report, an unexplained failure, a flaky
// test, a test tagged with an open bug that passed, or any failure in smoke.
import fs from 'node:fs';
import path from 'node:path';
import { checkCatalogue, flattenPlaywright } from '../src/report/aggregate.ts';
import { latestRun } from '../src/report/runId.ts';
import { gatedProjects, projectByName } from '../src/projects.ts';

// Default: every gated project in src/projects.ts. A list on the command line narrows it.
const suites = process.argv[2] ? process.argv[2].split(',') : gatedProjects().map((p) => p.name);
const spec = (f) => JSON.parse(fs.readFileSync(path.resolve('..', 'spec', f), 'utf8'));
const cases = spec('test-cases.json').testCases;
const bugs = spec('bugs.json').bugs;
const problems = [];
const rows = [];
for (const s of suites) {
  const file = latestRun(path.join('reports', s));
  if (!file) { problems.push(`${s}: no full-run report`); continue; }
  // An unmerged shard run newer than the newest merged report means the merge step did not run.
  const blobs = fs.existsSync(path.join('reports', s)) ? fs.readdirSync(path.join('reports', s)).filter((n) => n.endsWith('.blobs')).sort() : [];
  if (blobs.length && blobs[blobs.length - 1].slice(0, 18) > path.basename(file).slice(0, 18)) problems.push(`${s}: shard blobs ${blobs[blobs.length - 1]} were never merged`);
  const results = flattenPlaywright(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!results.length) problems.push(`${s}: report ${path.basename(file)} has no tests`);
  const count = (o) => results.filter((r) => r.outcome === o).length;
  rows.push({ suite: s, run: path.basename(file, '.json'), tests: results.length, passed: count('passed'), knownBug: count('failed-known-bug'), unexplained: count('failed-unexplained'), flaky: count('flaky'), skipped: count('skipped') });
  for (const r of results) {
    if (r.outcome === 'failed-unexplained') problems.push(`${s}: unexplained failure ${r.tcIds[0] ?? r.title}`);
    if (r.outcome === 'flaky') problems.push(`${s}: flaky ${r.tcIds[0] ?? r.title}`);
    if (projectByName(s)?.mustPass && r.outcome !== 'passed') problems.push(`${s}: ${r.tcIds[0] ?? r.title} is ${r.outcome}; this project must be green`);
  }
  for (const p of checkCatalogue(cases, results, bugs).passedWithOpenBug) problems.push(`${s}: ${p} passed while its bug is open (fixed, or passing for the wrong reason?)`);
}
console.table(rows);
if (problems.length) {
  console.error(`GATE FAILED (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('GATE PASSED: every failure is a known, open bug; nothing unexplained, nothing flaky.');
