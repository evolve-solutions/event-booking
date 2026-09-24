// UI check of the generated dashboard, so a bug report never ships with UI bugs of its own.
// Every tab at desktop and phone width, light and dark: no page error, no sideways page scroll, every block as
// wide as the header (never wider), filter controls aligned and equal in height, no table scrolling sideways on
// desktop, no id broken across two lines. Exits non-zero on any problem. Usage: npm run dashboard:check
import path from 'node:path';
import { chromium } from '@playwright/test';

const url = 'file://' + path.resolve('..', 'dashboard', 'index.html');
const views = ['overview', 'project', 'plan', 'cases', 'rtm', 'automation', 'bugs', 'process', 'BUG-01', 'BUG-12'];
const problems = [];
const browser = await chromium.launch();
for (const width of [1280, 390]) for (const colorScheme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
  page.on('pageerror', (e) => problems.push(`${width} ${colorScheme}: page error ${e.message}`));
  for (const v of views) {
    await page.goto(`${url}#${v}`);
    await page.waitForTimeout(250);
    const r = await page.evaluate((desktop) => {
      const out = [];
      const main = document.querySelector('#main');
      if (!main.innerText.trim()) out.push('empty tab');
      if (document.documentElement.scrollWidth > innerWidth) out.push(`page scrolls sideways by ${document.documentElement.scrollWidth - innerWidth}px`);
      const h = document.querySelector('header.stub').getBoundingClientRect();
      for (const b of main.querySelectorAll('section.panel > *')) {
        const r = b.getBoundingClientRect();
        if (r.width && (Math.round(r.left) < Math.round(h.left) || Math.round(r.right) > Math.round(h.right))) out.push(`block ${Math.round(r.left)}-${Math.round(r.right)} outside the header ${Math.round(h.left)}-${Math.round(h.right)}`);
      }
      for (const f of main.querySelectorAll('.filters')) {
        const rows = {};
        for (const c of f.querySelectorAll('input, select')) { const r = c.getBoundingClientRect(); (rows[Math.round(r.bottom)] ??= []).push(Math.round(r.height)); }
        for (const hs of Object.values(rows)) if (new Set(hs).size > 1) out.push(`filter controls of unequal height ${hs}`);
        const tops = [...f.querySelectorAll('input, select')].map((c) => Math.round(c.getBoundingClientRect().bottom));
        if (desktop && new Set(tops).size > 1) out.push(`filter controls not aligned: bottoms ${[...new Set(tops)]}`);
      }
      if (desktop) for (const w of main.querySelectorAll('.table-wrap, .doc-table')) if (w.offsetParent && w.scrollWidth > w.clientWidth + 1) out.push(`table "${w.querySelector('th')?.textContent}" scrolls sideways on desktop`);
      const re = /\b(TC|BUG|REQ|GAP|OBS)-[A-Z0-9-]+\b/g;
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        if (!n.parentElement.offsetParent) continue;
        for (const m of n.textContent.matchAll(re)) { const range = document.createRange(); range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length); if (range.getClientRects().length > 1) out.push(`id ${m[0]} broken across lines`); }
      }
      return out;
    }, width >= 1000);
    for (const p of r) problems.push(`${width} ${colorScheme} #${v}: ${p}`);
  }
  await page.close();
}
await browser.close();
if (problems.length) { console.error(`DASHBOARD CHECK FAILED (${problems.length}):\n- ${[...new Set(problems)].join('\n- ')}`); process.exit(1); }
console.log(`dashboard check passed: ${views.length} views × 2 widths × 2 themes, no UI problem found`);
