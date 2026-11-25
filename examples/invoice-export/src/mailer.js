// Email delivery of exports.
//
// AC-3: Exported file is emailed to the account owner
// AC-4: Export fails loudly when the storage backend is unavailable

export async function emailExport(account, csv) {
  const backend = await loadStorageBackend();
  if (!backend) {
    // Deliberately loud: a silent failure here ships empty invoices to
    // customers, which is worse than a broken page.
    throw new Error('storage backend unavailable: cannot deliver export');
  }
  return backend.deliver(account.email, 'invoice-export.csv', csv);
}

async function loadStorageBackend() {
  return globalThis.__storageBackend ?? null;
}
