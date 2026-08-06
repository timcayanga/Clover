import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sortInvestmentTransactionsNewestFirst } from "@/lib/investment-transaction-order";

const root = resolve(process.cwd());
const institutionPage = readFileSync(resolve(root, "app/accounts/institutions/[institutionSlug]/page.tsx"), "utf8");
const accountsPage = readFileSync(resolve(root, "app/accounts/page.tsx"), "utf8");
const accountsRoute = readFileSync(resolve(root, "app/api/accounts/route.ts"), "utf8");
const styles = readFileSync(resolve(root, "app/globals.css"), "utf8");
const shell = readFileSync(resolve(root, "components/clover-shell.tsx"), "utf8");

const orderedTransactions = sortInvestmentTransactionsNewestFirst([
  { id: "older-imported-later", date: "2026-02-01", createdAt: "2026-08-05" },
  { id: "newer-imported-earlier", date: "2026-07-01", createdAt: "2026-07-02" },
]);
if (orderedTransactions.map((transaction) => transaction.id).join(",") !== "newer-imported-earlier,older-imported-later") {
  console.error("[FAIL] Institution history must follow transaction date rather than import time");
  process.exit(1);
}

const checks = [
  [institutionPage.includes("Add Holding"), "Institution Assets exposes Add Holding"],
  [institutionPage.includes('fetch("/api/accounts"'), "Holding creation uses the existing accounts API"],
  [institutionPage.includes('type: "investment"'), "New holdings are persisted as investments"],
  [institutionPage.includes("institutionDraft.trim() || routeInstitution"), "New holdings inherit the institution"],
  [institutionPage.includes("currency: routeCurrency"), "New holdings inherit the page currency"],
  [institutionPage.includes("clover:open-institution-investment-add"), "Institution page listens for floating Add"],
  [shell.includes('pathname?.startsWith("/accounts/institutions/")'), "Shell recognizes institution detail routes"],
  [shell.includes('new Event("clover:open-institution-investment-add")'), "Floating Add opens the holding flow"],
  [accountsPage.includes('return `${assetCount} asset${assetCount === 1 ? "" : "s"}`'), "Grouped institution cards summarize asset count"],
  [accountsPage.includes('label.split(/\\s*,\\s*/)'), "Comma-joined investment labels are counted as separate assets"],
  [accountsPage.includes('(?:gfunds|atram)\\s+investments?'), "Generic GFunds labels are excluded from the asset count"],
  [accountsPage.includes('effectiveType === "bank" && !isGSaveInstitutionAccount(account)'), "GSave savings products do not render as stray bank cards"],
  [accountsPage.includes('getEffectiveAccountType(account) === "investment" || isGSaveInstitutionAccount(account)'), "All GSave products join one institution group"],
  [accountsPage.includes('\\b(?:unoready|unoboost)\\b'), "Stale UNO product names are recognized as GSave accounts"],
  [accountsPage.includes('? "GSave"'), "Stale UNO products use the canonical GSave institution title"],
  [institutionPage.includes('routeInstitution.toLowerCase() === "gsave"'), "The GSave institution page includes linked savings products"],
  [institutionPage.includes("getInvestmentAssetBrand"), "Institution holdings resolve stable asset branding"],
  [institutionPage.includes('"gstocks philippines"'), "GStocks institution placeholders are not rendered as assets"],
  [institutionPage.includes("isGenericInvestmentAssetLabel(account.name, account.institution) && !hasPositionEvidence"), "Institution portfolio containers without position evidence are not rendered as holdings"],
  [institutionPage.includes("GSave investments are individual time-deposit accounts"), "GSave rejects investment snapshots that belong to other GCash products"],
  [accountsRoute.includes("repairIncompleteGsaveTimeDeposits"), "Accounts maintenance restores incomplete GSave time-deposit metadata"],
  [accountsRoute.includes('account.investmentSubtype === "time_deposit" && account.investmentPrincipal !== null'), "Complete or user-adjusted GSave time deposits are preserved"],
  [accountsRoute.includes("repairExplicitlyMislinkedGsaveSnapshots"), "Explicit non-GSave snapshot links are repaired at read time"],
  [institutionPage.includes("accountsPayload.investmentSnapshots"), "Institution details loads imported snapshot holdings"],
  [institutionPage.includes("institutionHoldingRows.map"), "Imported and manual holdings share the asset table"],
  [institutionPage.includes("<th>Units</th>"), "Institution holdings expose units"],
  [institutionPage.includes("<th>Return</th>"), "Institution holdings expose per-asset return"],
  [institutionPage.includes("institutionPerformance"), "Institution summary derives an evidence-backed total return"],
  [institutionPage.includes("Return needs cost or gain data from the source"), "Missing cost evidence is disclosed instead of fabricated"],
  [institutionPage.includes("institutionHoldingRows.length === 0 && snapshotsLoading"), "The empty state waits for snapshot hydration"],
  [institutionPage.includes("matchedAccounts.length > 0 || current.length === 0"), "Partial cache refreshes preserve populated institutions"],
  [institutionPage.includes("fetchedSnapshots.length > 0 || current.length === 0"), "Transient empty snapshot reads preserve visible holdings"],
  [institutionPage.includes('className="institution-assets-table__asset-name"'), "Asset names render with compact icons"],
  [styles.includes(".institution-assets-table__asset-name .accounts-brand-mark"), "Institution asset marks match transaction row sizing"],
  [accountsPage.includes('className="financial-account-card--investment-institution"'), "Institution cards have concise preview styling"],
  [styles.includes(".financial-account-card--investment-institution .financial-account-card__number"), "Institution preview stays on one line"],
  [institutionPage.includes("sortInvestmentTransactionsNewestFirst"), "Institution trading history uses chronological transaction ordering"],
  [institutionPage.includes('institution-assets-table institution-assets-table--holdings'), "Holdings uses the compact transaction-style table"],
  [institutionPage.includes('institution-assets-table institution-assets-table--history'), "Trading history uses the compact transaction-style table"],
  [institutionPage.includes('AccountBrandMark accountBrand={assetBrand} label={assetName}'), "Trading history rows include compact asset marks"],
  [styles.includes(".institution-assets-table tbody tr:hover td"), "Institution table rows share the Transactions hover treatment"],
] as const;

const failed = checks.filter(([passed]) => !passed);
if (failed.length > 0) {
  failed.forEach(([, message]) => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] institution holdings can be added from Assets and the floating Add button");
