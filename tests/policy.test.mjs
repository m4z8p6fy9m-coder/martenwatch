import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateInvoice} from '../api/policy.mjs';
test('approval threshold is strictly greater than 500 EUR', () => {
  assert.equal(evaluateInvoice(49999), 'processed');
  assert.equal(evaluateInvoice(50000), 'processed');
  assert.equal(evaluateInvoice(50001), 'pending_approval');
});
test('reject invalid monetary values', () => {
  for (const amount of [-1, 0.1, NaN, Infinity, '50000']) assert.throws(() => evaluateInvoice(amount));
});
