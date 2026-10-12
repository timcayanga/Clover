# BCA native transfer-proof rules

This scope is the single-page native KlikBCA `Transfer Dana` table with `Transaksi berhasil diotorisasi`, the BCA copyright footer, completed `Berhasil` status and a unique reference. It is a transfer proof, not a bank balance statement or a DANA wallet history.

Retain PDF column roles and wrapped fields: input date/time, transfer type, transfer date/time, `Dari Rekening`, recipient reference, `Jumlah`, `Biaya`, FX, status and reference. The source account label belongs to the payer; it must never become the payee/merchant. Preserve the complete source account number, including leading zeros, separately from the recipient identifier. No beneficiary name is inferred from the identifier.

Require one physical PDF page, matching complete printed page1of1, exactly one native transfer row, equal valid input/transfer dates and times, explicit Rp principal and fee, rate1.00 and completed status. Missing pages/columns, additional transfers, unsupported FX/currency, malformed values and invalid dates require source review. No OCR or generic fallback may promote an unverified recognized proof into confirmed transactions. This is source-fidelity validation, not verification of bank issuance.

Create one IDR expense component for the principal in Transfers and, when positive, a separate Financial fee expense. They share the source reference while retaining distinct component identity. Preserve the source text and printed times. No timezone is printed; use Clover's existing calendar-date policy and retain the local clock strings in evidence, without claiming an exact UTC instant. No opening/ending bank balance is inferred.

New accounts follow the existing balance calculation for the known movements; that derived value is not a printed bank balance. Existing matched account balances, labels, currencies and fields are preserved. Publish the actual stored balance summary in the same confirmation transaction so first and repeated status reads do not repair it. Respect account ownership, capacity, tombstones and ambiguous identities.

Named future `bukti-trf` uploads use the additive `v41-bca-transfer-proof` cache namespace. Older entries, learning and imports remain intact. Private downloaded source and independent labels stay outside Git; the permanent portable example uses invented identities and values. Review authority is Codex source review, not human approval or model fine-tuning.
