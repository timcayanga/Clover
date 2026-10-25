import assert from 'node:assert/strict';
import { parseEastwestTransferProof, hasVerifiedEastwestTransferRows } from '../lib/eastwest-transfer-proof';
import { parseImportText, detectStatementMetadata } from '../lib/import-parser';
export const eastwestProof = `Transfer successful!
PHP 1,250.00
eastwest
From
REGULAR SAVINGS
********1234
To
SAMPLE CONDOMINIUM BILL
Union Bank of the Philippines
123456789012
Transfer Fee
PHP 10.00
Transfer Mode
InstaPay
Transfer Purpose
Bills Payment
Remarks
Electricity and water
Date and Time
Oct 23 2026, 03:36 AM
Reference Number
FT12345TNXAB
Invoice Number
123456`;
const parsed = parseEastwestTransferProof(eastwestProof)!;
assert.equal(parsed.metadata.institution, 'EastWest');
assert.equal(parsed.metadata.accountNumber, '********1234');
assert.equal(detectStatementMetadata(eastwestProof)?.institution, 'EastWest', 'Recipient bank must not replace the sender');
assert.deepEqual(parsed.rows.map(row => [row.amount, row.type, row.categoryName]), [['1250.00','expense','Transfers'], ['10.00','expense','Financial']]);
assert(parsed.rows.every(row => row.date === '2026-10-22T19:36:00.000Z' && row.accountNumber === '********1234' && row.confidence! < 70));
assert.deepEqual(parseImportText(eastwestProof, 'camera.jpg', 'image/jpeg'), parsed.rows);
assert(hasVerifiedEastwestTransferRows(eastwestProof, parsed.rows));
assert(!hasVerifiedEastwestTransferRows(eastwestProof, parsed.rows.map((r,i)=>i?r:{...r,amount:'1260.00'})));
assert.equal(parseEastwestTransferProof(eastwestProof.replace('PHP 10.00','PHP 0.00'))?.rows.length,1);
for (const bad of [eastwestProof.replace('Oct 23 2026','Feb 30 2026'),eastwestProof.replace('********1234','123456789012'),eastwestProof.replace('PHP 1,250.00','USD 1,250.00'),eastwestProof.replace('Reference Number','Missing Reference')]) {
  assert.throws(()=>parseEastwestTransferProof(bad), /needs a readable/);
}
assert.equal(parseEastwestTransferProof(eastwestProof.replace('Transfer successful!','Transfer pending')),null);
console.log('EastWest proof: sender/recipient separation, exact principal/fee, source clocks, masks, zero fee and unsafe negatives passed.');
