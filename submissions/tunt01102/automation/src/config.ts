// The one place environment-dependent settings live. Everything else imports from here.

const DEFAULT_BASE_URL = 'https://candidate-01.207.148.118.135.sslip.io';

export interface Config {
  /** Site under test. Required in CI so a pipeline can never silently test the wrong host. */
  baseUrl: string;
  /** Label shown on the dashboard. */
  envName: string;
  /** Browser time zone for UI tests: deliberately not UTC+7, so Vietnam-time display must convert. */
  browserTimeZone: string;
  /** Time zone every user-facing time must be shown in (REQ-TZ-01). */
  displayTimeZone: string;
  /** Parallel workers: lower in CI because the site is shared. */
  workers: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.CI && !env.BASE_URL) throw new Error('BASE_URL must be set in CI');
  return {
    baseUrl: (env.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
    envName: env.ENV_NAME ?? 'candidate-01',
    browserTimeZone: env.BROWSER_TZ ?? 'Europe/London',
    displayTimeZone: 'Asia/Ho_Chi_Minh',
    workers: Number(env.WORKERS ?? (env.CI ? 2 : 4)),
  };
}

export const config = loadConfig();
