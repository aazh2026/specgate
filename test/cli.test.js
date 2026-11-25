import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { runSpecgate } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'specgate.js');
const example = path.join(here, '..', 'examples', 'invoice-export');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-test-'));
  fs.writeFileSync(
    path.join(dir, 'SPEC.md'),
    [
      '# Demo',
      '',
      '## Acceptance Criteria',
      '',
      '- [ ] AC-1: User can export invoices as CSV',
      '- [ ] AC-2: User can schedule a recurring monthly export',
      '',
    ].join('\n')
  );
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'src', 'export.js'),
    'export function exportInvoicesCsv() { /* AC-1 */ }\n'
  );
  return dir;
}

test('runSpecgate reports a spec with one covered and one uncovered criterion', () => {
  const dir = makeRepo();
  const report = runSpecgate({ root: dir });

  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.covered, 1);
  assert.equal(report.summary.uncovered, 1);

  const ac1 = report.criteria.find((c) => c.id === 'AC-1');
  assert.equal(ac1.status, 'covered');
  assert.equal(ac1.evidence.file, 'src/export.js');

  const ac2 = report.criteria.find((c) => c.id === 'AC-2');
  assert.equal(ac2.status, 'uncovered');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the same spec file is not counted twice on a case-insensitive filesystem', () => {
  const dir = makeRepo();
  const report = runSpecgate({ root: dir });
  assert.equal(report.specs.length, 1);
  assert.equal(report.summary.total, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cli exits non-zero when coverage is below --min', () => {
  const dir = makeRepo();
  let code = 0;
  try {
    execFileSync(process.execPath, [cli, dir, '--min', '100', '--quiet'], { stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cli exits non-zero when --fail-uncovered and a criterion is uncovered', () => {
  const dir = makeRepo();
  let code = 0;
  try {
    execFileSync(process.execPath, [cli, dir, '--fail-uncovered', '--quiet'], { stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cli exits zero when the gate passes', () => {
  let code = 0;
  try {
    execFileSync(process.execPath, [cli, example, '--min', '50', '--quiet'], { stdio: 'pipe' });
  } catch (err) {
    code = err.status;
  }
  assert.equal(code, 0);
});

test('cli emits valid JSON', () => {
  const out = execFileSync(process.execPath, [cli, example, '--format', 'json'], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.score, 80);
  assert.equal(parsed.summary.total, 5);
  assert.ok(Array.isArray(parsed.criteria));
});
