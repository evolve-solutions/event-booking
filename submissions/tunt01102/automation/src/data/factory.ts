// Test data. Every run registers its own buyers so shared published accounts are never polluted.
import { randomBytes } from 'node:crypto';
import { ApiClient } from '../api/client';
import { loadWorld, type World } from './world';

export const DEFAULT_PASSWORD = 'eventpass123';
export const VALID_PHONE = '0912345678';
export const VALID_RECIPIENT = 'QA Buyer';

export function uniqueEmail(prefix = 'qa', rand: () => string = () => randomBytes(4).toString('hex')): string {
  return `${prefix}-${rand()}@example.invalid`;
}

export interface Buyer {
  api: ApiClient;
  email: string;
  password: string;
}

/** Registers and logs in a fresh customer. Throws if either step does not succeed, so no test runs on an empty world. */
export async function newBuyer(api = new ApiClient(), password = DEFAULT_PASSWORD, email = uniqueEmail()): Promise<Buyer> {
  const reg = await api.register({ email, password });
  if (reg.status !== 200) throw new Error(`register failed: ${reg.status} ${reg.text}`);
  const login = await api.login(email, password);
  if (login.status !== 200 || !api.sessionToken) throw new Error(`login failed: ${login.status} ${login.text}`);
  return { api, email, password };
}

/**
 * Events by role (upcoming, upcoming2, quiet, past), chosen by rule from the live list at the start of each
 * run (see src/data/world.ts and tests/support/global-setup.ts). Nothing here is a hard-coded id.
 */
export const EVENTS: World = new Proxy({} as World, { get: (_t, key: string) => (loadWorld() as any)[key] });
