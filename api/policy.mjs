export function evaluateInvoice(amountCents) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error('Amount must be a non-negative integer number of cents');
  return amountCents > 50000 ? 'pending_approval' : 'processed';
}
