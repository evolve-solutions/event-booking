// Merges the blob reports of one sharded run into reports/<project>/<run id>.json (OI-5).
// Usage: node scripts/merge-shards.mjs <project> <run id>
// Refuses if a shard is missing or a test appears twice, so a half-merged run can never pass for a full one.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { flattenPlaywright } from '../src/report/aggregate.ts';

const [project, runId] = process.argv.slice(2);
if (!project || !/^\d{8}T\d{9}$/.test(runId ?? '')) throw new Error('usage: merge-shards.mjs <project> <YYYYMMDDTHHmmssSSS>');
const dir = path.join('reports', project, `${runId}.blobs`);
if (!fs.existsSync(dir)) throw new Error(`no blobs at ${dir}`);
const blobs = fs.readdirSync(dir).filter((f) => /^shard-\d+-of-\d+\.zip$/.test(f));
const totals = new Set(blobs.map((f) => f.match(/-of-(\d+)/)[1]));
if (totals.size !== 1) throw new Error(`blobs disagree on the shard count: ${blobs.join(', ')}`);
const total = Number([...totals][0]);
const missing = Array.from({ length: total }, (_, i) => `shard-${i + 1}-of-${total}.zip`).filter((f) => !blobs.includes(f));
if (missing.length) throw new Error(`missing shard blobs: ${missing.join(', ')}`);

const out = path.join('reports', project, `${runId}.json`);
execFileSync('npx', ['playwright', 'merge-reports', '--reporter', 'json', dir], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: out, RUN_ID: runId, RUN_NAME: project, RUN_SCOPE: 'full' },
});
const rows = flattenPlaywright(JSON.parse(fs.readFileSync(out, 'utf8')));
const keys = rows.map((r) => `${r.project}|${r.title}`);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
if (!rows.length || dupes.length) {
  fs.renameSync(out, `${out}.rejected`);
  throw new Error(rows.length ? `a test appears in more than one shard: ${dupes.join('; ')}` : 'merged report is empty');
}
console.log(`merged ${total} shards of ${project} run ${runId}: ${rows.length} tests -> ${out}`);
