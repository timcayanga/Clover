# Korean and Indonesian bank-export corpus

Added 1 October 2026. `cases.json` contains **89 original synthetic regression cases: 44 Korean and 45 Indonesian**. This complements the existing merchant corpus, workbook/holding fixtures and 33 licensed public receipt excerpts. It does not replace them.

The fixture records, account numbers, references, amounts and expected answers were authored for testing. They are not customer records, downloaded bank statements, access tokens or provider-certified sample files. Names from the existing reviewed merchant corpus provide realistic text. No accounts were accessed and no bank API was called.

## Evidence and scope

Public primary references, reviewed on 1 October 2026:

- [KFTC Open Banking transaction-list specification](https://developers.kftc.or.kr/dev/openapi/open-banking/transaction): compact dates, separate times, incoming/outgoing labels, signed balances, pagination and `next_page_yn`. Its table uses `print_content`, while its example uses `printed_content`. The native response has no currency field. A fintech access identifier is not an account number.
- [BRI SNAP BI bank-statement specification](https://developers.bri.co.id/id/snap-bi/api-bank-statement-snap-bi-v1.0): timestamp offsets, explicit debit/credit types, decimal-dot amounts with currency, balances and aggregates separate from individual transactions.

These references inform scenarios and document boundaries. Most cases use **Clover's existing generic flat JSON export schema** or localized delimited tables, not native bank API layouts. The two synthetic native-envelope cases deliberately remain unsupported and fail upload validation. Supporting these generic files does not imply Korean bank linking, new Indonesian connections or native KFTC/SNAP import support.

## Coverage

- Korean comma grouping, Indonesian dot grouping/comma decimals, numeric JSON amounts, foreign currency and original-currency amounts.
- Localized directions, debit-zero/credit-positive records, refunds, pending records, uncertain status and uncertain direction.
- Local midnight with time-zone offsets, compact Korean dates, Indonesian named months, invalid calendar days and clocks.
- Leading-zero account identities, row-level account selection, source categories and confidence, contradictory aliases and incomplete pagination.
- Signed running balances, fees, two distinct references for equal purchases, and a repeated reference in different currencies.
- Actual CP949, UTF-8 BOM, UTF-16 LE/BE bytes; quoted delimiters, embedded quotation marks and multiline descriptions.
- Whole-file rejection when a populated record is malformed. Nested money objects, numerical account IDs, sub-cent values and competing transaction lists must not become a misleading partial import.

Every case stores the exact input plus its SHA-256, an expected result or rejection, and provenance. Encoded cases also store base64 bytes and their hash. Original source records remain separate from normalized fields. `family` groups related template variants; they must stay together if a future training/holdout split is created.

## Verification and limitations

Run `npm --prefix web run qa:bank-export-corpus` from the repository root. It is also part of `qa:release` and the required `qa:prepush` gate.

Assertions cover field values, exact row counts, decoded bytes, source-record mapping, upload schema validation, review reasons/confidence and rejection behavior. Expected answers are authored independently of parser output. Formatting differences alone are not financial accuracy failures; monetary expectations use Clover's ledger representation with two decimal places.

This is a development regression corpus. Passing it is not a measured real-world accuracy rate, image OCR result, held-out benchmark or guarantee that every bank's export will parse. More licensed real-world layouts, screenshots and OCR evaluation remain useful future additions.
