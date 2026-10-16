import assert from 'node:assert/strict';
import { buildGrabReceiptNativePages, buildGrabTwoMessagePanelBodies, hasVerifiedGrabReceiptRows, parseGrabEmailReceipt } from '../lib/grab-email-receipt';
import { formatUploadAccountDisplayName, getAccountCardName } from '../lib/account-display';
import { resolveImportFileExtractionCacheVersion } from '../lib/data-engine';

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
const centralRide = parseGrabEmailReceipt(ride({ headline: 'P', place: '11-C Marunong St, Central', paid: 'GrabPay Wallet' }));
assert.equal(centralRide?.rows.length, 1);
assert.equal(centralRide.rows[0].currency, 'PHP');
assert.equal(centralRide.rows[0].accountName, 'GrabPay Wallet');
assert.throws(() => parseGrabEmailReceipt(ride({ headline: 'P', place: 'Singapore', paid: 'GrabPay Wallet', extra: '11-C Marunong St, Central' })), /supported currency evidence is missing/);
assert.throws(() => parseGrabEmailReceipt(ride({ headline: 'P', place: 'Marunong St, Central', paid: 'GrabPay Wallet' })), /supported currency evidence is missing/);

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
const visualPage = legacyPages[0].replace('2 messages', '1 message').replace('IOS-1234567-8-901', 'ADR-76543210-8-901').replace('\nP 120.00\nBooking Details', '\nBooking Details').replace('Booking Details Receipt Summary', `Booking Details Receipt Summary\n${'Issued by driver Example. '.repeat(10)}`).replace('Cebu City', 'Metro Manila');
assert.equal(resolveImportFileExtractionCacheVersion('Grab Receipt ADR-76543210.pdf'), 'v52-grab-visual-headline');
const visualEvidence = { reference: 'ADR-76543210-8-901', page: 1, amountText: 'P 120.00', ocrText: 'P 120.00', cropSha256: 'a'.repeat(64) };
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([visualPage])!), /headline total is missing/);
const visualReceipt = buildGrabReceiptNativePages([visualPage], undefined, undefined, [visualEvidence])!;
const visualParsed = parseGrabEmailReceipt(visualReceipt);
assert.equal(visualParsed?.rows[0].amount, '120.00');
assert.deepEqual(visualParsed?.rows[0].rawPayload?.visualHeadlineEvidence, visualEvidence);
assert(hasVerifiedGrabReceiptRows(visualReceipt, visualParsed!.rows));
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([visualPage], undefined, undefined, [{ ...visualEvidence, amountText: 'P 121.00' }])!), /totals must agree/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([visualPage], undefined, undefined, [{ ...visualEvidence, reference: 'ADR-00000000-8-901' }])!), /headline total is missing/);
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

const thai = ['Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 8 September 2025\nBooking ID: A-INVENTEDTHAI001\nTotal Paid THB 240\nBreakdown\nFare 180\nPlatform Fee 10\nToll 50\nTotal Paid 240\nPaid by\nCash 240', 'Got an issue?\nYour Trip\nBangkok\nGrab Thailand\nBangkok'];
const thaiParsed = parseGrabEmailReceipt(buildGrabReceiptNativePages(thai)!);
assert.deepEqual(thaiParsed?.rows.map(row => [row.amount, row.currency, row.accountName]), [['240.00', 'THB', 'Cash']]);
assert(hasVerifiedGrabReceiptRows(buildGrabReceiptNativePages(thai)!, thaiParsed.rows));
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([thai[0].replace('Toll 50', 'Toll 51'), thai[1]])!), /components do not reconcile/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([thai[0], thai[1].replaceAll('Bangkok', 'Singapore').replace('Grab Thailand', 'Grab HQ')])!), /issuer evidence is missing/);

const indoAdjusted = ['Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 17 May 2024\nBooking ID: A-INVENTEDIDR001\nTotal Paid RP 189.000\nBreakdown\nFare 159.000\nFare 184.000\nDiscount -25.000\nToll 20.000\nPlatform Fee 10.000\nTotal Paid 189.000\nPaid by\nOVO Cash 189.000', 'Inclusive of VAT 21.800\nTax Base 19.640\nVAT 2.160\nGot an issue?\nYour Trip\nPT Grab Teknologi Indonesia\nNPWP 123'];
const indo = parseGrabEmailReceipt(buildGrabReceiptNativePages(indoAdjusted)!);
assert.deepEqual(indo?.rows.map(row => [row.amount, row.currency, row.accountName, row.rawPayload?.adjustedFareEvidence]), [['189000.00', 'IDR', 'OVO Cash', { displayedFare: 159000, grossFare: 184000, discount: -25000 }]]);
assert.equal(indo.metadata.accountType, 'wallet');
assert.equal(formatUploadAccountDisplayName('OVO Cash', 'OVO Cash', null, 'wallet'), 'OVO Cash');
assert.equal(getAccountCardName({ name: 'OVO Cash', institution: 'OVO Cash', type: 'wallet', source: 'upload' }), 'OVO Cash');
assert(hasVerifiedGrabReceiptRows(buildGrabReceiptNativePages(indoAdjusted)!, indo.rows));
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([indoAdjusted[0].replace('Discount -25.000', 'Discount -24.000'), indoAdjusted[1]])!), /gross, discount and displayed net fare disagree/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([indoAdjusted[0], indoAdjusted[1].replace('VAT 2.160', 'VAT 2.161')])!), /tax disclosure is incomplete or contradictory/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([indoAdjusted[0].replace('OVO Cash 189.000', 'Visa 1234 189.000'), indoAdjusted[1]])!), /payment method or amount is unsupported/);

