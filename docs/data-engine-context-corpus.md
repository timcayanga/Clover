# Data Engine Context Corpus

Version: `2026.07.12`

The context corpus provides regional and global evidence for transaction normalization. It is advisory context: it may enrich a parsed row or increase confidence, but it must not overwrite confirmed transaction fields.

## Current coverage

- Global: Wise, PayPal, card networks, remittance providers, travel booking, rideshare, subscriptions, healthcare, education, insurance, and investment platforms
- Philippines: banks and digital banks, GCash/Maya/PalawanPay, InstaPay/PESONet, remittance and bill-payment agencies, supermarkets, pharmacies, delivery, toll/transit, utilities, telecom, ecommerce, fuel, and airlines
- Southeast Asia: Singapore, Malaysia, Indonesia, Thailand, Vietnam, Cambodia, Myanmar, Brunei, and Laos, including national QR/instant-payment rails, banks, wallets, transit, grocery, commerce, and utility ecosystems
- East Asia: Japan, South Korea, Hong Kong, Taiwan, and mainland China, including transit IC cards, wallets, banks, ecommerce, convenience stores, and local transport
- Diaspora and international accounts: India, UAE, Saudi Arabia, Qatar, Kuwait, SEPA/Europe, United States, Canada, United Kingdom, Australia, and New Zealand

## Evidence policy

Each entry has aliases, geography, payment rail, institution type, currency, semantic hints, and confidence. Aliases are evidence only; they are not sufficient by themselves to replace a user-confirmed merchant, category, or type.

The resolver returns multiple signals, regional parsing metadata, and a `contextStatus`:

- `matched`: one coherent regional interpretation;
- `ambiguous`: conflicting country or rail evidence, so regional fields and semantic hints are suppressed;
- `unmatched`: no corpus evidence beyond any explicitly supplied currency.

Field-level confidence is tracked separately for geography, rail, institution type, currency, category, and transaction type. Travel and foreign-currency signals are intentionally separate from country inference: an overseas hotel does not prove which country the user visited.

Regional parsing metadata includes likely locale, date order, decimal separator, grouping separator, languages, and common legal-entity suffixes. These values are parsing hints only. The parser must still prefer statement headers, explicit format metadata, and successful statement templates when they disagree.

Every corpus signal is marked as curated, learned, or user-confirmed, with an active, candidate, or retired review status. The quality report checks unique entry IDs, duplicate aliases, valid confidence bounds, and unique regional profiles before a corpus change is accepted.

Repeated confirmed or edited user corrections can now be aggregated into reviewable corpus candidates. Candidates require repeated consistent observations, are capped below deterministic confidence, and remain `source: learned` plus `reviewStatus: candidate` until explicitly reviewed. Conflicting country or currency evidence is retained as evidence rather than auto-resolved.

Rows with strong travel signals can be grouped into conservative travel episodes when they occur within five days. The episode is attached to normalized parsed-row context with dates, countries, currencies, evidence, and confidence; it does not replace transaction categories or amounts.

Context can also provide `counterpartyType` and `purposeHint` values such as employer/salary, government/tax, remittance provider/remittance, travel provider/travel, and financial institution/fee. These are enrichment signals with independent confidence—not automatic category replacements.

The expansion pass prioritizes places where Filipino financial context is likely to originate: the Philippines launch market; ASEAN work, travel, and payment corridors; East Asian tourism and employment corridors; Western Asia OFW destinations; and large diaspora markets. It captures both institution-level evidence (banks, wallets, payment rails, remittance channels) and merchant-level evidence (groceries, transport, utilities, telecom, healthcare, education, travel, ecommerce, subscriptions, and fuel). Country inference remains conservative: a global merchant signal can enrich purpose without claiming a country.

The corpus now contains more than 1,000 entries. In addition to canonical regional entries, it includes lower-confidence descriptor variants for multi-word signals, such as a known institution or merchant followed by `payment`, `transaction`, or `merchant`. These variants model the way statement processors decorate names, retain the same regional and semantic context, and are intentionally scored below canonical aliases.

The latest canonical layer adds Indian UPI/IMPS/NEFT participants and consumer ecosystems, New Zealand EFTPOS and bank/retail context, SEPA credit-transfer/direct-debit variants, Gulf utilities and remittance-adjacent providers, and additional country-specific banks, commerce, transit, airline, telecom, and investment signals.

This pass extends the worldwide fallback layer with Canadian Interac and bank/utility descriptors; Saudi, Qatar, Kuwait, and broader Gulf domestic rails; and Brazil Pix, Mexico SPEI, South Africa PayShap, and Turkey FAST/EFT context. These markets are intentionally lower-confidence than the Philippines and core ASEAN packs unless a statement also supplies matching currency or institution evidence.

Research basis for prioritization includes the Philippine Statistics Authority's 2024 Survey on Overseas Filipinos, which places Asia at 74.5% of OFWs and identifies Saudi Arabia, the UAE, Kuwait, Qatar, Hong Kong, Taiwan, Singapore, and Japan among the major Asian destinations. Payment-rail coverage follows current official descriptions from Bank Indonesia (QRIS), Bank of Thailand (PromptPay), PayNet Malaysia (DuitNow), Octopus/Hong Kong FPS, and Japan's transport-card guidance. These references guide coverage priorities; aliases remain curated evidence and are not treated as proof of identity or location.

Reference sources: [PSA Survey on Overseas Filipinos 2024](https://psa.gov.ph/content/results-2024-overseas-filipino-workers-number-overseas-filipino-workers-grew), [Bank Indonesia QRIS](https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx), [Bank of Thailand PromptPay](https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html), [PayNet DuitNow](https://paynet.my/personal-solutions/duitnow-qr.html), [Octopus FPS](https://www.octopus.com.hk/en/consumer/mobile-payment/fps/index.html), and [JNTO IC travel cards](https://faq.japan-travel.jnto.go.jp/en/plan/ic-card/).

For generic delimited imports, known regional profiles now provide a conservative fallback for numeric dates and amount separators. Explicit statement parser rules still take precedence; unknown or ambiguous regions fall back to the existing parser and retain the original raw record.

The engine should keep these layers separate:

1. raw statement/OCR text;
2. parsed values;
3. corpus-derived context;
4. normalized values;
5. learned user rules;
6. confirmed user values.

When corpus evidence conflicts with a confirmed value, the confirmed value wins. When evidence is unfamiliar or ambiguous, the row remains reviewable.

## Expansion roadmap

1. Add explicit country, region, payment rail, and evidence fields to normalized payloads.
2. Expand institution and wallet aliases from real imported statements.
3. Use locale-aware date, decimal, language, and legal-entity metadata in generic parsing fallbacks.
4. Add foreign-currency conversion, exchange-fee, and travel-event grouping.
5. Add regional regression fixtures and confidence calibration.
6. Promote repeated, high-quality user corrections into versioned corpus entries only after review.
7. Continue harvesting statement-specific aliases from confirmed imports, keeping country packs and merchant-vertical packs separately reviewable.

## Adding an entry

Prefer a narrow alias and an explicit semantic meaning. Include a negative example when an alias is commonly ambiguous. Do not add a merchant to a shared corpus solely because one user confirmed it; that belongs in workspace-scoped learning rules.
