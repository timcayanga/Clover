# Data Engine Context Corpus

Version: `2026.08.01`

The context corpus provides regional and global evidence for transaction normalization. It is advisory context: it may enrich a parsed row or increase confidence, but it must not overwrite confirmed transaction fields.

## Current coverage

- Global: Wise, PayPal, card networks, remittance providers, travel booking, rideshare, subscriptions, healthcare, education, insurance, and investment platforms
- Philippines: banks and digital banks, GCash/Maya/PalawanPay, InstaPay/PESONet, remittance and bill-payment agencies, supermarkets, pharmacies, delivery, toll/transit, utilities, telecom, ecommerce, fuel, and airlines
- Southeast Asia: Singapore, Malaysia, Indonesia, Thailand, Vietnam, Cambodia, Myanmar, Brunei, and Laos, including national QR/instant-payment rails, banks, wallets, transit, grocery, commerce, and utility ecosystems
- East Asia: Japan, South Korea, Hong Kong, Taiwan, and mainland China, including transit IC cards, wallets, banks, ecommerce, convenience stores, and local transport
- Diaspora and international accounts: India, UAE, Saudi Arabia, Qatar, Kuwait, SEPA/Europe, United States, Canada, United Kingdom, Australia, and New Zealand
- Worldwide reviewed packs: 119 regional parsing profiles and 120 canonical country/global contexts across Latin America, the Caribbean, Europe, the Middle East and North Africa, Sub-Saharan Africa, Central Asia, South Asia, East Asia, Southeast Asia, North America, and Oceania

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

The corpus now contains 808 reviewed canonical entries, 2,800+ aliases, 95 currencies, and more than 60,000 lower-confidence descriptor patterns. Descriptor patterns model the way statement processors decorate names, retain the same regional and semantic context, and are intentionally scored below canonical aliases. They are evaluated dynamically instead of being materialized as duplicate in-memory records. Coverage gates evaluate the canonical layer separately so generated labels cannot make a shallow country pack appear complete.

Matching also tolerates compact statement descriptors such as `GCASHCASHIN` when the compact alias is at least six characters long and the source descriptor itself is compact. Compact matches are recorded with `:compact` evidence so downstream review and diagnostics can distinguish them from ordinary word-boundary matches. Every result reports a coverage tier (`canonical`, `descriptor_variant`, `currency_only`, or `none`) plus the matched aliases. The coverage report exposes canonical and descriptor-variant counts, and breaks entries down by country, region, signal kind, semantic purpose, country-by-purpose, and currency so expansion work can target real gaps rather than only increasing volume.

The latest canonical layer adds Indian UPI/IMPS/NEFT participants and consumer ecosystems, New Zealand EFTPOS and bank/retail context, SEPA credit-transfer/direct-debit variants, Gulf utilities and remittance-adjacent providers, and additional country-specific banks, commerce, transit, airline, telecom, and investment signals.

This pass extends the worldwide fallback layer with Canadian Interac and bank/utility descriptors; Saudi, Qatar, Kuwait, and broader Gulf domestic rails; and Brazil Pix, Mexico SPEI, South Africa PayShap, and Turkey FAST/EFT context. These markets are intentionally lower-confidence than the Philippines and core ASEAN packs unless a statement also supplies matching currency or institution evidence.

The newest country packs add Ireland, Switzerland, Germany, Spain, Italy, France, Benelux, Portugal, Bangladesh, Pakistan, Colombia, Chile, Kenya, and Nigeria. They cover local account-to-account rails, wallets, transit, airlines, grocery/commerce brands, and household services while preserving the distinction between a country-specific match and a global merchant signal.

The latest pass adds Austria, Belgium, the Netherlands, Sweden, Norway, Denmark, Poland, Greece, Macau, Guam, Fiji, Ghana, Tanzania, and Sri Lanka, including local mobile-money rails, transit cards, airlines, banks, supermarkets, telecoms, and utility descriptors.

The latest targeted enrichment pass adds high-value utility, telecom, healthcare, and education context for Singapore, Malaysia, Hong Kong, Taiwan, Japan, Gulf markets, North America, Australia, and the United Kingdom. These canonical entries are kept separate from generated descriptor variants so their stronger evidence remains visible and calibratable.

