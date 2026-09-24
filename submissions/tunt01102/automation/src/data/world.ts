// The "world" a run tests against: which live events play which role. Chosen by rule from /api/events at the
// start of every run (PRINCIPLES 32) instead of hard-coded ids, so a reseeded or different environment still
// works, and the choice is written down as a receipt of the run.
import fs from 'node:fs';

export interface WorldEvent { id: number; title: string; startsAt: string }
export interface World {
  /** Upcoming, more than 48 h away; its Vietnam date differs from its UTC date when such an event exists. */
  upcoming: WorldEvent;
  /** A second upcoming event more than 48 h away, for cross-event checks. */
  upcoming2: WorldEvent;
  /** An upcoming event no other role uses: stock-delta checks run here so parallel tests do not blur them. */
  quiet: WorldEvent;
  /** An event that has already started (status PAST). */
  past: WorldEvent;
  chosenAt: string;
}

interface ListedEvent extends WorldEvent { status: string }

const HOUR = 3_600_000;
const vnDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * HOUR).toISOString().slice(0, 10);

export function chooseWorld(events: ListedEvent[], now: Date = new Date()): World {
  const pick = ({ id, title, startsAt }: ListedEvent): WorldEvent => ({ id, title, startsAt });
  const past = events.find((e) => e.status === 'PAST');
  const future = events
    .filter((e) => e.status === 'UPCOMING' && new Date(e.startsAt).getTime() - now.getTime() > 48 * HOUR)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  if (!past) throw new Error('world: no PAST event on the site; past-event checks cannot run');
  if (future.length < 3) throw new Error(`world: need 3 upcoming events more than 48 h away, found ${future.length}`);
  const upcoming = future.find((e) => vnDate(e.startsAt) !== e.startsAt.slice(0, 10)) ?? future[0];
  const rest = future.filter((e) => e.id !== upcoming.id);
  return { upcoming: pick(upcoming), upcoming2: pick(rest[0]), quiet: pick(rest[rest.length - 1]), past: pick(past), chosenAt: now.toISOString() };
}

let cached: World | null = null;

/** Reads the world chosen by the run's global setup (path in WORLD_FILE). Fails loudly instead of guessing. */
export function loadWorld(env: NodeJS.ProcessEnv = process.env): World {
  if (cached) return cached;
  const file = env.WORLD_FILE;
  if (!file || !fs.existsSync(file)) throw new Error('world: WORLD_FILE not set or missing; run through Playwright so global setup chooses the world');
  cached = JSON.parse(fs.readFileSync(file, 'utf8')) as World;
  return cached;
}

export function resetWorldCache(): void {
  cached = null;
}
