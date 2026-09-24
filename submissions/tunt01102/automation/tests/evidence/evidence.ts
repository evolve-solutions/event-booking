// Evidence recorder: every bug is reproduced in a real browser at the site's own origin, so one run yields a
// video, a screenshot at the moment the defect is on screen, a HAR of the API traffic and a readable
// request/response log. Cookies, tokens and passwords are redacted before anything is written.
//
// Layout: assets/BUG-xx/<run id>/. A run writes into '<run id>.incomplete' and is renamed only once its
// log.json exists, so an aborted run can never pass for the latest evidence.
import fs from 'node:fs';
import path from 'node:path';
import type { Browser, BrowserContext, Page, Response as PwResponse } from '@playwright/test';
import { ApiClient, BASE_URL, redact, type FetchLike } from '../../src/api/client';
import { config } from '../../src/config';
import { DEFAULT_PASSWORD } from '../../src/data/factory';
import { currentRunId } from '../../src/report/runId';
import type { BugId } from '../support/ids';

// Playwright runs from the automation folder; evidence lands in the submission's assets folder.
export const ASSETS_DIR = path.resolve(process.cwd(), '../assets');

export interface Evidence {
  page: Page;
  /** The shared API client, sending every request from inside the page (same origin, same cookie). */
  client: ApiClient;
  /** Calls the API from inside the page and shows the exchange on screen. */
  api(method: string, apiPath: string, body?: unknown): Promise<{ status: number; body: any }>;
  /** Registers and logs in a fresh buyer inside the page, then reloads so the UI shows the session. */
  newBuyer(): Promise<string>;
  step(text: string): Promise<void>;
  /** Ticket types of an event, read live. */
  tickets(eventId: number): Promise<Record<'STANDARD' | 'VIP' | 'STUDENT', { id: number; price: number; remaining: number }> & { event: any }>;
  /** Cancels every CONFIRMED order of the current buyer, once, so shared stock is returned. */
  cleanup(): Promise<void>;
  verdict(expected: string, actual: string): Promise<void>;
  /** Screenshot at the moment the defect is on screen (before any clean-up). */
  snap(): Promise<void>;
}

const OVERLAY_CSS = `
#qa-evidence{position:fixed;right:8px;bottom:8px;z-index:2147483647;pointer-events:none;width:min(560px,calc(100vw - 16px));max-height:60vh;overflow:auto;
background:rgba(15,17,21,.94);color:#e8eaed;font:12px/1.45 ui-monospace,Menlo,monospace;border-radius:10px;padding:10px 12px;box-shadow:0 6px 24px rgba(0,0,0,.35)}
#qa-evidence h4{margin:0 0 6px;font:600 13px system-ui;color:#fff}#qa-evidence .s{color:#9ecbff}#qa-evidence .ok{color:#7ee2a8}
#qa-evidence .bad{color:#ff9b9b}#qa-evidence .v{margin-top:6px;padding-top:6px;border-top:1px solid #333}`;

