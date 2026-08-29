import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_LOGO_OPTIONS,
  GENERIC_ACCOUNT_LOGO_OPTIONS,
  INSTITUTION_ACCOUNT_LOGO_OPTIONS,
  isValidAccountLogoUrl,
} from "@/lib/account-logo";
import { getAccountBrand } from "@/lib/account-brand";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const main = () => {
  assert.equal(GENERIC_ACCOUNT_LOGO_OPTIONS.length, 6, "The picker must keep the complete generic account-logo set.");
  assert.ok(INSTITUTION_ACCOUNT_LOGO_OPTIONS.length >= 70, "The picker must expose the full bundled institution-logo library.");
  assert.equal(new Set(ACCOUNT_LOGO_OPTIONS.map((option) => option.id)).size, ACCOUNT_LOGO_OPTIONS.length);
  for (const option of ACCOUNT_LOGO_OPTIONS) {
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", option.src)), `Missing bundled logo: ${option.src}`);
    assert.equal(isValidAccountLogoUrl(option.src), true, `Bundled logo should be accepted: ${option.src}`);
  }

  const tinyPng = "data:image/png;base64,iVBORw0KGgo=";
  assert.equal(isValidAccountLogoUrl(tinyPng), true);
  assert.equal(isValidAccountLogoUrl("data:image/svg+xml;base64,PHN2Zz4="), false, "User SVG uploads must remain blocked.");
  assert.equal(isValidAccountLogoUrl("https://example.com/tracker.png"), false, "Remote logo URLs must remain blocked.");

  const overriddenBrand = getAccountBrand({ institution: "BPI", name: "BPI 1234", type: "bank", logoUrl: tinyPng });
  assert.deepEqual(overriddenBrand.logoSrcs, [tinyPng]);
  assert.equal(overriddenBrand.logoFit, "cover");
  const builtInBrand = getAccountBrand({ institution: "BPI", logoUrl: "/assets/banks/philippines/gotyme.png" });
  assert.equal(builtInBrand.logoFit, "contain");

  const card = read("components/financial-account-card.tsx");
  const picker = read("components/account-logo-picker.tsx");
  const accountRoute = read("app/api/accounts/[accountId]/route.ts");
  const accountsPage = read("app/accounts/page.tsx");
  const detailPage = read("app/accounts/[accountId]/page.tsx");
  const migration = read("prisma/migrations/20260829153000_account_logo_override/migration.sql");
  assert.match(card, /<AccountLogoPicker/);
  assert.match(picker, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(picker, /createPortal/);
  assert.match(accountRoute, /isValidAccountLogoUrl/);
  assert.match(accountRoute, /columns\.has\("logoUrl"\)/);
  assert.match(accountsPage, /onLogoCommit=/);
  assert.match(detailPage, /onLogoCommit=\{saveAccountLogo\}/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "logoUrl" TEXT/);

  console.log(`Account logo regression passed with ${ACCOUNT_LOGO_OPTIONS.length} bundled choices.`);
};

main();
