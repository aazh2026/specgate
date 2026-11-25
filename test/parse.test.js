import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseSpec, normaliseId, tokenize } from '../src/spec/parse.js';

test('normaliseId folds case and separators', () => {
  assert.equal(normaliseId('AC-1'), 'ac-1');
  assert.equal(normaliseId('ac 1'), 'ac-1');
  assert.equal(normaliseId('AC_1'), 'ac-1');
});

test('tokenize drops stopwords and short tokens', () => {
  const t = tokenize('The user can reset their password');
  assert.ok(!t.includes('the'));
  assert.ok(!t.includes('user'));
  assert.ok(t.includes('reset'));
  assert.ok(t.includes('password'));
});

test('parses explicit ids from a checkbox list', () => {
  const spec = [
    '## Acceptance Criteria',
    '- [ ] AC-1: User can reset their password',
    '- [ ] [AC-2] Export runs as CSV',
    '- [ ] AC3 S3. Writes an audit log entry',
  ].join('\n');

  const { criteria } = parseSpec(spec, { file: 'SPEC.md' });
  assert.equal(criteria.length, 3);
  assert.equal(criteria[0].id, 'AC-1');
  assert.equal(criteria[0].text, 'User can reset their password');
  assert.equal(criteria[1].id, 'AC-2');
  assert.equal(criteria[2].id, 'AC3');
  assert.ok(criteria[2].text.startsWith('S3.'));
});

test('mints ids when the spec has no explicit ids', () => {
  const spec = [
    '## Acceptance Criteria',
    '- User can reset their password',
    '- Export runs as CSV',
  ].join('\n');

  const { criteria } = parseSpec(spec);
  assert.deepEqual(criteria.map((c) => c.id), ['AC-1', 'AC-2']);
  assert.ok(criteria.every((c) => c.source === 'inferred'));
});

test('ignores bullets outside an acceptance-criteria section', () => {
  const spec = ['## Overview', '- Some random bullet', '- Another bullet'].join('\n');
  assert.equal(parseSpec(spec).criteria.length, 0);
});

test('ignores bullets in fenced code blocks', () => {
  const spec = [
    '## Acceptance Criteria',
    '- [ ] AC-1: Real criterion',
    '```',
    '- [ ] AC-99: Not a criterion',
    '```',
  ].join('\n');
  const { criteria } = parseSpec(spec);
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0].id, 'AC-1');
});

test('records section and line numbers', () => {
  const spec = ['## Acceptance Criteria', '', '- [ ] AC-1: Reset password'].join('\n');
  const { criteria } = parseSpec(spec, { file: 'SPEC.md' });
  assert.equal(criteria[0].section, 'Acceptance Criteria');
  assert.equal(criteria[0].line, 3);
  assert.equal(criteria[0].file, 'SPEC.md');
});

test('supports Chinese acceptance-criteria headings', () => {
  const spec = ['## 验收标准', '- [ ] AC-1: 用户可以重置密码'].join('\n');
  const { criteria } = parseSpec(spec);
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0].id, 'AC-1');
});
