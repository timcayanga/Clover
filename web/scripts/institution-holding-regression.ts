import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const institutionPage = readFileSync(resolve(root, "app/accounts/institutions/[institutionSlug]/page.tsx"), "utf8");
const accountsPage = readFileSync(resolve(root, "app/accounts/page.tsx"), "utf8");
const styles = readFileSync(resolve(root, "app/globals.css"), "utf8");
const shell = readFileSync(resolve(root, "components/clover-shell.tsx"), "utf8");

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
  [accountsPage.includes('className="financial-account-card--investment-institution"'), "Institution cards have concise preview styling"],
  [styles.includes(".financial-account-card--investment-institution .financial-account-card__number"), "Institution preview stays on one line"],
] as const;

const failed = checks.filter(([passed]) => !passed);
if (failed.length > 0) {
  failed.forEach(([, message]) => console.error(`[FAIL] ${message}`));
  process.exit(1);
}

console.log("[PASS] institution holdings can be added from Assets and the floating Add button");
