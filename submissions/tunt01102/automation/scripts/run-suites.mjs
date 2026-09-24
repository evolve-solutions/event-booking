// Runs Playwright suites one after another (portable: no shell operators). Red tests do not stop the run;
// the gate decides. Usage: node scripts/run-suites.mjs [project,project,...]  (default: every gated project)
import { spawnSync } from 'node:child_process';
import { gatedProjects } from '../src/projects.ts';

const suites = process.argv[2] ? process.argv[2].split(',') : gatedProjects().map((p) => p.name);
for (const s of suites) {
  const r = spawnSync('npx', ['playwright', 'test', `--project=${s}`], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, RUN_ID: '' } });
  if (r.error) throw r.error;
  console.log(`${s}: exit ${r.status} (red tests are expected while bugs are open; see the gate)`);
}
