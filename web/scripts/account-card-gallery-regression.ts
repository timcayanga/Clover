import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getLuxuryAccountCardClass,
  LUXURY_ACCOUNT_CARD_STYLES,
} from "@/lib/account-card-luxury";

const main = async () => {
  const component = await readFile(
    path.join(process.cwd(), "components/account-card-luxury-gallery.tsx"),
    "utf8",
  );
  const page = await readFile(path.join(process.cwd(), "app/account-card-gallery/page.tsx"), "utf8");
  const rollout = await readFile(path.join(process.cwd(), "lib/account-card-luxury.ts"), "utf8");
  const meRoute = await readFile(path.join(process.cwd(), "app/api/me/route.ts"), "utf8");
  const accountsPage = await readFile(path.join(process.cwd(), "app/accounts/page.tsx"), "utf8");
  const accountDetailPage = await readFile(path.join(process.cwd(), "app/accounts/[accountId]/page.tsx"), "utf8");
  const styles = await readFile(path.join(process.cwd(), "app/globals.css"), "utf8");

  const sampleIds = Array.from(component.matchAll(/id: "([^"]+)"/g), (match) => match[1]);
  assert.equal(sampleIds.length, 20, "The staging gallery should contain exactly twenty card concepts.");
  assert.equal(new Set(sampleIds).size, 20, "Every card concept should have a unique finish.");
  assert.match(component, /<FinancialAccountCard/);
  assert.doesNotMatch(component, /editableName|editableAccountNumber|editableAmount/);
  assert.match(page, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(page, /notFound\(\)/);
  assert.match(styles, /\.card-atelier__grid/);
  assert.match(styles, /\.luxury-account-card::before/);
  assert.doesNotMatch(rollout, /@gmail\.com|PREVIEW_EMAILS/);
  assert.match(rollout, /stableHash/);
  assert.match(meRoute, /luxuryAccountCards: true/);
  assert.match(accountsPage, /luxuryAccountCardsEnabled \? getLuxuryAccountCardClass\(row\.id\)/);
  assert.match(accountDetailPage, /luxuryAccountCardsEnabled \? getLuxuryAccountCardClass\(account\.id\)/);
  assert.equal(getLuxuryAccountCardClass("account-123"), getLuxuryAccountCardClass("account-123"));
  assert.ok(
    LUXURY_ACCOUNT_CARD_STYLES.some((style) => getLuxuryAccountCardClass("account-123").endsWith(style)),
    "A stable account identity should resolve to one of the approved card finishes.",
  );

  console.log("Account card gallery regression passed.");
};

void main();
