import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { init, renderInitResult } from '../src/scaffold/init.js';
import { detectStack } from '../src/scaffold/stack.js';
import { runSpecgate } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'bin', 'specgate.js');

function tmpRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-init-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

test('init creates a SPEC.md and a CI workflow', () => {
  const dir = tmpRepo({ 'package.json': JSON.stringify({ name: 'demo' }) });
  const result = init(dir, { name: 'demo' });

  assert.deepEqual(result.created.sort(), ['.github/workflows/requirements.yml', 'SPEC.md']);
  assert.ok(fs.existsSync(path.join(dir, 'SPEC.md')));
  assert.ok(fs.existsSync(path.join(dir, '.github/workflows/requirements.yml')));

  const spec = fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8');
  assert.match(spec, /## Acceptance Criteria/);
  assert.match(spec, /- \[ \] AC-1:/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the scaffolded spec is immediately scannable', () => {
  const dir = tmpRepo({ 'package.json': JSON.stringify({ name: 'demo' }) });
  init(dir, { name: 'demo' });

  const report = runSpecgate({ root: dir });
  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.uncovered, 4);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('init does not overwrite existing files unless forced', () => {
  const dir = tmpRepo({
    'package.json': JSON.stringify({ name: 'demo' }),
    'SPEC.md': '# mine\n\n## Acceptance Criteria\n\n- [ ] AC-1: keep me\n',
  });
  const result = init(dir);

  assert.ok(result.skipped.some((s) => s.file === 'SPEC.md'));
  assert.ok(fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8').includes('keep me'));

  // Forced init overwrites.
  init(dir, { force: true });
  assert.ok(!fs.readFileSync(path.join(dir, 'SPEC.md'), 'utf8').includes('keep me'));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('detectStack reads the project setup', () => {
  const dir = tmpRepo({
    'package.json': JSON.stringify({ devDependencies: { vitest: '^1.0.0' } }),
    'pnpm-lock.yaml': '',
  });
  const stack = detectStack(dir);
  assert.equal(stack.language, 'javascript');
  assert.equal(stack.testRunner, 'vitest run');
  assert.equal(stack.packageManager, 'pnpm');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('detectStack falls back to python for a python-only project', () => {
  const dir = tmpRepo({ 'pyproject.toml': '[project]\nname="x"\n' });
  const stack = detectStack(dir);
  assert.equal(stack.language, 'python');
  assert.equal(stack.testRunner, 'pytest');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderInitResult lists created files and next steps', () => {
  const out = renderInitResult({ created: ['SPEC.md'], skipped: [] });
  assert.match(out, /created\s+SPEC\.md/);
  assert.match(out, /Next:/);
});

test('cli init works end to end', () => {
  const dir = tmpRepo({ 'package.json': JSON.stringify({ name: 'demo' }) });
  const out = execFileSync(process.execPath, [cli, 'init', dir], { encoding: 'utf8' });
  assert.match(out, /created/);
  assert.ok(fs.existsSync(path.join(dir, 'SPEC.md')));
  fs.rmSync(dir, { recursive: true, force: true });
});
