import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './src/api/client';
import { currentRunId } from './src/report/runId';
import { config } from './src/config';
import { grepFor, PROJECTS } from './src/projects';

// Every run gets its own YYYYMMDDTHHmmssSSS id (Vietnam time), set once in the main process and inherited
// by the workers, so no run can overwrite another's report, output folder or evidence.
// Sharding (OI-5): SHARD=i/n. Every shard of one run must share one RUN_ID, so it has to be given, not minted.
const SHARD = process.env.SHARD ? /^(\d+)\/(\d+)$/.exec(process.env.SHARD) : null;
if (process.env.SHARD && !SHARD) throw new Error(`SHARD must look like 1/2, got ${process.env.SHARD}`);
if (SHARD && !/^\d{8}T\d{9}$/.test(process.env.RUN_ID ?? '')) throw new Error('a sharded run needs RUN_ID=<YYYYMMDDTHHmmssSSS> shared by all shards');
if (SHARD) process.env.RUN_SCOPE = 'full'; // a shard is part of a full run, not a filtered one
const RUN_ID = currentRunId();
// A filtered run (-g, or named files) is marked partial so it can never pass for the suite's latest full run.
if (!process.env.RUN_SCOPE) {
  const args = process.argv.slice(process.argv.indexOf('test') + 1);
  const valueFlags = ['--project', '-c', '--config', '--workers', '-j', '--shard', '--reporter', '--output', '--timeout'];
  const filtered = args.some((a, i) => a === '-g' || a === '--grep' || a.startsWith('--grep=') || (!a.startsWith('-') && !valueFlags.includes(args[i - 1] ?? '')));
  process.env.RUN_SCOPE = filtered ? 'partial' : 'full';
}
// Suite name comes from --project (portable npm scripts, no shell env syntax); RUN_NAME can override it.
if (!process.env.RUN_NAME) {
  const projects = process.argv.flatMap((a, i, all) => (a.startsWith('--project=') ? [a.slice(10)] : a === '--project' ? [all[i + 1]] : []));
  process.env.RUN_NAME = projects.length ? projects.join('+') : 'all';
}
const SUITE = `${process.env.RUN_NAME}${process.env.RUN_SCOPE === 'partial' ? '-partial' : ''}`;

// Retries are off on purpose: a pass must come from the first attempt, and the report records the route (VERIFICATION.md 1).
export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: config.workers,
  forbidOnly: !!process.env.CI,
  globalSetup: './tests/support/global-setup.ts',
  outputDir: `test-results/${RUN_ID}-${SUITE}${SHARD ? `-shard${SHARD[1]}` : ''}`,
  shard: SHARD ? { current: Number(SHARD[1]), total: Number(SHARD[2]) } : undefined,
  // A shard writes one blob with its own outputFile (so it never clears another shard's folder); the
  // merge step (scripts/merge-shards.mjs) turns the blobs into the usual reports/<suite>/<run id>.json.
  reporter: SHARD
    ? [['list'], ['blob', { outputFile: `reports/${SUITE}/${RUN_ID}.blobs/shard-${SHARD[1]}-of-${SHARD[2]}.zip` }]]
    : [
        ['list'],
        ['json', { outputFile: `reports/${SUITE}/${RUN_ID}.json` }],
        ['html', { outputFolder: `playwright-report/${RUN_ID}-${SUITE}`, open: 'never' }],
      ],
  use: {
    baseURL: BASE_URL,
    timezoneId: config.browserTimeZone, // deliberately not UTC+7, so a time shown in Vietnam time has to be converted
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Test projects come from src/projects.ts, the one list the gate, dashboard and scripts also read.
    ...PROJECTS.map((p) => ({
      name: p.name,
      testDir: `tests/${p.dir}`,
      grep: grepFor(p),
      timeout: p.timeoutMs,
      // A device descriptor sets defaultBrowserType, so each engine gets its own descriptor, never Chrome's.
      use: p.device ? { ...devices[p.device], timezoneId: config.browserTimeZone } : {},
    })),
    {
      name: 'evidence-timing',
      testDir: 'tests/evidence',
      testMatch: 'timing.evidence.spec.ts',
      timeout: 45 * 60_000,
      use: { ...devices['Desktop Chrome'], timezoneId: config.browserTimeZone, video: 'off', trace: 'off' },
    },
    {
      name: 'evidence',
      testDir: 'tests/evidence',
      testMatch: 'bugs.evidence.spec.ts',
      outputDir: `test-results/${RUN_ID}-${SUITE}`, // per run: a parallel run can never wipe a long recording
      workers: 2,
      use: { ...devices['Desktop Chrome'], timezoneId: config.browserTimeZone, video: 'off', screenshot: 'off', trace: 'retain-on-failure' }, // the recorder films each bug itself
    },
  ],
});
