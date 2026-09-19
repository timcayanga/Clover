# Native history parity pass — 19 September 2026

Reference: Screens Figma FNnCmCj90szZAnZ6twMPCy, Account Details 1243:505509, Institution Details 1243:506900, Asset Details 1244:62678, Investments Overview 1245:522386.

Implemented account-scoped transaction history, recorded purchases and dividends, purchase review and deletion confirmations, institution holdings and detail views, and recorded valuation charts with currency and date-range selection. Shared headers, 40px actions, bottom navigation and notice layouts are retained. Institution portfolios replace aggregate balances with individual holdings; unknown values remain unknown.

History routes verify Profile ownership and account ownership before dispatch. Purchase creation and deletion reuse existing web handlers. No confirmed staging financial records were changed during verification.

Valuation lines connect dated recorded values, not historical live market prices. Coverage can be partial and is labeled. A linked account history can include multiple assets. Buy entry is supported by the existing purchase model; a new sell/reinvestment ledger was not invented in this pass.

Installed iOS development app was tested with fictional sample data on 15 September: portfolio, institution details, asset details, valuation chart, purchase review and confirmation. This caught and fixed nested notice controls and duplicate React keys. A fresh installed iOS run on 19 September verified the final portfolio, institution rows/details, asset details, valuation chart and purchase history after Xcode setup completed.

The complete root `npm run qa:prepush` passed on 19 September, including API security/regression suites, native type and chart checks, both Hermes exports and the production web build. The native web preview was checked at 390px, including dark institution details and history navigation.

The full gate passed again after merging the current staging migration and Expo dependency updates. The installed iOS walkthrough preceded that Expo patch update; the subsequent iOS and Android bundle exports passed.

Android installed-app verification remains incomplete. Both the existing API 35 emulator and a fresh API 35 emulator displayed system-app ANR dialogs; Clover Preview also became unresponsive. The app reached its welcome screen, but the history walkthrough could not be completed. This does not establish whether the remaining Android problem is entirely environmental. Native development-app checks use fictional data and are distinct from authenticated staging API flows, TestFlight, Play internal testing and physical-device verification. No store release is implied by a staging web deployment.
