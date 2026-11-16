# Reports batch 5 verification — 2026-10-07

## Scope

Forecast scenarios, recurring findings and report navigation. Fictional browser fixtures and staging QA profiles only. No confirmed financial data modified.

## Completed local checks

- Financial regressions: scenario arithmetic and immutability, unknown balances, date bounds, duplicate adjustments, limits, schedule occurrence isolation; recurring completion/duplicate safeguards, recent linked payment evidence, review/stale exclusions and export scope. Existing saved-report authorization, Profile isolation, net-worth and FX checks included.
- Web/native TypeScript checks passed.
- Web layouts: 20 combinations across five widths (320/390/744/1024/1440), including complete and missing evidence. No horizontal overflow or console errors.
- Native components in browser: four Reports subtabs at five widths (320/390/744/1024/1366), with saved reports and filters. No horizontal overflow or console errors. This is not installed-device validation.
- Scenario interactions on web/native components: create/remove/clear, replace an occurrence with zero, 30/90-day windows, invalid date, and editing with network offline.
- Report directory: native menu selection scrolls the chosen heading into view; web selects and focuses the heading. Reduced-motion paths passed.
- Accessibility/layout: keyboard field sequence and enlarged 24px text at 320px width, without horizontal overflow. This does not constitute a full screen-reader audit.
- PDF: actual report export rendered with Chromium; the recurring findings page was inspected after adding schedule evidence. Text remains readable and within table boundaries. CSV/PDF contain explanations, evidence and confidence. Scenarios are deliberately excluded.
- Workload: 500 schedules and 20,000 transactions; local outlook calculation approximately 155 ms after replacing repeated scans (previously approximately 899 ms). Not a network or production benchmark.

## Device verification

Android API 35 emulator started. An older installed preview binary failed before Reports with an Expo native-module ABI error. A fresh debug build completed successfully (642 Gradle tasks) and installed. The emulator then showed System UI and Pixel Launcher ANRs. After reboot, Clover Preview also became unresponsive before reaching Reports. Installed Android interactions therefore remain unverified; neither the build success nor the earlier ABI failure is treated as a Reports runtime pass. The QA emulator was stopped after preserving logcat and screenshots.

iPhone 17 / iOS 26.5 simulator booted and the existing preview app installed, but the dev-client launch prompt could not be controlled because Simulator.app is unavailable on this host. Installed iOS report interactions and system export/share sheets remain unverified.

## Release verification

`npm run qa:prepush` passed: production dependency audit, migrations/boundaries, broad web regressions, web/native TypeScript checks, native layout/auth/chart checks, mobile API fixtures, iOS/Android bundles and the optimized Next.js build. Build warnings include CSS `start` compatibility and dependency deprecations; no gate failure.

After the staging push, verify Vercel READY and `/api/health` against the exact commit, then read Reports twice for the Golden, Empty and Large QA profiles, check finding evidence/plan boundaries and the authenticated FX endpoint. These live checks do not modify financial records. Deployment outcome is reported in the task response. No production deployment or store binary is part of this batch.
