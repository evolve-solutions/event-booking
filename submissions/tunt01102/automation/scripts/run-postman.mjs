// Runs the Postman collection (00 Setup, 01 API reference, 02 Bug reproductions) with Newman against the live
// site. The run is saved under postman/runs/<run id>.json, which stays local: it holds session cookies.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { currentRunId } from '../src/report/runId.ts';

const id = currentRunId();
fs.mkdirSync('postman/runs', { recursive: true });
const folders = ['00 Setup (run first)', '01 API reference (27 operations)', '02 Bug reproductions'].flatMap((f) => ['--folder', f]);
execFileSync('npx', ['--yes', 'newman@6', 'run', 'postman/event-booking.postman_collection.json', '-e', 'postman/event-booking.postman_environment.json',
  ...folders, '-r', 'cli,json', '--reporter-json-export', `postman/runs/${id}.json`, '--reporter-cli-no-assertions', '--reporter-cli-no-console'], { stdio: 'inherit' });