async function overlay(page: Page, bugId: string, html: string) {
  await page
    .evaluate(
      ([id, css, line]) => {
        let box = document.getElementById('qa-evidence');
        if (!box) {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.appendChild(style);
          box = document.createElement('div');
          box.id = 'qa-evidence';
          box.innerHTML = `<h4>${id} — evidence run ${new Date().toISOString()}</h4>`;
          document.body.appendChild(box);
        }
        const div = document.createElement('div');
        div.innerHTML = line;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
      },
      [bugId, OVERLAY_CSS, html] as const,
    )
    .catch(() => undefined);
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

function short(body: unknown): string {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

const parse = (text: string | null | undefined): unknown => {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
};

/** Redacts headers, cookies and both request and response bodies (parsed as JSON where possible). */
export function redactHar(file: string) {
  if (!fs.existsSync(file)) return;
  const har = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const entry of har.log?.entries ?? []) {
    for (const part of [entry.request, entry.response]) {
      part.headers = (part.headers ?? []).map((h: any) => (/^(cookie|set-cookie|authorization)$/i.test(h.name) ? { ...h, value: '<redacted>' } : h));
      part.cookies = (part.cookies ?? []).map((c: any) => ({ ...c, value: '<redacted>' }));
    }
    if (entry.request.postData?.text) entry.request.postData.text = JSON.stringify(redact(parse(entry.request.postData.text)));
    if (entry.response.content?.text) {
      const body = redact(parse(entry.response.content.text));
      entry.response.content.text = typeof body === 'string' ? body : JSON.stringify(body);
    }
  }
  fs.writeFileSync(file, JSON.stringify(har, null, 1));
}

/** FetchLike that runs the request inside the page, so the browser's own cookie is used and HAR records it. */
export function pageFetch(page: Page): FetchLike {
  return async (url, init = {}) => {
    const r = await page.evaluate(
      async ([u, m, h, b]) => {
        const res = await fetch(u, { method: m, headers: h as Record<string, string>, body: b ?? undefined, credentials: 'same-origin' });
        return { status: res.status, text: await res.text() };
      },
      [url, init.method ?? 'GET', (init.headers ?? {}) as Record<string, string>, (init.body as string | undefined) ?? null] as const,
    );
    return new Response(r.text || null, { status: r.status });
  };
}

type Logged = { at: string; method: string; path: string; requestBody: unknown; status: number; responseBody: unknown };

export async function recordEvidence(
  browser: Browser,
  bugId: BugId, // a misspelt id would record into a folder no bug reads, so it must not compile
  run: (ev: Evidence) => Promise<{ reproduced: boolean; summary: string }>,
  opts: {
    viewport?: { width: number; height: number }; isMobile?: boolean; startPath?: string;
    /** Multi-part evidence (before and after a long wait): 'start' files get a suffix; 'end' completes the folder. */
    part?: 'start' | 'end'; storageState?: any;
  } = {},
) {
  const runId = currentRunId();
  const finalDir = path.join(ASSETS_DIR, bugId, runId);
  const dir = `${finalDir}.incomplete`;
  fs.mkdirSync(dir, { recursive: true });
  const sfx = opts.part === 'start' ? '-start' : '';
  const viewport = opts.viewport ?? { width: 1280, height: 800 };
  const context: BrowserContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport,
    isMobile: opts.isMobile,
    hasTouch: opts.isMobile,
    timezoneId: config.browserTimeZone,
    locale: 'en-US',
    storageState: opts.storageState,
    recordVideo: { dir, size: viewport },
    recordHar: { path: path.join(dir, `network${sfx}.har`), content: 'embed', urlFilter: /\/api\// },
  });
  const page = await context.newPage();
  // Every /api/ exchange, whether the test or the UI sent it, goes into log.json.
  const log: Logged[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (res: PwResponse) => {
    if (!res.url().includes('/api/')) return;
    const at = new Date().toISOString();
    pending.push(
      res.text().then(
        (text) => void log.push({
          at, method: res.request().method(), path: res.url().replace(BASE_URL, ''),
          requestBody: redact(parse(res.request().postData())), status: res.status(), responseBody: redact(parse(text)),
        }),
        () => undefined,
      ),
    );
  });
  const steps: string[] = [];
  await page.goto(opts.startPath ?? '/');
  const client = new ApiClient(BASE_URL, pageFetch(page));

  const ev: Evidence = {
    page,
    client,
    async api(method, apiPath, body) {
      const res = await client.request(method, apiPath, body);
      const cls = res.status < 400 ? 'ok' : 'bad';
      await overlay(page, bugId, `<span class="s">${esc(method)} ${esc(apiPath)}</span> ${body === undefined ? '' : esc(short(redact(body)))}<br>→ <span class="${cls}">${res.status}</span> ${esc(short(redact(res.body)))}`);
      return { status: res.status, body: res.body };
    },
    async newBuyer() {
      const email = `qa-ev-${bugId.toLowerCase()}-${Date.now().toString(36)}@example.invalid`;
      await ev.api('POST', '/api/auth/register', { email, password: DEFAULT_PASSWORD });
      await ev.api('POST', '/api/auth/login', { email, password: DEFAULT_PASSWORD });
      await page.reload(); // the header now shows the logged-in buyer in every screenshot
      await overlay(page, bugId, `▸ Logged in as ${esc(email)}`);
      return email;
    },
    async tickets(eventId) {
      const r = await ev.api('GET', `/api/events/${eventId}`);
      return { event: r.body, ...Object.fromEntries(r.body.ticketTypes.map((t: any) => [t.name, t])) } as any;
    },
    async cleanup() {
      await ev.step("Clean-up: cancel this buyer's confirmed orders once");
      const r = await ev.api('GET', '/api/orders');
      for (const o of r.body?.items ?? []) if (o.status === 'CONFIRMED') await ev.api('POST', `/api/orders/${o.id}/cancel`);
    },
    async step(text) {
      steps.push(text);
      await overlay(page, bugId, `▸ ${esc(text)}`);
    },
    async snap() {
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(dir, `screenshot${sfx}.png`), fullPage: false });
    },
    async verdict(expected, actual) {
      steps.push(`Expected: ${expected} | Actual: ${actual}`);
      await overlay(page, bugId, `<div class="v"><b>Expected:</b> ${esc(expected)}<br><b class="bad">Actual:</b> ${esc(actual)}</div>`);
    },
  };

  let outcome: { reproduced: boolean; summary: string };
  let state: any;
  try {
    outcome = await run(ev);
  } finally {
    await page.waitForTimeout(1200); // let the last frame of the overlay land in the video
    if (!fs.existsSync(path.join(dir, `screenshot${sfx}.png`))) await page.screenshot({ path: path.join(dir, `screenshot${sfx}.png`), fullPage: false });
    await Promise.all(pending);
    state = await context.storageState();
    const video = page.video();
    await context.close();
    if (video) fs.renameSync(await video.path(), path.join(dir, `recording${sfx}.webm`));
    redactHar(path.join(dir, `network${sfx}.har`));
  }
  fs.writeFileSync(
    path.join(dir, `log${sfx}.json`),
    JSON.stringify({ bug: bugId, runId, part: opts.part ?? 'single', recordedAt: new Date().toISOString(), baseUrl: BASE_URL, viewport, steps, reproduced: outcome!.reproduced, summary: outcome!.summary, exchanges: log.sort((a, b) => a.at.localeCompare(b.at)) }, null, 2),
  );
  if (opts.part !== 'start') fs.renameSync(dir, finalDir); // complete: only now does the run become visible
  return { ...outcome!, state };
}
