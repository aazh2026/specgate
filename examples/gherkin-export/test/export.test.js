import assert from 'node:assert/strict';
import test from 'node:test';

import { exportInvoicesCsv, filterByDateRange } from '../src/export.js';

const INVOICES = [
  { id: 'i1', amount: 10, date: '2026-01-05' },
  { id: 'i2', amount: 20, date: '2026-02-05' },
];

test('exports invoices as CSV', () => {
  const csv = exportInvoicesCsv(INVOICES);
  assert.match(csv, /id,amount,date/);
  assert.match(csv, /i1,10,2026-01-05/);
});

test('filters invoices by date range', () => {
  const filtered = filterByDateRange(INVOICES, '2026-02-01', '2026-02-28');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'i2');
});
