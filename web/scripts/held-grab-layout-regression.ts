import assert from 'node:assert/strict';
import { buildGrabReceiptNativePages, parseGrabEmailReceipt } from '../lib/grab-email-receipt';

// Invented amounts and references; layouts are reviewed against private originals.
const ride = (opts: { headline: string; place: string; paid: string; merged?: boolean; extra?: string; amount?: number }) => {
  const amount = opts.amount ?? 120;
  const page = `Your Grab E-Receipt\n1 message\n${opts.merged ? 'Hopeyouenjoyed' : 'Hope you enjoyed'} your ride!\nPicked up on 14 August 2026\nBooking ID: A-INVENTEDRIDE001\nTotal Paid ${opts.headline} ${amount}.00\nBreakdown\nBase fare 45.00\nDistance 25.00\nTime 20.00\nSurge charges 30.00\n${opts.extra ?? ''}\nTotal Paid ${amount}.00\nPassenger Paid by\nExample Person\n${opts.paid} ${amount}.00\nYour Trip\n${opts.place}`;
  const marker = buildGrabReceiptNativePages([page]);
  assert(marker, 'Complete native receipt must retain its page proof');
  return marker;
};

const cash = parseGrabEmailReceipt(ride({ headline: 'P', place: 'NAIA Terminal 3', paid: 'Cash' }));
assert.equal(cash?.rows.length, 1);
assert.equal(cash.rows[0].currency, 'PHP');
assert.equal(cash.rows[0].accountName, 'Cash');
assert.equal(cash.rows[0].rawPayload?.payerAccountNumber, null);
const cashWithoutRepeatedPaymentAmount = ride({ headline: 'P', place: 'NAIA Terminal 3', paid: 'Cash' }).replace('Cash 120.00', 'Cash');
assert.equal(parseGrabEmailReceipt(cashWithoutRepeatedPaymentAmount)?.rows.length, 1, 'Previously supported explicit Cash remains valid');
assert.equal(parseGrabEmailReceipt(ride({ headline: 'P', place: 'Manila Doctors Hospital', paid: 'Cash', merged: true }))?.rows.length, 1);
assert.equal(parseGrabEmailReceipt(ride({ headline: 'P', place: 'Pasay Terminal', paid: 'Cash' }))?.rows.length, 1);

const split = (paid: string) => {
  const pages = [
    'Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 14 August 2026\nBooking ID: A-INVENTEDSPLIT001\nTotal Paid P 120.00\nBreakdown\nFare 100.00\nToll 20.00\nTotal Paid 120.00\nPassenger Paid by',
    `Example Person\n${paid} 120.00\nGot an issue?\nYour Trip\nNAIA Terminal 3\nGrab Philippines`,
  ];
  return buildGrabReceiptNativePages(pages)!;
};
for (const [method, account] of [['GCash', 'GCash'], ['GrabPay Wallet', 'GrabPay Wallet']] as const) {
  const parsed = parseGrabEmailReceipt(split(method));
  assert.equal(parsed?.rows.length, 1);
  assert.equal(parsed.rows[0].accountName, account);
  assert.equal(parsed.metadata.accountName, account);
  assert.equal(parsed.metadata.accountType, 'wallet');
  assert.equal(parsed.rows[0].rawPayload?.payerAccountNumber, null);
}

for (const bad of [
  ride({ headline: 'P', place: 'Singapore', paid: 'Cash' }),
  ride({ headline: 'P', place: 'NAIA Terminal 3 RM 20.00', paid: 'Cash' }),
  ride({ headline: 'P', place: 'NAIA Terminal 3', paid: 'Cash', amount: 121 }),
  split('Visa 1234'),
  split('GCash 119.00'),
]) assert.throws(() => parseGrabEmailReceipt(bad), /source review/);

console.log('Held Grab layouts: local peso proof, merged heading, split wallet payer, and unsafe negatives passed.');
