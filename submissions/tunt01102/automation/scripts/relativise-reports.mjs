// Committed run outputs (reports/**, coverage summaries) carry the absolute paths of the machine that ran them.
// Rewrites them in place: the repository root becomes a repo-relative path and the home directory becomes ~.
// Only the path prefix changes; results are untouched. Run by `npm run dashboard`, so every commit is clean.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve('..', '..', '..');
const swaps = [
  [`file://${repoRoot}/`, ''],
  [`${repoRoot}/`, ''],
  [`file://${os.homedir()}/`, '~/'],
  [`${os.homedir()}/`, '~/'],
];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const files = [
  ...walk('reports').filter((f) => /\.(json|log)$/.test(f) && !f.includes('.blobs')),
  ...(fs.existsSync('coverage') ? walk('coverage').filter((f) => f.endsWith('coverage-summary.json')) : []),
];
let changed = 0;
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  const after = swaps.reduce((t, [from, to]) => t.split(from).join(to), before);
  if (after === before) continue;
  if (f.endsWith('.json')) JSON.parse(after);
  fs.writeFileSync(f, after);
  changed++;
}
console.log(`relativise-reports: ${changed} of ${files.length} files rewritten`);
