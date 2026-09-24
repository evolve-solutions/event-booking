import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// OI-6: the quiet event is reserved for stock-delta measurements. In a file whose tests run in parallel, only
// the one test that measures a stock delta may touch it; any other mention (including an alias such as
// `const e = EVENTS.quiet`) could blur that delta.
const RESERVED: Record<string, string[]> = {
  'tests/evidence/bugs.evidence.spec.ts': ['[BUG-11]'],
};

function testBlocks(source: string): { title: string; body: string }[] {
  const starts = [...source.matchAll(/^test\('([^']+)'/gm)].map((m) => ({ title: m[1], at: m.index! }));
  return starts.map((s, i) => ({ title: s.title, body: source.slice(s.at, starts[i + 1]?.at ?? source.length) }));
}

describe('quiet-event isolation', () => {
  for (const [file, allowed] of Object.entries(RESERVED)) {
    it(`${file}: only ${allowed.join(', ')} touch the quiet event`, () => {
      const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(source).toMatch(/mode: 'parallel'/); // the rule matters because this file runs in parallel
      const blocks = testBlocks(source);
      expect(blocks.length).toBeGreaterThan(30); // an empty parse cannot pass
      const offenders = blocks.filter((b) => /\bquiet\b/.test(b.body) && !allowed.some((a) => b.title.startsWith(a))).map((b) => b.title);
      expect(offenders).toEqual([]);
      expect(blocks.filter((b) => allowed.some((a) => b.title.startsWith(a))).every((b) => /\bquiet\b/.test(b.body))).toBe(true);
    });
  }

  it('no other parallel-mode test file mentions the quiet event', () => {
    const dir = path.resolve(__dirname, '..');
    const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.spec.ts')).map((f) => path.join('tests', f));
    const parallel = files.filter((f) => /mode: 'parallel'/.test(fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8')));
    expect(parallel.length).toBeGreaterThan(0);
    const bad = parallel.filter((f) => !(f in RESERVED) && /\bquiet\b/.test(fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8')));
    expect(bad).toEqual([]);
  });
});
