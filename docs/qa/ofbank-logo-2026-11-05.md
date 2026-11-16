# Overseas Filipino Bank branding

Source: OFBank's official website, https://ofbank.com.ph/ (November 5, 2026).
Its HTML identifies https://ofbank.com.ph/images/ofbankfaviconfinal.ico as its
favicon. The canonical Clover PNG preserves the embedded 256 × 256 PNG bytes
exactly, without tracing, recoloring, or generating a replacement logo.

- Official ICO SHA-256: `f4fb19ad5f566949717fdf4e0b4d08c73702d0f1ee27f1a44a26b19aeb11a2c8`
- Embedded PNG SHA-256: `a8a7b30e07493a500e542e0639a0691397a79e77b5b5e2559199111f59590873`
- Canonical asset: `assets/banks/philippines/overseas filipino bank.png`
- Runtime: existing shared bank catalog generates a 128px WebP with a versioned
  cache identity. Existing native clients receive the server-resolved logo URL;
  this asset does not require a new mobile package.

Matches Overseas Filipino Bank, OFBank, OF Bank and OFB. The account institution
picker, account cards, native account-picker projection, and Finverse bank-list
presentation all consume the shared catalog. Saved user-selected logos retain
precedence. LandBank stays distinct. No saved institution, balance, transaction,
provider connector ID, authorization, or bank availability is changed.

Adding a logo is not adding a bank connector or a dedicated statement parser.
The connection directory still uses the real provider catalog; if OFBank is
returned, its existing connector gets the OFBank image. It must never be added
as an invented connectable bank or silently mapped to a LandBank login.
