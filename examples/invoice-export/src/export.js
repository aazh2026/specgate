// Invoice CSV export.
//
// AC-1: User can export invoices as CSV
// AC-2: Export respects the date range filter

export function exportInvoicesCsv(invoices, { from, to } = {}) {
  const rows = invoices.filter((inv) => inRange(inv, from, to));
  const header = 'id,amount,currency,issued_at';
  const body = rows
    .map((inv) => `${inv.id},${inv.amount},${inv.currency},${inv.issuedAt}`)
    .join('\n');
  return `${header}\n${body}\n`;
}

function inRange(invoice, from, to) {
  const at = new Date(invoice.issuedAt).getTime();
  if (from && at < new Date(from).getTime()) return false;
  if (to && at > new Date(to).getTime()) return false;
  return true;
}
