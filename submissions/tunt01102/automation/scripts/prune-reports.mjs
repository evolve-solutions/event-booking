// Report retention (OI-9). Keeps, per reports/<suite>/, the newest N full reports plus any report the newest
// stability record points at, and the world files and coverage summaries of the kept runs. Everything else is
// MOVED (never deleted) to reports-archive/, which is not committed. Usage: node scripts/prune-reports.mjs [N=3]
import fs from 'node:fs';
import path from 'node:path';
import { latestRun, RUN_ID_PATTERN } from '../src/report/runId.ts';

const keepN = Number(process.argv[2] ?? 3);
const archive = path.resolve('reports-archive');
const stamp = (n) => n.slice(0, 18);
const move = (from, sub) => {
  const to = path.join(archive, sub, path.basename(from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return 1;
};
const stability = latestRun('reports/stability');
const pinned = new Set(stability ? JSON.parse(fs.readFileSync(stability, 'utf8')).reports.flatMap((r) => Object.values(r)) : []);
const keptIds = new Set();
let moved = 0;
for (const suite of fs.readdirSync('reports')) {
  const dir = path.join('reports', suite);
  if (!fs.statSync(dir).isDirectory() || ['world', 'logs', 'stability'].includes(suite)) continue;
  const runs = fs.readdirSync(dir).filter((n) => RUN_ID_PATTERN.test(stamp(n)) && n.endsWith('.json')).sort();
  const keep = new Set([...runs.slice(-keepN), ...runs.filter((n) => pinned.has(stamp(n)))]);
  for (const n of runs) keep.has(n) ? keptIds.add(stamp(n)) : (moved += move(path.join(dir, n), suite));
}
for (const n of fs.readdirSync('reports/world')) if (!keptIds.has(stamp(n))) moved += move(path.join('reports/world', n), 'world');
const cov = fs.existsSync('coverage') ? fs.readdirSync('coverage').filter((n) => RUN_ID_PATTERN.test(n)).sort() : [];
for (const n of cov.slice(0, -keepN)) moved += move(path.join('coverage', n), 'coverage');
console.log(`kept ${keptIds.size} run ids (newest ${keepN} per suite + the latest stability runs); moved ${moved} entries to ${archive}`);
