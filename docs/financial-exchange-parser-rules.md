# Financial exchange and structured JSON export rules

- Route `.ofx`, `.qfx`, `.qif`, `.mt940`, `.sta`, CAMT.053 `.xml`, and structured transaction `.json` files through deterministic exchange parsing before generic statement parsing or any AI fallback.
- Validate the file signature or schema before parsing. OFX/QFX must begin with an OFX header or container; QIF must begin with a recognized `!Type:`, `!Account`, or supported `!Option:` declaration; MT940 requires statement, account, and transaction tags; XML must be a CAMT bank-to-customer statement; JSON must contain transaction records with both a date and amount field.
- Preserve stable source identifiers such as OFX `FITID`, check numbers, QIF transaction numbers, cleared state, MT940 transaction codes, CAMT references, JSON source records, and original signed amounts in `rawPayload`.
- Store transaction amounts as positive magnitudes and derive direction from the signed source amount. Explicit OFX transfer transaction types and QIF transfer categories take precedence over the sign.
- Preserve explicit currency, account identity, institution, payee, memo, and category fields. Do not invent missing account identity.
- Track MT940 `:25:` account and `:60`/`:62` currency state as it changes so concatenated statements do not inherit the first account.
- For CAMT.053, scope account, owner, currency, service-provider name, and BIC to each `<Stmt>`. Keep BIC as provenance rather than using it as a display bank name.
- Split a CAMT batch entry into its `<TxDtls>` rows only when every detail has an amount and the detail sum reconciles to the entry amount within one cent. Otherwise preserve the aggregate entry.
- Structured JSON source categories take precedence over inferred ATM-cash routing. Only an explicit Cash & ATM source category may create a cash-account mirror from a structured export.
- Skip zero-value records. Legacy exchange parsers may exclude malformed records; QIF migration and Korean/Indonesian flat JSON exports must reject the whole file when a populated record is malformed. A recognized exchange file that produces no safe rows must fail closed and must not fall through to heuristic text parsing.
- Never send a recognized financial exchange or structured transaction JSON export to a paid parser.

## Korean and Indonesian JSON exports

- Explicit `locale` (`ko`, `ko-KR`, `id`, `id-ID`) or unambiguous KRW/IDR currency evidence selects the regional adapter. Source currency takes precedence over context currency. Locale is number/date-format evidence, never permission to invent a currency.
- Reuse the localized structured ledger parser for amount direction, category, status, balance and review behavior. Keep its temporary adapter cells separate from the original JSON record and source index. Native KFTC `res_list` and SNAP `detailData` envelopes remain unsupported.
- Numeric JSON money values use decimal-dot representation; strings retain their printed local separators, signs and currency markers. Validate all populated aliases before selecting a value. Reject conflicting aliases, nested money objects, unsafe/sub-cent values, multiple record lists and explicit incomplete pagination.
- Preserve the printed calendar date from valid ISO timestamps with offsets; validate the actual calendar day and clock. Transaction date aliases must agree. Booking/posted dates remain fallback dates rather than conflicting with a separately supplied transaction date.
- Account numbers must be strings so leading zeros survive. Explicit row account metadata takes precedence over document metadata. Do not use provider access tokens or arbitrary references as account numbers.
- Recognized pending/cancelled records are excluded. Unknown status, uncertain direction, conflicting monetary evidence and source-provided low confidence require review with a reason. Confidence cannot be raised above either the source or deterministic result.
- Include currency in reference deduplication. An equal amount, date and reference in different currencies must not be silently dropped.
- Corpus: `web/scripts/fixtures/korea-indonesia-bank-exports/`; gate: `qa:bank-export-corpus`. These are original synthetic development cases, not private customer records or a held-out accuracy benchmark.

## QIF migration hardening (8 October 2026)

Non-investment QIF now uses `web/lib/qif-migration-import.ts` and the source-preserving migration worker. Follow the QIF section of `docs/app-migration-parser-rules.md`. Bank, Cash, CCard, Oth A and Oth L sections are supported. Embedded account sections, signed split components, category paths, class tags, parent/child memos and transfer directions must survive persistence. Investment/business transactions and unsupported financial fields fail closed; never save a recognized subset of a mixed unsupported file. Account/category/class lists and memorized reminders are not history. Original QIF records remain separate from normalized fields.

This supersedes the old first-value-per-tag parser, which flattened splits and ignored account sections. Historical records are not rewritten. Reimport matching protects records saved with the new migration evidence; older flattened imports cannot always be matched to newly itemized split parts.
