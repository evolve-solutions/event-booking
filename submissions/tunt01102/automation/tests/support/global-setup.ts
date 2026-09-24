// Runs once per Playwright run, in the main process, before any worker starts. Environment variables set
// here are inherited by every worker.
import fs from 'node:fs';
import path from 'node:path';
import { ApiClient } from '../../src/api/client';
import { chooseWorld } from '../../src/data/world';
import { currentRunId } from '../../src/report/runId';

export default async function globalSetup() {
  const api = new ApiClient();
  const health = await api.health();
  if (health.status !== 200) throw new Error(`site not healthy: ${health.status} ${health.text}`); // entry criterion
  const file = path.resolve('reports', 'world', `${currentRunId()}.json`);
  // Shards of one run share the run id and must test the same events: the first shard chooses, the rest reuse.
  if (!fs.existsSync(file)) {
    const list = await api.listEvents({ pageSize: 100 });
    if (list.status !== 200) throw new Error(`cannot list events: ${list.status}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(chooseWorld(list.body.items), null, 2));
  }
  process.env.WORLD_FILE = file;
}