The canonical depth pass adds new regional packs for Brazil, Mexico, South Africa, Turkey, Bangladesh, Pakistan, Colombia, Chile, Kenya, Nigeria, Ghana, Tanzania, Sri Lanka, New Zealand, Austria, Belgium, the Netherlands, Sweden, Norway, Denmark, Poland, and Greece. These entries add local transfer rails, utilities, telecoms, transport, grocery, pharmacy, and remittance-adjacent descriptors instead of relying only on global aliases or generated variants.

The follow-on breadth pass adds canonical everyday-spend context for Cambodia, Myanmar, Brunei, Laos, mainland China, South Korea, Taiwan, Macau, India, the Gulf, and major diaspora markets. It adds utilities, mobile carriers, supermarkets, delivery services, wallets, healthcare, and education providers, with representative regression fixtures for each new context family.

The semantic depth pass adds canonical investment, insurance, housing, subscription, healthcare, and education providers for the Philippines, Japan, Korea, Taiwan, Gulf markets, North America, Australia, and the United Kingdom. These are deliberately modeled as purpose-bearing entries so the engine can enrich transactions without replacing confirmed user categories.

The latest ASEAN and Europe semantic pass adds healthcare, education, utilities, telecom, pharmacy, ecommerce, housing, and charity descriptors for Indonesia, Vietnam, Thailand, Germany, France, Spain, Italy, Switzerland, Ireland, and the Philippines.

The European transit pass separates rail, metro, bus, and fare-card providers from broad travel spending. It includes French Navigo/RATP/Transilien descriptors and additional deterministic transit aliases across Germany, Spain, Italy, the Netherlands, Belgium, Austria, Switzerland, and Ireland.

The recurring-spend pass adds canonical subscription, household-service, food-delivery, rental, telecom, and charity context across the Philippines, ASEAN, Latin America, Africa, South Asia, and Gulf markets, plus global household and donation descriptors. These remain advisory purpose signals and do not replace confirmed categories.

The latest institution-depth pass adds banks and fintechs for Brazil, Mexico, Colombia, Chile, South Africa, Kenya, Nigeria, Ghana, Tanzania, Cambodia, Myanmar, Brunei, and Laos. This strengthens statement-account and transfer recognition in markets that previously relied mostly on wallet or merchant aliases.

The 10,000-entry expansion adds additional realistic statement decorations—`posted`, `settled`, and `statement`—to multi-word canonical aliases. These remain lower-confidence descriptor variants and are separately counted, preserving the distinction between reviewed canonical context and generated statement-form coverage.

The follow-on expansion adds another statement-label layer—`details`, `reference`, `record`, `activity`, `description`, and `line item`—to improve matching against exported ledger and card-statement formats. These are also lower-confidence descriptor variants and do not increase canonical coverage or override confirmed transaction values.

The next expansion adds bank-export terminology—`memo`, `narration`, `particulars`, `transaction details`, `statement entry`, and `ledger entry`—for another broad set of statement forms. These remain lower-confidence descriptor variants, keeping canonical institution and merchant evidence distinct from formatting vocabulary.

The latest expansion adds additional card and bank-export phrasing—`narrative`, `particular`, `reference number`, `posted transaction`, `processed payment`, and `account activity`. These forms improve recognition across statement providers without treating formatting text as stronger evidence than a curated canonical alias.

The canonical-depth pass adds reviewed banking, wallet, transport, food-delivery, grocery, fuel, and remittance signals across India, mainland China, Cambodia, Myanmar, Bangladesh, Pakistan, Colombia, and Chile. Duplicate aliases are filtered before descriptor generation, and compatible regional rail identifiers are preserved so the new evidence does not create artificial ambiguity with existing coverage.

The next canonical pack extends durable coverage across Brunei, Laos, Vietnam, Indonesia, Malaysia, Singapore, Kenya, Nigeria, Ghana, Tanzania, Gulf markets, Canada, Australia, the United Kingdom, and the United States. It emphasizes wallets, mobile-money rails, banks, transit, airlines, delivery, ecommerce, telecom, and investment providers commonly encountered by travelers and diaspora users.

