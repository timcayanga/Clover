import assert from 'node:assert/strict';
import { buildGrabReceiptNativePages, hasVerifiedGrabReceiptRows, parseGrabEmailReceipt } from '../lib/grab-email-receipt';

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

const legacyPages = [
  'Your Grab E-Receipt\n2 messages\nHope you had an enjoyable ride!\nTOTAL DATE | TIME\nPick-up time: 14 Aug 26 09:47 +0800\nP 120.00\nBooking Details Receipt Summary\nPayment Method:\nGrabCar\nCash\nBooking code\nIOS-1234567-8-901\nBase Fare P 40.00\nDistance P 30.00\nTime P 20.00\nSurge Charges P 30.00\nPick up location:\nCebu City\nTOTAL P 120.00',
  'Your Grab E-Receipt\nHope you enjoyed your food!\nTOTAL DATE | TIME\nPick-up time: 14 Aug 26 21:03 +0800\nP 99.00\nBooking Details Receipt Summary\nPayment Method:\nGrabFood\nCash\nBooking code\nIOS-1234567-8-902\n1x Sample Meal\nRide Fare P 49.00\nBooking Fee P 50.00\nPick up location:\nCebu City\nTOTAL P 99.00',
];
const legacy = parseGrabEmailReceipt(buildGrabReceiptNativePages(legacyPages)!);
assert.deepEqual(legacy?.rows.map(row => [row.amount, row.currency, row.merchantRaw, row.accountName, row.rawPayload?.referenceNumber]), [
  ['120.00', 'PHP', 'Grab', 'Cash', 'IOS-1234567-8-901'],
  ['99.00', 'PHP', 'GrabFood', 'Cash', 'IOS-1234567-8-902'],
]);
assert.deepEqual(legacy.rows[1].rawPayload?.components, [{ label: 'Ride Fare', amount: 49 }, { label: 'Booking Fee', amount: 50 }]);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages(legacyPages.slice(0, 1))!), /declared receipts are missing/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([legacyPages[0], legacyPages[1].replace('TOTAL P 99.00', 'TOTAL P 98.00')])!), /headline and summary totals must agree/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([legacyPages[0], legacyPages[1].replace('Cebu City', 'Singapore')])!), /supported currency evidence is missing/);

const malaysia = 'Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 19 January 2024\nBooking ID: A-INVENTEDMYR001\nTotal Paid RM 69.51\nBreakdown\nFare 65.00\nToll 4.51\nTotal Paid 69.51\nPaid by\nCash 69.51\nGot an issue?\nYour Trip\nKLIA Terminal 1\nGrab HQ Singapore';
const myr = parseGrabEmailReceipt(buildGrabReceiptNativePages([malaysia])!);
assert.equal(myr?.metadata.currency, 'MYR');
assert.deepEqual(myr.rows.map(row => [row.amount, row.currency, row.accountName, row.rawPayload?.parserEvidence?.currency]), [['69.51', 'MYR', 'Cash', 'MYR']]);
assert(hasVerifiedGrabReceiptRows(buildGrabReceiptNativePages([malaysia])!, myr.rows));
assert.equal(hasVerifiedGrabReceiptRows(buildGrabReceiptNativePages([malaysia])!, myr.rows.map(row => ({ ...row, currency: 'PHP' }))), false);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([malaysia.replace('KLIA Terminal 1', 'Singapore')])!), /supported currency evidence is missing/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([malaysia.replace('Toll 4.51', 'Toll 4.52')])!), /components do not reconcile/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([malaysia + '\nPHP 1.00'])!), /mixed source currency/);

console.log('Held Grab layouts: local peso proof, merged heading, split wallet payer, two-message legacy food/ride, Malaysian cash currency, and unsafe negatives passed.');
