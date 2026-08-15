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

const germany = resolveNewUserRegionalDefaults({
  countryCode: "DE",
  acceptLanguage: "de-DE,de;q=0.9",
});
assert.equal(germany.baseCurrency, "EUR");
assert.equal(germany.dateFormat, "DD/MM/YYYY");
assert.equal(germany.numberFormat, "1.234,56");

const onboardingPage = readFileSync(resolve(process.cwd(), "app/onboarding/page.tsx"), "utf8");
const onboardingRoute = readFileSync(resolve(process.cwd(), "app/api/onboarding/route.ts"), "utf8");
const syncComponent = readFileSync(resolve(process.cwd(), "components/regional-preferences-sync.tsx"), "utf8");
const migration = readFileSync(
  resolve(process.cwd(), "prisma/migrations/20260815143000_add_user_regional_preferences/migration.sql"),
  "utf8",
);

assert.match(onboardingPage, /hasCompletedOnboarding\(user\)[\s\S]*?redirect/u);
assert.match(onboardingPage, /x-vercel-ip-country/u);
assert.match(onboardingRoute, /!user\.regionalPreferencesInitializedAt/u);
assert.doesNotMatch(onboardingRoute, /x-forwarded-for|request\.ip/u, "Regional setup must not persist a raw IP address");
assert.match(syncComponent, /if \(payload\?\.regionalPreferences\)/u);
assert.doesNotMatch(syncComponent, /fallbackRegionalPreferences/u, "Existing users without stored preferences must remain unchanged");
assert.doesNotMatch(migration, /NOT NULL|DEFAULT/u, "New regional columns must remain nullable for existing users");

console.log("New-user regional default regression checks passed.");
