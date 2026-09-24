// Keeps the newest complete evidence run per bug in ../assets and MOVES older runs (never deletes) to
// evidence-archive/<bug>/<run id>/, which is not committed. Usage: node scripts/prune-evidence.mjs [keep=1]
import fs from 'node:fs';
import path from 'node:path';

const keep = Number(process.argv[2] ?? 1);
const assets = path.resolve('..', 'assets');
const archive = path.resolve('evidence-archive');
let moved = 0;
for (const bug of fs.readdirSync(assets).filter((b) => /^BUG-\d+$/.test(b))) {
  const runs = fs.readdirSync(path.join(assets, bug)).filter((r) => /^\d{8}T\d{9}(\.incomplete)?$/.test(r)).sort();
  const complete = runs.filter((r) => !r.endsWith('.incomplete') && fs.existsSync(path.join(assets, bug, r, 'log.json')));
  const keepSet = new Set(complete.slice(-keep));
  for (const r of runs) {
    if (keepSet.has(r)) continue;
    fs.mkdirSync(path.join(archive, bug), { recursive: true });
    fs.renameSync(path.join(assets, bug, r), path.join(archive, bug, r));
    moved++;
  }
}
console.log(`moved ${moved} older evidence run(s) to ${archive}; kept the newest ${keep} complete run per bug`);
