import fs from 'node:fs';
import path from 'node:path';

/**
 * Minimal stand-in for the real export service. It only exists so the
 * gherkin example has something to match evidence against.
 */

export function exportInvoicesCsv(invoices) {
  if (!invoices || invoices.length === 0) {
    throw new Error('no invoices to export');
  }
  const header = 'id,amount,date';
  const rows = invoices.map((i) => `${i.id},${i.amount},${i.date}`);
  return [header, ...rows].join('\n');
}

export function filterByDateRange(invoices, from, to) {
  return invoices.filter((i) => i.date >= from && i.date <= to);
}

export function writeExportFile(dir, csv) {
  const target = path.join(dir, 'export.csv');
  fs.writeFileSync(target, csv, 'utf8');
  return target;
}