const indoMetered = ['Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 8 September 2023\nBooking ID: A-INVENTEDIDR002\nTotal Paid RP 378.500\nBreakdown\nMetered fare 324.000\nPlatform Fee 15.000\nTax Base 13.514\nVAT 1.486\nToll 39.500\nTotal Paid 378.500\nPaid by\nOVO Cash 378.500', 'Got an issue?\nYour Trip\nPT Grab Teknologi Indonesia\nNPWP 123'];
const metered = parseGrabEmailReceipt(buildGrabReceiptNativePages(indoMetered)!);
assert.deepEqual(metered?.rows.map(row => [row.amount, row.currency, row.rawPayload?.taxEvidence]), [['378500.00', 'IDR', { taxBase: 13514, vat: 1486, inclusiveOfVat: null }]]);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([indoMetered[0].replace('VAT 1.486', 'VAT 1.487'), indoMetered[1]])!), /tax disclosure is incomplete or contradictory/);

const splitIdr = 'Your Grab E-Receipt\n1 message\nHope you enjoyed your ride!\nPicked up on 28 February 2025\nBooking ID: A-INVENTEDSPLITIDR\nTotal Paid\nRP 1 0 0.500\nBreakdown\nFare 70.500\nFare 80.500\nPromo -10.000\nToll 15.500\nOthers 5.000\nPlatform Fee 9.500\n1 0 0.500\nTotal Paid\nPassenger Paid by\nExample Person\n1 0 0.500\nOVO Cash\nProfile\nPERSONAL\nInclusive of VAT 12.000\nVAT 1.000\nGot an issue?\nYour Trip\nPT Grab Teknologi Indonesia\nNPWP 123';
const splitIdrParsed = parseGrabEmailReceipt(buildGrabReceiptNativePages([splitIdr])!);
assert.deepEqual(splitIdrParsed?.rows.map(row => [row.amount, row.currency, row.accountName, row.rawPayload?.nativeAmountGlyphsNormalized, row.rawPayload?.taxEvidence]), [['100500.00', 'IDR', 'OVO Cash', true, { taxBase: null, vat: 1000, inclusiveOfVat: 12000 }]]);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([splitIdr.replace('1 0 0.500\nTotal Paid', '1 0 0.501\nTotal Paid')])!), /headline and summary totals disagree/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([splitIdr.replace('1 0 0.500\nOVO Cash', '1 0 0.501\nOVO Cash')])!), /payment method or amount is unsupported/);
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([splitIdr.replace('Others 5.000', 'Unlabeled charge 5.000')])!), /unsupported regional fare component/);

// A single printed sheet can contain two messages, each flowing left then right.
const printedLines = [
  ['Your Grab E-Receipt\n2 messages\nHope you enjoyed your ride!\nPicked up on 14 August 2026\nBooking ID: A-INVENTEDPANEL01\nTotal Paid\nP 120.00\nBreakdown\nBase fare 40.00\nDistance 30.00\nTime 20.00\nSurge charges 30.00\nTotal Paid\n120.00\nPassenger Paid by', 50, 700],
  ['Cash 120.00\nGot an issue?\nYour Trip\nChino Roces Ave', 360, 700],
  ['Hope you enjoyed your ride!\nPicked up on 14 August 2026\nBooking ID: A-INVENTEDPANEL02\nTotal Paid\nP 90.00\nBreakdown\nBase fare 40.00\nDistance 30.00\nTime 20.00\nTotal Paid\n90.00\nPassenger Paid by\nCash 90.00', 50, 300],
  ['Your Trip\nQuezon Ave', 360, 300],
] as const;
const printedItems = printedLines.map(([str, x, y]) => ({ str, transform: [1, 0, 0, 1, x, y] }));
const panels = buildGrabTwoMessagePanelBodies(printedItems, 612, 792);
assert.equal(panels?.length, 2);
const panelRows = parseGrabEmailReceipt(buildGrabReceiptNativePages([printedLines.map(line => line[0]).join('\n')], [], panels!)!);
assert.deepEqual(panelRows?.rows.map(row => [row.amount, row.currency, row.accountName, row.rawPayload?.referenceNumber]), [
  ['120.00', 'PHP', 'Cash', 'A-INVENTEDPANEL01'], ['90.00', 'PHP', 'Cash', 'A-INVENTEDPANEL02'],
]);
assert(hasVerifiedGrabReceiptRows(buildGrabReceiptNativePages([printedLines.map(line => line[0]).join('\n')], [], panels!)!, panelRows!.rows));
assert.throws(() => parseGrabEmailReceipt(buildGrabReceiptNativePages([printedLines.map(line => line[0]).join('\n')], [], [panels![0], panels![1].replace('Cash 90.00', 'Cash 80.00')])!), /source review/);
assert.equal(buildGrabTwoMessagePanelBodies(printedItems.slice(0, 3), 612, 792), null, 'Missing right panel cannot create panel proof');
assert.equal(buildGrabTwoMessagePanelBodies(printedItems.slice(1), 612, 792), null, 'Missing two-message header cannot create panel proof');

console.log('Held Grab layouts: PHP/MYR/THB/IDR, legacy food, adjusted fares, split IDR glyphs, inclusive tax disclosures, and unsafe negatives passed.');
