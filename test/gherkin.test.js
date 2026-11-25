import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseFeature } from '../src/spec/gherkin.js';
import { runSpecgate } from '../src/index.js';

function tmpRepo(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specgate-gherkin-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const FEATURE = [
  '# language: en',
  'Feature: Invoice export',
  '',
  '  Background:',
  '    Given an account exists',
  '',
  '  @AC-1',
  '  Scenario: Export invoices as CSV',
  '    Given an invoice exists',
  '    When the user requests an export',
  '    Then a CSV file is produced',
  '',
  '  Scenario: Export respects the date range filter',
  '    Given invoices exist',
  '    When the user filters by date range',
  '    Then only invoices in range are exported',
].join('\n');

test('parses one criterion per scenario', () => {
  const { criteria } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.equal(criteria.length, 2);
  assert.equal(criteria[0].text, 'Export invoices as CSV');
  assert.equal(criteria[1].text, 'Export respects the date range filter');
});

test('an explicit tag becomes the criterion id', () => {
  const { criteria } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.equal(criteria[0].id, 'AC-1');
  assert.equal(criteria[0].normalisedId, 'ac-1');
  assert.equal(criteria[0].source, 'explicit');
});

test('scenarios without a tag get a minted id', () => {
  const { criteria } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.equal(criteria[1].id, 'SC-2');
  assert.equal(criteria[1].source, 'inferred');
});

test('background steps are not treated as a scenario', () => {
  const { criteria } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.ok(criteria.every((c) => c.text !== 'an account exists'));
  assert.ok(criteria.every((c) => !c.steps.includes('an account exists')));
});

test('steps are collected for evidence matching', () => {
  const { criteria } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.deepEqual(criteria[0].steps, [
    'an invoice exists',
    'the user requests an export',
    'a CSV file is produced',
  ]);
});

test('feature, rule and scenario become headings', () => {
  const { headings } = parseFeature(FEATURE, { file: 'export.feature' });
  assert.equal(headings[0].title, 'Invoice export');
  assert.equal(headings[0].level, 1);
  assert.ok(headings.some((h) => h.title === 'Export invoices as CSV' && h.level === 3));
});

test('a rule provides the section for its scenarios', () => {
  const feature = [
    'Feature: Billing',
    '',
    '  Rule: Refunds',
    '',
    '    Scenario: Refund is issued',
    '      Given a charge exists',
    '      Then a refund is issued',
  ].join('\n');
  const { criteria } = parseFeature(feature, { file: 'billing.feature' });
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0].section, 'Refunds');
});

test('a scenario outline keeps its examples table out of the steps', () => {
  const feature = [
    'Feature: Login',
    '',
    '  Scenario Outline: User signs in',
    '    Given a user with role <role>',
    '    Then the dashboard is shown',
    '',
    '    Examples:',
    '      | role  |',
    '      | admin |',
    '      | guest |',
  ].join('\n');
  const { criteria } = parseFeature(feature, { file: 'login.feature' });
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0].steps.length, 2);
  assert.ok(criteria[0].isOutline);
});

test('comments and blank lines are ignored', () => {
  const feature = [
    '# a comment',
    'Feature: X',
    '',
    '  # another comment',
    '  Scenario: Only one',
    '    Given something',
  ].join('\n');
  const { criteria } = parseFeature(feature, { file: 'x.feature' });
  assert.equal(criteria.length, 1);
});

test('a feature file is discovered automatically by the scanner', () => {
  const dir = tmpRepo({
    'features/export.feature': FEATURE,
    'src/export.js': 'export function exportInvoicesCsv() { /* AC-1 */ }\n',
  });
  const report = runSpecgate({ root: dir });

  assert.ok(report.specs.some((s) => s.file === 'features/export.feature'));
  assert.equal(report.summary.total, 2);

  const ac1 = report.criteria.find((c) => c.id === 'AC-1');
  assert.equal(ac1.status, 'covered');
  assert.equal(ac1.evidence.file, 'src/export.js');

  const sc2 = report.criteria.find((c) => c.id === 'SC-2');
  assert.equal(sc2.status, 'uncovered');

  fs.rmSync(dir, { recursive: true, force: true });
});

test('a step definition matching the scenario steps counts as evidence', () => {
  const dir = tmpRepo({
    'features/export.feature': FEATURE,
    'test/steps.js':
      'Given("the user requests an export", () => {});\n' +
      'Then("a CSV file is produced", () => {});\n',
  });
  const report = runSpecgate({ root: dir });

  const ac1 = report.criteria.find((c) => c.id === 'AC-1');
  assert.notEqual(ac1.status, 'uncovered');

  fs.rmSync(dir, { recursive: true, force: true });
});
