// Writes tests/support/ids.ts from the catalogue. Runs before typecheck (npm run typecheck).
import fs from 'node:fs';
import path from 'node:path';
import { renderIds } from '../src/spec/ids.ts';

const spec = (f) => JSON.parse(fs.readFileSync(path.resolve('..', 'spec', f), 'utf8'));
const out = renderIds(spec('test-cases.json').testCases.map((c) => c.id), spec('bugs.json').bugs.map((b) => b.id));
fs.writeFileSync(path.resolve('tests', 'support', 'ids.ts'), out);
console.log('tests/support/ids.ts written');
