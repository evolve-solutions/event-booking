import { defineConfig } from 'vitest/config';
import { currentRunId } from './src/report/runId';

const RUN_ID = currentRunId(); // coverage and the JSON report land under this run's own id

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default', 'json'],
    outputFile: { json: `reports/unit/${RUN_ID}.json` },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: `coverage/${RUN_ID}`,
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
