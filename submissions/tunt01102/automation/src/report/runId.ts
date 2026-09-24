// Every run writes under its own timestamp so no run can overwrite another's output.
// Format: YYYYMMDDTHHmmssSSS in Vietnam time, e.g. 20260924T105522123. It sorts as text in time order.
// Self-contained on purpose: the Playwright and Vitest configs and the dashboard build all import it.
import fs from 'node:fs';
import path from 'node:path';

export const RUN_ID_PATTERN = /^\d{8}T\d{9}$/;

export function runStamp(date: Date = new Date(), timeZone = 'Asia/Ho_Chi_Minh'): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}${ms}`;
}

/**
 * One id per run, shared by the main process and its workers: the first caller sets RUN_ID in the
 * environment and every process spawned afterwards inherits it.
 */
export function currentRunId(env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): string {
  if (!env.RUN_ID || !RUN_ID_PATTERN.test(env.RUN_ID)) env.RUN_ID = runStamp(now());
  return env.RUN_ID;
}

/**
 * Newest entry (file or folder) in `dir` named `<run id>` or `<run id>.<ext>`; null when there is none.
 * Names like `<run id>.incomplete` are never picked. `accept` can reject an entry (e.g. a folder without its log).
 */
export function latestRun(dir: string, accept: (full: string) => boolean = () => true): string | null {
  if (!fs.existsSync(dir)) return null;
  const names = fs
    .readdirSync(dir)
    .filter((n) => RUN_ID_PATTERN.test(n.slice(0, 18)) && (n.length === 18 || /^\.(json|log)$/.test(n.slice(18))))
    .filter((n) => accept(path.join(dir, n)))
    .sort();
  return names.length ? path.join(dir, names[names.length - 1]) : null;
}

/** Turns a stamp back into an ISO instant (Vietnam time is UTC+7, no daylight saving). */
export function stampToIso(stamp: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})$/.exec(stamp);
  if (!m) throw new Error(`not a run id: ${stamp}`);
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${m[7]}+07:00`).toISOString();
}
