import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractTags, keyTerms, matchCriterion, indexFiles } from '../src/matcher.js';
import { computeScore, renderSarif } from '../src/report.js';

test('extractTags finds explicit criterion markers', () => {
  const tags = extractTags('it("resets the password", async () => { /* # AC-1 */ })');
  assert.ok(tags.has('ac-1'));
  assert.equal(extractTags('nothing here').size, 0);
});

test('keyTerms prefers distinctive words', () => {
  const terms = keyTerms('The user should be able to reset their password from the settings page');
  assert.ok(terms.includes('password'));
  assert.ok(!terms.includes('user'));
  assert.ok(!terms.includes('settings'));
});

test('a tagged test file yields covered', () => {
  const files = indexFiles([
    { path: 'test/password.test.js', isTest: true, content: 'test("reset", () => {}) // AC-1' },
  ]);
  const criterion = {
    id: 'AC-1',
    normalisedId: 'ac-1',
    text: 'User can reset their password',
    slug: 'reset-password',
  };
  const m = matchCriterion(criterion, files);
  assert.equal(m.status, 'covered');
  assert.equal(m.tier, 'tagged');
  assert.equal(m.evidence.file, 'test/password.test.js');
});

test('a name-matching test yields inferred, not covered', () => {
  const files = indexFiles([
    { path: 'test/password.test.js', isTest: true, content: 'test("user can reset their password", () => {})' },
  ]);
  const criterion = {
    id: 'AC-1',
    normalisedId: 'ac-1',
    text: 'User can reset their password',
    slug: 'reset-password',
  };
  const m = matchCriterion(criterion, files);
  assert.equal(m.status, 'inferred');
  assert.equal(m.tier, 'named');
});

test('implementation-only evidence yields untested', () => {
  const files = indexFiles([
    { path: 'src/password.js', isTest: false, content: 'export function resetPassword() {}' },
  ]);
  const criterion = {
    id: 'AC-1',
    normalisedId: 'ac-1',
    text: 'reset password',
    slug: 'reset-password',
  };
  const m = matchCriterion(criterion, files);
  assert.equal(m.status, 'untested');
});

test('no evidence yields uncovered', () => {
  const files = indexFiles([{ path: 'src/other.js', isTest: false, content: 'export const x = 1' }]);
  const criterion = {
    id: 'AC-1',
    normalisedId: 'ac-1',
    text: 'User can export invoices as PDF',
    slug: 'export-invoices-pdf',
  };
  const m = matchCriterion(criterion, files);
  assert.equal(m.status, 'uncovered');
  assert.equal(m.evidence, null);
});

test('computeScore weights evidence tiers', () => {
  const s = computeScore([
    { status: 'covered' },
    { status: 'inferred' },
    { status: 'untested' },
    { status: 'uncovered' },
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.covered, 1);
  assert.equal(s.score, Math.round(((1 + 0.75 + 0.4 + 0) / 4) * 100));
});

test('computeScore handles an empty spec', () => {
  const s = computeScore([]);
  assert.equal(s.total, 0);
  assert.equal(s.score, 0);
});

test('sarif output is valid JSON with results for gaps', () => {
  const sarif = JSON.parse(
    renderSarif({
      version: '0.1.0',
      criteria: [
        { id: 'AC-1', status: 'uncovered', file: 'SPEC.md', line: 4, text: 'x' },
        { id: 'AC-2', status: 'covered', file: 'SPEC.md', line: 5, text: 'y' },
      ],
      summary: computeScore([]),
    })
  );
  assert.equal(sarif.version, '2.1.0');
  assert.equal(sarif.runs[0].results.length, 1);
  assert.equal(sarif.runs[0].results[0].ruleId, 'spec-uncovered');
});
