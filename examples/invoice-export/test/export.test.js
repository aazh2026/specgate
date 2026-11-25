import { test } from 'node:test';
import assert from 'node:assert/strict';

import { exportInvoicesCsv } from '../src/export.js';

const invoices = [
  { id: 'i1', amount: 100, currency: 'USD', issuedAt: '2026-01-15' },
  { id: 'i2', amount: 250, currency: 'USD', issuedAt: '2026-02-20' },
  { id: 'i3', amount: 75, currency: 'EUR', issuedAt: '2026-03-05' },
];

// AC-1: User can export invoices as CSV
test('exports invoices as CSV with a header row', () => {
  const csv = exportInvoicesCsv(invoices);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'id,amount,currency,issued_at');
  assert.equal(lines.length, 4);
  assert.ok(lines[1].startsWith('i1,100,USD'));
});

// AC-2: Export respects the date range filter
test('respects the date range filter', () => {
  const csv = exportInvoicesCsv(invoices, { from: '2026-02-01', to: '2026-02-28' });
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('i2,'));
});
