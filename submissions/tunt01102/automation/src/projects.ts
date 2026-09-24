// The one list of test projects. playwright.config.ts builds its projects from it; the gate, the stability
// script, the suite runner and the dashboard build read it, so a new project is added in one place only.

export type Browser = 'chromium' | 'firefox' | 'webkit';

export interface ProjectDef {
  /** Project name; also the reports folder: reports/<name>/<run id>.json */
  name: string;
  /** Test folder under tests/ */
  dir: string;
  browser: Browser | null; // null: API-level, no page
  /** Playwright device descriptor name */
  device?: string;
  /** Only these test cases (by title prefix), for targeted cross-engine checks */
  only?: string[];
  /** Runs in `test:all` and is checked by the gate */
  gated: boolean;
  /** Must be fully green (smoke) */
  mustPass: boolean;
  /** Shown on the dashboard as a suite */
  label: string;
  timeoutMs?: number;
}

export const PROJECTS: ProjectDef[] = [
  { name: 'smoke', dir: 'e2e/smoke', browser: 'chromium', device: 'Desktop Chrome', gated: true, mustPass: true, label: 'Smoke E2E' },
  { name: 'api', dir: 'api', browser: null, gated: true, mustPass: false, label: 'API' },
  { name: 'regression', dir: 'e2e/regression', browser: 'chromium', device: 'Desktop Chrome', gated: true, mustPass: false, label: 'Regression E2E' },
  // Targeted cross-engine checks (not a full matrix): the buyer path on the other two engines, and the phone
  // tests on WebKit's iPhone emulation, which backs the 360 px findings with a second engine.
  { name: 'smoke-firefox', dir: 'e2e/smoke', browser: 'firefox', device: 'Desktop Firefox', gated: true, mustPass: true, label: 'Smoke · Firefox' },
  { name: 'smoke-webkit', dir: 'e2e/smoke', browser: 'webkit', device: 'Desktop Safari', gated: true, mustPass: true, label: 'Smoke · WebKit' },
  { name: 'mobile-webkit', dir: 'e2e/regression', browser: 'webkit', device: 'iPhone 13', only: ['[TC-UI-01]', '[TC-UI-02]', '[TC-UI-18]', '[TC-UI-19]'], gated: true, mustPass: false, label: 'Phone · WebKit' },
  { name: 'slow', dir: 'slow', browser: null, gated: false, mustPass: false, label: 'Slow (real waits)', timeoutMs: 40 * 60_000 },
];

export const gatedProjects = (): ProjectDef[] => PROJECTS.filter((p) => p.gated);
export const projectByName = (name: string): ProjectDef | undefined => PROJECTS.find((p) => p.name === name);

/** Title filter for a targeted project: matches any of its test-case prefixes. */
export function grepFor(p: ProjectDef): RegExp | undefined {
  if (!p.only?.length) return undefined;
  return new RegExp(p.only.map((s) => s.replace(/[[\]]/g, '\\$&')).join('|'));
}
