import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveNewUserRegionalDefaults } from "../lib/new-user-regional-defaults";

const ukByGeo = resolveNewUserRegionalDefaults({
  countryCode: "GB",
  acceptLanguage: "en-US,en;q=0.9",
});
assert.equal(ukByGeo.baseCurrency, "GBP");
assert.equal(ukByGeo.dateFormat, "DD/MM/YYYY");
assert.equal(ukByGeo.countryCode, "GB");
assert.equal(ukByGeo.detectionSource, "geo");

const ukByLocale = resolveNewUserRegionalDefaults({
  countryCode: null,
  acceptLanguage: "en-GB,en;q=0.9",
});
assert.equal(ukByLocale.baseCurrency, "GBP");
assert.equal(ukByLocale.dateFormat, "DD/MM/YYYY");
assert.equal(ukByLocale.detectionSource, "locale");

const languageOnly = resolveNewUserRegionalDefaults({
  countryCode: null,
  acceptLanguage: "en,en-US;q=0.8",
});
assert.equal(languageOnly.baseCurrency, "PHP", "A language subtag alone must not be mistaken for a country");
assert.equal(languageOnly.countryCode, "PH");

const unitedStates = resolveNewUserRegionalDefaults({ countryCode: "US" });
assert.equal(unitedStates.baseCurrency, "USD");
assert.equal(unitedStates.dateFormat, "MM/DD/YYYY");

const guam = resolveNewUserRegionalDefaults({
  countryCode: "GU",
  acceptLanguage: "en-US,en;q=0.9",
});
assert.equal(guam.baseCurrency, "USD", "Guam must use USD rather than the PHP fallback");
assert.equal(guam.countryCode, "GU");
assert.equal(guam.detectionSource, "geo");

const germany = resolveNewUserRegionalDefaults({
  countryCode: "DE",
  acceptLanguage: "de-DE,de;q=0.9",
});
assert.equal(germany.baseCurrency, "EUR");
assert.equal(germany.dateFormat, "DD/MM/YYYY");
assert.equal(germany.numberFormat, "1.234,56");

const onboardingPage = readFileSync(resolve(process.cwd(), "app/onboarding/page.tsx"), "utf8");
const onboardingRoute = readFileSync(resolve(process.cwd(), "app/api/onboarding/route.ts"), "utf8");
const onboardingForm = readFileSync(resolve(process.cwd(), "components/onboarding-form.tsx"), "utf8");
const starterData = readFileSync(resolve(process.cwd(), "lib/starter-data.ts"), "utf8");
const syncComponent = readFileSync(resolve(process.cwd(), "components/regional-preferences-sync.tsx"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260815143000_add_user_regional_preferences/migration.sql"),
  "utf8",
);

assert.match(onboardingPage, /hasCompletedOnboarding\(user\)[\s\S]*?redirect/u);
assert.match(onboardingPage, /x-vercel-ip-country/u);
assert.match(
  onboardingPage,
  /regionalPreferencesInitializedAt[\s\S]*?regionalPreferences: regionalDefaults/u,
  "The first detected regional preference must be persisted before other bootstrap requests run",
);
assert.match(
  onboardingPage,
  /ensureStarterWorkspace\([\s\S]*?regionalDefaults\.baseCurrency/u,
  "The detected currency must reach starter workspace creation",
);
assert.match(onboardingRoute, /!user\.regionalPreferencesInitializedAt/u);
assert.match(onboardingRoute, /export async function PATCH/u, "Onboarding must save a currency choice before the first import");
assert.match(onboardingRoute, /alignUserStarterCashCurrencyWithClient/u);
assert.match(onboardingForm, /Default currency/u);
assert.match(onboardingForm, /Select your default currency/u);
assert.match(onboardingForm, /detectionSource: "manual"/u);
assert.match(starterData, /currency: starterCurrency/u);
assert.match(starterData, /alignWorkspaceStarterCashCurrencyWithClient/u);
assert.doesNotMatch(
  starterData.slice(starterData.indexOf("export const seedWorkspaceDefaults")),
  /ensureWorkspaceCashAccountWithClient\(tx, workspaceId, "PHP"\)/u,
  "Workspace bootstrap must not recreate PHP after a different default was selected",
);
assert.doesNotMatch(onboardingRoute, /x-forwarded-for|request\.ip/u, "Regional setup must not persist a raw IP address");
assert.match(syncComponent, /if \(payload\?\.regionalPreferences\)/u);
assert.doesNotMatch(syncComponent, /fallbackRegionalPreferences/u, "Existing users without stored preferences must remain unchanged");
assert.doesNotMatch(migration, /NOT NULL|DEFAULT/u, "New regional columns must remain nullable for existing users");

console.log("New-user regional default regression checks passed.");
