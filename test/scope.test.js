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

/**
 * A monorepo where the spec lives in packages/billing but the implementation
 * lives in packages/shared.
 */
function monorepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-monorepo-'));
  const write = (rel, content) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };

  write('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
  write(
    'packages/billing/SPEC.md',
    ['# Billing', '', '## Acceptance Criteria', '', '- [ ] AC-1: User can download an invoice', ''].join('\n')
  );
  write('packages/shared/src/invoice.js', 'export function downloadInvoice() { /* AC-1 */ }\n');

  return dir;
}

test('AC-1: a scope restricts which files count as evidence', () => {
  const dir = monorepo();

  // Whole repository: the shared package satisfies the criterion.
  const whole = runSpecgate({ root: dir });
  assert.equal(whole.summary.total, 1);
  assert.equal(whole.summary.covered, 1);

  // Scoped to the billing package: the shared package is out of scope, so the
  // criterion must be reported as uncovered.
  const scoped = runSpecgate({ root: dir, scope: 'packages/billing' });
  assert.equal(scoped.summary.total, 1);
  assert.equal(scoped.summary.uncovered, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('AC-2: a project without a scope produces the same score as before', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-noscope-'));
  fs.writeFileSync(
    path.join(dir, 'SPEC.md'),
    ['## Acceptance Criteria', '', '- [ ] AC-1: User can reset their password', ''].join('\n')
  );
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'password.js'), 'export function resetPassword() { /* AC-1 */ }\n');

  const before = runSpecgate({ root: dir });
  const after = runSpecgate({ root: dir, scope: null });

  assert.equal(before.summary.score, after.summary.score);
  assert.equal(before.summary.total, after.summary.total);
  assert.equal(after.summary.covered, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the scope still finds the spec across the whole repository', () => {
  const dir = monorepo();
  const scoped = runSpecgate({ root: dir, scope: 'packages/shared' });

  // The spec lives in packages/billing, outside the scope, but it is still
  // discovered: only *evidence* is scoped.
  assert.equal(scoped.summary.total, 1);
  assert.equal(scoped.summary.covered, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the --scope flag works from the command line', () => {
  const dir = monorepo();

  const out = execFileSync(process.execPath, [cli, dir, '--scope', 'packages/billing', '--format', 'json'], {
    encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.summary.total, 1);
  assert.equal(parsed.summary.uncovered, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});
