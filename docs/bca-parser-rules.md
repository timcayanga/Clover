# BCA native transfer-proof rules

This scope is the single-page native KlikBCA `Transfer Dana` table with `Transaksi berhasil diotorisasi`, the BCA copyright footer, completed `Berhasil` status and a unique reference. It is a transfer proof, not a bank balance statement or a DANA wallet history.

Retain PDF column roles and wrapped fields: input date/time, transfer type, transfer date/time, `Dari Rekening`, recipient reference, `Jumlah`, `Biaya`, FX, status and reference. The source account label belongs to the payer; it must never become the payee/merchant. Preserve the complete source account number, including leading zeros, separately from the recipient identifier. No beneficiary name is inferred from the identifier.

Require one physical PDF page, matching complete printed page1of1, exactly one native transfer row, equal valid input/transfer dates and times, explicit Rp principal and fee, rate1.00 and completed status. Missing pages/columns, additional transfers, unsupported FX/currency, malformed values and invalid dates require source review. No OCR or generic fallback may promote an unverified recognized proof into confirmed transactions. This is source-fidelity validation, not verification of bank issuance.

Create one IDR expense component for the principal in Transfers and, when positive, a separate Financial fee expense. They share the source reference while retaining distinct component identity. Preserve the source text and printed times. No timezone is printed; use Clover's existing calendar-date policy and retain the local clock strings in evidence, without claiming an exact UTC instant. No opening/ending bank balance is inferred.

New accounts follow the existing balance calculation for the known movements; that derived value is not a printed bank balance. Existing matched account balances, labels, currencies and fields are preserved. Publish the actual stored balance summary in the same confirmation transaction so first and repeated status reads do not repair it. Respect account ownership, capacity, tombstones and ambiguous identities.

Named future `bukti-trf` uploads use the additive `v41-bca-transfer-proof` cache namespace. Older entries, learning and imports remain intact. Private downloaded source and independent labels stay outside Git; the permanent portable example uses invented identities and values. Review authority is Codex source review, not human approval or model fine-tuning.

## Additional verified native variants

The complete one-row table may split Dari/Rekening and Status/Alasan/No./Referensi headers across cells. Validate ordered column roles and full labels. A one-page native KlikBCA URL plus browser1/1 footer may establish print completeness when the copyright footer is absent. Same-bank Rekening BCA recipients use their own full account and owner, separately from the payer. Explicit zero fee produces no additional movement.

A two-page native KlikBCA Bisnis notification is one mirrored event. Require complete matching Indonesian and English date, clock, source/destination account, Rp principal and unique reference; both statuses and immediate transfer types must agree. Preserve original two-page evidence. An absent fee remains unknown (fee and total debit null), and must not be inferred as zero. Printed local clock is retained separately; no timezone or bank balance is inferred. Recognized incomplete/conflicting proofs require review and cannot enter generic confirmation or learning.

## Authorized bilingual transfers with explicit fees

Separate the Indonesian financial block from the English financial block at its native greeting. Email delivery Date/GMT offsets cannot replace the transfer date or establish its timezone. The exact paired labels Transfer Diproses Saat Diotorisasi / Immediate Transfer on Authorization describe a completed authorization; inconsistent transfer types still fail review. Recipient IDs may be ten digits without the payer's hyphen format, including leading zeros.

Both languages must print the same fee or both omit it. A missing, duplicate, malformed or conflicting fee side requires review. A positive matching fee creates one Financial component beside the principal; explicit zero creates none; an absent fee stays unknown. Preserve local clock, source/recipient roles, reference and full original evidence. Repeated confirmation cannot alter existing financial or learning records.

A complete native single-page proof may print Page 1 of 1 in English. Require exactly one consistent complete printed footer alongside the physical page and all financial columns; duplicated or contradictory footers remain unsafe.

The native recipient header can wrap Ke Rekening / No. above BCA Virtual and Account. Require both continuation labels at the same column before assigning recipient roles; missing labels remain review-required. Payer and recipient must come from their own printed columns, even when a download summary reverses them.

## Recipient-side bilingual income

A complete one-page native recipient notification has explicit paired Pengirim/Sender and Rekening Tujuan/To Account fields, matched date/time, full leading-zero reference and Indonesian grouped Rp integer amount, both tax/Notes blocks and closing. Retain one income on the receiving BCA account; sender name is not a payer bank identity. Missing fee, bank balance and timezone remain unknown. No mirror movement or fee is inferred. Missing/conflicting bilingual fields or physical completeness remain review-required; the existing payer-side two-page protocol and its held incomplete examples retain their strict guards.

## Closed legacy bilingual notifications

A separate two-page legacy layout can use the complete native Indonesian greeting/financial block/formal closing and complete English financial block/formal closing as evidence. Require every mirrored amount/account/reference/date/clock/status/transfer-type field to agree, both native closings, no hidden quotes and no partial tax/Notes block. When both note blocks are absent, missing charges remain unknown; do not fabricate fee or UTC time. The modern notification's email/tax-notes contract and its negative guards remain unchanged. Missing either legacy closing, partial notes, inconsistent fields or fewer physical pages remains review-required. The private image-only email header is retained in the original, not invented as native text.

## Printed compact current-event proof

A separate one-page native Gmail print may retain a complete current-event Indonesian and English financial block while hiding earlier quoted email. Require matching full payer/recipient, explicit Rp principal, current-event date/clock, unique reference, both successful statuses/immediate types, official sender text, visible Indonesian tax notice, complete printed1/1 Gmail footer, physical1 and exactly the bounded hidden-quote marker after the completed English status. Retain one visible payment only. Earlier hidden quoted history is not extracted or counted; missing charges, timezone and bank balance remain unknown. Conflicting or partial financial fields, other page counts, malformed print boundary, or one-sided explicit charges fail review. This does not accept an ordinary two-page proof with a corrupted physical-page count. Preserve original bytes and the explicit current-event/hidden-quote scope in raw evidence.
