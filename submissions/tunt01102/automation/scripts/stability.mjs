// PRINCIPLES 6: three consistent runs before a pull request. Runs smoke, API and regression N times (each
// run under its own id), then compares every test's outcome across runs. Writes reports/stability/<id>.json.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { flattenPlaywright } from '../src/report/aggregate.ts';
import { runStamp } from '../src/report/runId.ts';

const N = Number(process.argv[2] ?? 3);
const SUITES = ['smoke', 'api', 'regression']; // the Chromium suites; cross-engine projects are checked by the gate
const runs = [];
for (let i = 1; i <= N; i++) {
  const outcomes = {};
  const ids = {};
  for (const s of SUITES) {
    const id = runStamp();
    ids[s] = id;
    try {
      execSync(`npx playwright test --project=${s}`, { env: { ...process.env, RUN_ID: id, RUN_SCOPE: 'full' }, stdio: ['ignore', 'ignore', 'inherit'] });
    } catch { /* red tests exit non-zero; the report is what counts */ }
    const file = path.join('reports', s, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`run ${i} ${s}: no report at ${file}, the run did not happen`);
    for (const r of flattenPlaywright(JSON.parse(fs.readFileSync(file, 'utf8')))) outcomes[`${r.project}:${r.tcIds[0] ?? r.title}`] = r.outcome;
  }
  runs.push({ run: i, reportIds: ids, outcomes });
  console.log(`run ${i}:`, Object.values(outcomes).reduce((m, o) => ((m[o] = (m[o] ?? 0) + 1), m), {}));
}
const keys = Object.keys(runs[0].outcomes);
const differences = keys.filter((k) => runs.some((r) => r.outcomes[k] !== runs[0].outcomes[k]));
const id = runStamp();
fs.mkdirSync('reports/stability', { recursive: true });
fs.writeFileSync(`reports/stability/${id}.json`, JSON.stringify({ runs: N, tests: keys.length, differences, at: new Date().toISOString(), reports: runs.map((r) => r.reportIds) }, null, 2));
console.log(`stability ${id}: ${keys.length} tests, ${differences.length ? 'changed: ' + differences.join(', ') : 'no outcome changed'}`);
// Exit code is the verdict: any changed outcome is a defect in the tests or the environment (PRINCIPLES 6).
process.exitCode = differences.length ? 1 : 0;
