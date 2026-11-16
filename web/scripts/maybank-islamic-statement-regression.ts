import assert from 'node:assert/strict';
import { detectStatementMetadata, parseImportText } from '../lib/import-parser';
import { SourceReviewRequiredError } from '../lib/import-source-review';
import { hasVerifiedMaybankIslamicRows, parseMaybankIslamicStatement } from '../lib/maybank-islamic-statement';

const page = (number: number, body: string) => `Maybank Islamic Berhad (787435-M)
00000${number} IBS REVIEWED SAMPLE 頁 ${number}
31/10/23
STATEMENT DATE
ACCOUNT NUMBER
123456-789012
PROTECTED BY PIDM UP TO RM250,000 FOR EACH DEPOSITOR SAVINGS ACCOUNT-I
URUSNIAGA AKAUN/ /ACCOUNT TRANSACTIONS
ENTRY DATE TRANSACTION DESCRIPTION TRANSACTION AMOUNT STATEMENT BALANCE
${body}
Perhation / Note`;

export const completeMaybankStatement = [
  page(1, `BEGINNING BALANCE 100.00
01/10/23 SALE DEBIT 10.00- 90.00
COFFEE SHOP *
02/10/23 SALE DEBIT 10.00- 80.00
COFFEE SHOP *
03/10/23 FUND TRANSFER TO A/ 25.00+ 105.00`),
  page(2, `SAMPLE COUNTERPARTY *
04/10/23 PYMT FROM A/C 5.00- 100.00
PHONE TOP UP
05/10/23 FPX REFUND BUYER 15.00+ 115.00
SAMPLE SHOP
ENDING BALANCE : 115.00
TOTAL CREDIT : 40.00
TOTAL DEBIT : 25.00`),
].join('\n');

const parsed = parseMaybankIslamicStatement(completeMaybankStatement);
assert(parsed);
assert.equal(parsed.rows.length, 5);
assert.deepEqual(parsed.rows.map(row => row.amount), ['10.00', '10.00', '25.00', '5.00', '15.00']);
assert.deepEqual(parsed.rows.map(row => row.type), ['expense', 'expense', 'income', 'expense', 'income']);
assert.equal(parsed.rows[0].date, '2023-10-01');
assert.equal(parsed.rows[2].description, 'FUND TRANSFER TO A/ SAMPLE COUNTERPARTY *');
assert.deepEqual(parsed.rows.map(row => row.rawPayload?.balance), [90, 80, 105, 100, 115]);
assert.deepEqual(parsed.rows.map(row => row.rawPayload?.physicalPage), [1, 1, 1, 2, 2]);
assert.equal(parsed.metadata.accountNumber, '123456-789012');
assert.equal(parsed.metadata.accountType, 'bank');
assert.equal(parsed.metadata.currency, 'MYR');
assert.equal(parsed.metadata.openingBalance, 100);
assert.equal(parsed.metadata.endingBalance, 115);
assert.equal(detectStatementMetadata(completeMaybankStatement)?.currency, 'MYR');
assert.equal(parseImportText(completeMaybankStatement, 'Maybank Islamic.pdf', 'application/pdf').length, 5);
assert(hasVerifiedMaybankIslamicRows(completeMaybankStatement, parsed.rows));
const expectedRefusal = (text: string) => assert.throws(() => parseMaybankIslamicStatement(text), SourceReviewRequiredError);
expectedRefusal(completeMaybankStatement.replace('25.00+ 105.00', '25.00+ 106.00'));
expectedRefusal(completeMaybankStatement.replace('TOTAL CREDIT : 40.00', 'TOTAL CREDIT : 41.00'));
expectedRefusal(completeMaybankStatement.replace('123456-789012\nPROTECTED', '999999-789012\nPROTECTED'));
expectedRefusal(completeMaybankStatement.replace('000002 IBS', '000003 IBS'));
expectedRefusal(completeMaybankStatement.replace('04/10/23 PYMT FROM A/C 5.00- 100.00', '04/10/23 PYMT FROM A/C 5.00-'));
expectedRefusal(completeMaybankStatement.replace('PROTECTED BY PIDM UP TO RM250,000', 'PROTECTED BY PIDM UP TO 250,000'));
console.log('Maybank Islamic native savings: exact page/row/identity/MYR balances, repeated purchases, cross-page descriptions and unsafe negatives passed.');