Coverage diagnostics now distinguish canonical country counts from generated descriptor counts and report total aliases, localized-script aliases, and alias counts by script. This makes it possible to see whether a country is genuinely represented by reviewed canonical context, rather than appearing well covered only because descriptor variants multiplied its entries.

Localized alias coverage now includes high-confidence script forms for Thai PromptPay and wallets, Japanese transit and wallet services, Korean wallets and transit cards, Hong Kong Octopus/FPS, Taiwan wallets and stored-value cards, mainland Chinese wallets, and Hindi UPI. The localized form is retained as an alias on the same canonical entry; it does not create a separate country inference path or overwrite user-confirmed values.

The worldwide canonical pass adds 29 regional profiles: Argentina, Peru, Uruguay, Ecuador, Costa Rica, Panama, the Dominican Republic, Guatemala, Portugal, Finland, Czechia, Hungary, Romania, Croatia, Bulgaria, Egypt, Israel, Morocco, Jordan, Oman, Bahrain, Uganda, Rwanda, Ethiopia, Senegal, Côte d’Ivoire, Mauritius, Botswana, and Nepal. Each pack includes a combination of official payment infrastructure, financial institutions, transit, groceries, telecom, or utilities rather than only one globally recognizable merchant. Existing thin packs for Scandinavia, Poland, Greece, Turkey, Sri Lanka, Kenya, Nigeria, Ghana, and Tanzania also receive everyday-purpose depth.

Payment rails in these packs are contextual evidence, not automatic transaction-type decisions. A Yape, MB Way, BenefitPay, mobile-money, or instant-payment descriptor can represent a merchant payment, a payment to another person, or movement between accounts. Clover therefore defers `expense` versus `transfer` until account ownership and counterparty evidence are available.

Canonical alias deduplication is Unicode-aware. Arabic, Hebrew, Cyrillic, Ethiopic, Devanagari, Greek, and Asian-script aliases remain searchable through the same NFKC-normalized resolver used for Latin text. Coverage diagnostics report canonical localized aliases independently from their generated descriptor variants.

The second worldwide canonical pass adds 34 balanced country packs: Estonia, Latvia, Lithuania, Slovakia, Slovenia, Serbia, Bosnia and Herzegovina, North Macedonia, Albania, Moldova, Ukraine, Georgia, Armenia, Azerbaijan, Cyprus, Malta, Iceland, Luxembourg, Bolivia, Paraguay, Honduras, El Salvador, Nicaragua, Jamaica, Trinidad and Tobago, Algeria, Tunisia, Zambia, Malawi, Mozambique, Kazakhstan, Uzbekistan, Kyrgyzstan, and Mongolia. Each pack has five independent context entries spanning a bank or official payment context plus everyday transport, grocery, and utility evidence. This raises the reviewed layer from 638 to 808 canonical entries without changing confirmed transaction fields or the import pipeline.

The pass also adds dedicated Caribbean and Central Asian region codes, 25 newly represented currencies, and Georgian and Armenian script diagnostics. Index-time aliases and runtime descriptions now share the same NFKC normalization. Explicit uppercase aliases cover Armenian and Azerbaijani case-folding forms that JavaScript does not map symmetrically, and regression fixtures verify those statement forms directly.

Official payment-system validation for this pass includes Eesti Pank RT1, Latvijas Banka instant payments, Bank of Lithuania CENTROlink, Národná banka Slovenska instant payments, National Bank of Serbia IPS, Banco Central del Paraguay SPI, and Banco Central de Reserva de El Salvador Transfer365. Payment-rail evidence remains deliberately neutral about whether a payment is an expense, peer transfer, or own-account movement.

