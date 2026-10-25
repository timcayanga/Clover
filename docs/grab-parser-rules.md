# Grab email receipt rules

This additive path covers complete native Philippine Grab/GrabFood email PDFs with explicit Cash or GCash payment evidence. Original PDFs and real labels remain private. Portable examples use independently invented identities and amounts; machine QA is not human financial confirmation or base-model fine-tuning.

Retain every physical native page. Each receipt needs one explicit booking reference, pickup date, Philippine currency evidence, agreeing headline/summary totals and a reconciled fare or supported food summary. Use the pickup clock and printed +0800 offset when present; calendar-only pickups retain no invented clock. Delivery-email dates are separate evidence. An `All rights reserved` footer cannot establish Albanian currency, and a Singapore headquarters address cannot change Philippine receipt amounts to SGD.

One receipt is one gross expense. Retain fare, toll, insurance, delivery and promotion components as evidence without adding the same component as another expense. Preserve negative promotions. Distinct bookings remain distinct even with identical amounts, merchants and calendar dates. Identical repeated artwork for one booking is one event; contradictory repeated-booking fields require review.

Native restaurant labels must come from the pickup-location column, bounded by the drop-off label and receipt-summary column. A beverage option, driver, passenger or drop-off address is not the merchant. Preserve original source text, native column role evidence, booking references and explicit payment methods separately from normalized titles.

Cash and GCash identify payment account type, not a bank account number. Payer account number and bank balance anchors remain absent. Card suffixes do not establish issuer or complete account identity. Card payments, unsupported currencies, missing receipt messages/pages, unknown payment methods and contradictory arithmetic remain outside automatic confirmation. Existing general receipt behavior and older caches are retained. Future named Grab email receipts use the additional v43-grab-email-receipt namespace.

Reviewed older Philippine ride receipts may print `P` rather than `PHP` or `₱`. Accept it only as a `Total Paid` headline alongside an independent Philippine trip-location cue such as NAIA, Manila, Pasay, Cebu or Davao; a Singapore headquarters footer does not supply that cue. A merged native-text `Hopeyouenjoyed` heading still begins one receipt when the remaining booking, date, payer and two totals reconcile. A `Paid by` label may end one PDF page and its GCash or GrabPay Wallet amount begin the next. Match the explicit payment method and its exact gross total within the payment panel, preserve the wallet name without inventing a wallet number, and keep other currencies and ambiguous payers in review. Future named Grab receipts use additive `v46-grab-reviewed-layouts` extraction; retain v43 cache entries and all confirmed imports.

Older multi-message Philippine Grab email printouts may put one receipt on each physical page. Require the declared message count, a complete IOS booking code and pickup clock per receipt, two matching `P` totals, an explicit Cash payment label, and an independent Philippine trip-location cue in each body. Legacy food receipts may show `Ride Fare` plus `Booking Fee` instead of subtotal/delivery; require their sum to match the total. Their pickup address is not evidence of a restaurant merchant, so use `GrabFood` and retain the address in raw source evidence. Continue to hold mixed currencies, missing pages, card payers, and contradictory totals. Future named receipts use additive `v47-grab-legacy-messages` extraction while retaining prior caches and confirmed imports.

A Malaysian Grab cash receipt can use `RM` at its headline and bare decimal values in its breakdown. Require an independent Malaysian route cue such as KLIA or Kuala Lumpur, matching headline and summary totals, an exact fare-component sum, and explicit Cash payment; a generic Singapore headquarters footer is not a trip location. Preserve MYR from source through metadata and transaction, and reject mixed source currencies. Future named receipts use additive `v48-grab-legacy-myr` extraction while retaining prior caches and confirmed imports.

Regional Thai and Indonesian ride emails have different unit conventions. Accept whole-number `THB` only with a Thai issuer and Bangkok route, explicit Cash payment, complete booking/date, two equal totals, and an exact fare/platform/toll sum. Accept dot-grouped whole-number `RP` only with Indonesian Grab issuer and NPWP evidence, explicit `OVO Cash` wallet payment, and exact totals. Where an Indonesian receipt prints gross and discounted Fare lines, preserve both as separate source evidence and count only gross Fare plus the negative discount once. Tax Base and VAT are disclosure evidence; require them to reconcile with the stated inclusive amount or platform fee, but do not add them to the transaction again. A native PDF layer may split digits within dot-grouped IDR amounts; normalize only those numeric glyphs for reconciliation, retain the original text, and require independent matching headline, reversed summary, and payer amounts. A tax disclosure with an inclusive amount and VAT but no printed tax base remains partial evidence, not an additional expense. Preserve original page text, account number absence, receipt date, and original currency. Keep contradictory numeric glyphs and unsupported payment methods in review. Future named receipts use additive `v49-grab-regional-rides` extraction; prior caches and confirmed imports remain intact.

