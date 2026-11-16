import assert from 'node:assert/strict';
import { heldSourceReviewReason } from '../lib/held-source-review';
import { parseImportTextGenericOnly } from '../lib/import-parser';
import { SourceReviewRequiredError, sourceReviewUserMessage } from '../lib/import-source-review';
import { pdfTextLayerLooksSufficientForParsing } from '../lib/import-file-text.server';
import { reviewCases } from './fixtures/held-source-review-cases';

for (const item of reviewCases) {
  const reason = heldSourceReviewReason(item.text);
  assert(reason); assert.match(reason, item.reason);
  assert.equal(pdfTextLayerLooksSufficientForParsing(item.text), true, 'OCR must retain decisive native review evidence');
  assert.equal(sourceReviewUserMessage(reason), reason, 'The actual actionable reason reaches the user');
  for (const parse of [parseImportTextGenericOnly]) {
    for (const name of ['unknown.pdf', item.id + '.pdf']) {
      assert.throws(() => parse(item.text, name, 'application/pdf'), error => error instanceof SourceReviewRequiredError && item.reason.test(error.message));
    }
  }
}
assert.equal(heldSourceReviewReason('Driver Statement\nWeekly Total PHP10'), null, 'A title alone cannot establish an earnings/settlement report');
assert.equal(heldSourceReviewReason('SEABANK ACCOUNT: 901000000001'), null);
assert.equal(heldSourceReviewReason('GCash Transaction History\nSTARTING BALANCE 10.00\nENDING BALANCE 10.00'), null);
const cimb = reviewCases.find(item => item.id === 'cimb-summary-conflict')!.text;
assert.equal(heldSourceReviewReason(cimb.replace('PHP 26.00', 'PHP 25.00')), null, 'A valid summary retains its existing parser');
const gcash = reviewCases.find(item => item.id === 'gcash-totals-conflict')!.text;
for (const text of [gcash.replace('Total Debit 31.00', 'Total Debit 30.00'), gcash.replace('Total Debit 31.00', 'Total Debit 30.00').replaceAll('03:0', '15:0')]) {
  assert.equal(heldSourceReviewReason(text), null, '24-hour source clocks and valid arithmetic do not become a refusal');
}
assert.equal(heldSourceReviewReason(reviewCases[1].text + '\nBANK STATEMENT\n'), null, 'A tax annex must not reject a complete underlying statement');
console.log('Held source review: independent negative examples, generic fallback refusal, native OCR retention and valid-layout counterexamples passed.');
