import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseJsonc, readPathAliases, resolveAlias, extractImportSpecifiers } from '../src/aliases.js';
import { runSpecgate } from '../src/index.js';

function tmpRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-alias-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    baseUrl: '.',
    paths: { '@/*': ['src/*'], '#shared/*': ['packages/shared/src/*'] },
  },
});

test('parseJsonc tolerates comments and trailing commas', () => {
  const parsed = parseJsonc(`{
    // a line comment
    "compilerOptions": {
      "baseUrl": ".", /* a block comment */
    },
  }`);
  assert.equal(parsed.compilerOptions.baseUrl, '.');
});

test('readPathAliases reads baseUrl and paths', () => {
  const dir = tmpRepo({ 'tsconfig.json': TSCONFIG });
  const aliases = readPathAliases(dir);
  assert.ok(aliases);
  assert.deepEqual(aliases.paths['@/*'], ['src/*']);
  assert.equal(aliases.baseUrl, dir);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readPathAliases returns null without a tsconfig', () => {
  const dir = tmpRepo({ 'package.json': '{}' });
  assert.equal(readPathAliases(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('readPathAliases returns null for a tsconfig without paths', () => {
  const dir = tmpRepo({ 'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }) });
  assert.equal(readPathAliases(dir), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resolveAlias maps an alias to the real file', () => {
  const dir = tmpRepo({
    'tsconfig.json': TSCONFIG,
    'src/lib/audit-writer.ts': 'export const writeAuditLog = () => {};\n',
  });
  const aliases = readPathAliases(dir);
  const resolved = resolveAlias('@/lib/audit-writer', aliases);
  assert.equal(resolved, path.join(dir, 'src', 'lib', 'audit-writer.ts'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resolveAlias resolves a directory index', () => {
  const dir = tmpRepo({
    'tsconfig.json': TSCONFIG,
    'src/lib/index.ts': 'export const x = 1;\n',
  });
  const aliases = readPathAliases(dir);
  assert.equal(resolveAlias('@/lib', aliases), path.join(dir, 'src', 'lib', 'index.ts'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('resolveAlias ignores relative imports', () => {
  const dir = tmpRepo({ 'tsconfig.json': TSCONFIG, 'src/a.ts': '' });
  const aliases = readPathAliases(dir);
  assert.equal(resolveAlias('./a', aliases), null);
  assert.equal(resolveAlias('../a', aliases), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('extractImportSpecifiers finds static and dynamic imports', () => {
  const specs = extractImportSpecifiers(
    [
      "import { a } from '@/lib/a';",
      "import type { B } from '@/lib/b';",
      "export { c } from '@/lib/c';",
      "const d = require('@/lib/d');",
      "const e = await import('@/lib/e');",
      "import './side-effect';",
    ].join('\n')
  );
  assert.ok(specs.includes('@/lib/a'));
  assert.ok(specs.includes('@/lib/b'));
  assert.ok(specs.includes('@/lib/c'));
  assert.ok(specs.includes('@/lib/d'));
  assert.ok(specs.includes('@/lib/e'));
  assert.ok(specs.includes('./side-effect'));
});

test('AC-1: a criterion matching an aliased file reports covered', () => {
  const dir = tmpRepo({
    'tsconfig.json': TSCONFIG,
    'SPEC.md': [
      '## Acceptance Criteria',
      '',
      '- [ ] AC-1: The invoice exporter writes an audit log entry',
      '',
    ].join('\n'),
    // The implementation file is named after the criterion, and the test
    // imports it through the alias.
    'src/lib/audit-writer.ts': 'export const writeAuditLog = () => {}; // AC-1\n',
    'test/export.test.ts': "import { writeAuditLog } from '@/lib/audit-writer';\n",
  });

  const report = runSpecgate({ root: dir });
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.covered, 1);

  const ac1 = report.criteria.find((c) => c.id === 'AC-1');
  assert.equal(ac1.status, 'covered');
  assert.equal(ac1.evidence.file, 'src/lib/audit-writer.ts');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('AC-2: a project without a tsconfig produces the same score as before', () => {
  const dir = tmpRepo({
    'SPEC.md': [
      '## Acceptance Criteria',
      '',
      '- [ ] AC-1: The invoice exporter writes an audit log entry',
      '',
    ].join('\n'),
    'src/lib/audit-writer.ts': 'export const writeAuditLog = () => {}; // AC-1\n',
  });

  const report = runSpecgate({ root: dir });
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.covered, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('the alias target name is searchable even when the file body is silent', () => {
  const dir = tmpRepo({
    'tsconfig.json': TSCONFIG,
    'SPEC.md': [
      '## Acceptance Criteria',
      '',
      '- [ ] AC-1: The audit writer appends to the ledger',
      '',
    ].join('\n'),
    // The file body says nothing about auditing; only its name does.
    'src/lib/audit-writer.ts': 'export const f = () => 1;\n',
  });

  const report = runSpecgate({ root: dir });
  const ac1 = report.criteria.find((c) => c.id === 'AC-1');
  assert.notEqual(ac1.status, 'uncovered');

  fs.rmSync(dir, { recursive: true, force: true });
});