Research basis for prioritization includes the Philippine Statistics Authority's 2024 Survey on Overseas Filipinos, which places Asia at 74.5% of OFWs and identifies Saudi Arabia, the UAE, Kuwait, Qatar, Hong Kong, Taiwan, Singapore, and Japan among the major Asian destinations. Payment-rail coverage follows current official descriptions from Bank Indonesia (QRIS), Bank of Thailand (PromptPay), PayNet Malaysia (DuitNow), Octopus/Hong Kong FPS, and Japan's transport-card guidance. These references guide coverage priorities; aliases remain curated evidence and are not treated as proof of identity or location.

Reference sources: [PSA Survey on Overseas Filipinos 2024](https://psa.gov.ph/content/results-2024-overseas-filipino-workers-number-overseas-filipino-workers-grew), [Bank Indonesia QRIS](https://www.bi.go.id/en/fungsi-utama/sistem-pembayaran/ritel/kanal-layanan/qris/default.aspx), [Bank of Thailand PromptPay](https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html), [PayNet DuitNow](https://paynet.my/personal-solutions/duitnow-qr.html), [Octopus FPS](https://www.octopus.com.hk/en/consumer/mobile-payment/fps/index.html), and [JNTO IC travel cards](https://faq.japan-travel.jnto.go.jp/en/plan/ic-card/).

Worldwide rail validation references: [BCRA Transferencias 3.0](https://www.bcra.gob.ar/transferencias-3-0/), [BCRP retail-payment interoperability](https://www.bcrp.gob.pe/docs/Sistema-Pagos/articulos/estrategia-de-interoperabilidad-2025-1.pdf), [SIBS MB WAY](https://www.docs.pay.sibs.com/portugal/sibs-gateway/faqs-sibs-gateway/), [Magyar Nemzeti Bank qvik](https://www.mnb.hu/penzforgalom/qvik), [TRANSFOND RoPay](https://www.transfond.ro/pdf/RA%202024%20Transfond%20EN%20fin.pdf), [Central Bank of Jordan CliQ](https://cbj.gov.jo/EN/List/Payment_Systems_Legislations), [Egypt InstaPay](https://www.instapay.eg/?lang=en&page_id=348), [Bahrain BENEFITPay](https://benefit.bh/Personal/benefitpay/), [National Bank of Ethiopia licensed payment issuers](https://nbe.gov.et/payment-instrument-issuers-system-operators/), [BCEAO electronic-money issuers](https://www.bceao.int/en/content/electronic-money-issuing-institutions-0), [National Bank of Rwanda payment systems](https://www.bnr.rw/paymentsystems), [Nepal connectIPS](https://connectips.com/index.php/faq), [Eesti Pank RT1](https://www.eestipank.ee/en/payments/rt1-instant-payment-system), [Latvijas Banka instant payments](https://www.bank.lv/en/operational-areas/payment-systems/instant-payments), [Bank of Lithuania instant payments](https://www.lb.lt/en/instant-payments), [Národná banka Slovenska instant payments](https://nbs.sk/en/instant-payments/), [National Bank of Serbia IPS](https://ips.nbs.rs/en), [Banco Central del Paraguay SPI](https://www.bcp.gov.py/sistemas-de-pago-y-tesoreria), [Banco Central de Reserva de El Salvador Pay/Transfer365](https://365pay.bcr.gob.sv/ayuda/), [Bank of Jamaica JAM-DEX](https://boj.org.jm/core-functions/currency/cbdc/), and [National Bank of Kazakhstan instant payments](https://nationalbank.kz/en/news/novosti/13765).

For generic delimited imports, known regional profiles now provide a conservative fallback for numeric dates and amount separators. Explicit statement parser rules still take precedence; unknown or ambiguous regions fall back to the existing parser and retain the original raw record.

The engine should keep these layers separate:

1. raw statement/OCR text;
2. parsed values;
3. corpus-derived context;
4. normalized values;
5. learned user rules;
6. confirmed user values.

When corpus evidence conflicts with a confirmed value, the confirmed value wins. When evidence is unfamiliar or ambiguous, the row remains reviewable.

Workspace-scoped manual merchant or category corrections are persisted before the edit request returns. Later imports match the original statement descriptor, normalized merchant prototypes, and a conservative merchant-family signature. A high-confidence exact or family match from a manual correction outranks shared deterministic defaults for that workspace; token-only overlap does not.

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