Keep the explicit `OVO Cash` payer wallet name in account storage and cards. The generic account-brand fallback `Wallet` loses the identity printed by the Indonesian source and fails staging source review. Do not rewrite any existing customized account identity.

A printed Gmail sheet may place two complete Philippine ride messages in four page quadrants, each message flowing from the left half to the matching right half. Apply that reading order only to a single native page with an explicit two-message header, one complete booking in each left panel, a ride body in each left panel, and a `Your Trip` section in each right panel. Preserve the original full-page native text separately from each reconstructed receipt body. `Chino Roces`, `Pasong Tamo`, and `Quezon Ave` are Philippine trip-location cues for a `P` headline only when the headline and summary totals, explicit Cash payer, booking, date, and fare components independently reconcile. Two distinct bookings remain two transactions. This additive path uses `v50-grab-printed-panels` for future extraction; older cache entries and confirmed imports remain intact.

Publish the actual stored payment-account projection within confirmation so subsequent settled status reads and repeated confirmation are no-ops. Confirmed edits, account identity, currencies, raw evidence and durable learning remain protected.

## Image-only headline in a native Philippine email receipt

Some printed legacy Grab emails put the large `P` headline total in an image while the payment method, fare components, summary total, booking, pickup clock and Philippine route remain in the PDF text layer. Only for a short native Grab email with one booking and a missing text-layer headline, render the page and OCR a small region anchored below the native `TOTAL` / `DATE | TIME` label. Keep the original PDF and all physical native page text unchanged. Store the OCR text, rendered crop SHA-256, page and booking reference as separate visual evidence. The recovered amount must be one unambiguous `P` value and agree exactly with the printed summary and full component arithmetic; otherwise require review. A summary alone must never stand in for the missing headline. This future-only path uses `v52-grab-visual-headline` for named legacy Grab receipt PDFs while retaining earlier caches, rules and confirmed records.

## Reviewed Barangay Central route cue

An older complete GrabPay Wallet receipt prints only `P` for its total and names `11-C Marunong St, Central` as a trip stop. Quezon City Government identifies Marunong Street in Barangay Central, Quezon City (https://quezoncity.gov.ph/brgy-directory/central/). Accept a numbered Marunong Street, Central address only inside the `Your Trip` section and only with the existing agreeing headline, summary, fare arithmetic, booking, date and explicit wallet-payment checks. The sender address, Singapore footer, an unnumbered street mention or a standalone `Central` cannot establish Philippine currency. Keep the original address as source evidence and the GrabPay Wallet identity without inventing a wallet number or bank balance. This additive parser rule does not modify prior imports or learned data.

## Unidentified payment references and native Word receipts

A complete, reconciled receipt may show only a four-digit reference in its native
Paid by panel. Preserve that reference separately from the full payer number,
issuer and account type (all unknown). It must wait for explicit selection of an
existing bank/card account in the same Profile and source currency with a matching
stored suffix. Do not create a Cash account or infer an issuer from a card logo.
The account-review phase remains processing so deferred learning can resume after
confirmation. Unselected references have no financial transaction or training
signal. Confirmation must preserve every existing account field and balance.

The bounded DOCX reader supports one complete Grab cash receipt with native
Word text. It reads the main part and native headers/footers, retains their hashes
and text separately from normalized data, and selects one compatible drawing
representation rather than concatenating Choice and Fallback. It does not invent
PDF page counts. Headline, summary, payment and fare components must reconcile;
booking, pickup date and currency must be explicit. Sender clocks do not supply
pickup clocks. Malformed XML, DTD/entity declarations, revisions, active/embedded
content, excessive expansion and unsupported receipts require source review.
The old clipped PDF remains retained; recovery from its complete original Word
file is an alternate source artifact, not a rewrite of old evidence or labels.

Release coverage: `grab-unspecified-instrument` and `grab-native-word` in the
reviewed corpus; `word-receipt-regression.ts`,
`grab-payment-instrument-db-regression.ts`, and
`word-receipt-db-regression.ts` in the permanent release gate. Their invented
financial labels are independent of the private originals. Both statement and
receipt import modes, durable jobs, repeat confirmation, and existing confirmed
financial data are checked with disposable PostgreSQL and no provider calls.
