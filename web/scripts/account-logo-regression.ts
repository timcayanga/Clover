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
import { ADDITIONAL_BANK_LOGOS, findAdditionalBankLogo } from "@/lib/bank-logo-catalog";
import { getInstitutionSuggestionGroups } from "@/lib/institution-suggestions";
import { createHash } from "node:crypto";
import sharp from "sharp";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const main = async () => {
  assert.equal(GENERIC_ACCOUNT_LOGO_OPTIONS.length, 6, "The picker must keep the complete generic account-logo set.");
  assert.ok(INSTITUTION_ACCOUNT_LOGO_OPTIONS.length >= 70, "The picker must expose the full bundled institution-logo library.");
  assert.equal(new Set(ACCOUNT_LOGO_OPTIONS.map((option) => option.id)).size, ACCOUNT_LOGO_OPTIONS.length);
  for (const option of ACCOUNT_LOGO_OPTIONS) {
    assert.ok(fs.existsSync(path.join(process.cwd(), "public", option.src.split("?")[0])), `Missing bundled logo: ${option.src}`);
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

  let originalBytes = 0, optimizedBytes = 0;
  for (const logo of ADDITIONAL_BANK_LOGOS) {
    const source = fs.readFileSync(path.join(process.cwd(), "../assets/banks", logo.file));
    const output = fs.readFileSync(path.join(process.cwd(), "public", logo.src.split("?")[0]));
    originalBytes += source.length; optimizedBytes += output.length;
    assert.ok(logo.src.includes(createHash("sha256").update(source).digest("hex").slice(0, 10)), "changed images need fresh cache identities");
    const metadata = await sharp(output).metadata();
    assert.equal(metadata.format, "webp");
    assert.ok(metadata.width! <= 128 && metadata.height! <= 128);
    assert.equal(findAdditionalBankLogo(`${logo.label} ${logo.region}`)?.src, logo.src, `regional lookup: ${logo.label} ${logo.region}`);
  }
  for (const [name, region] of [["BCA", "indonesia"], ["Rabobank", "netherlands"], ["Airwallex", "singapore"], ["Amex", "uk"], ["Metro Bank", "uk"], ["Alipay", "china"], ["Atome", "philippines"], ["HSBC Hong Kong", "hong kong"]]) {
    const expected = findAdditionalBankLogo(`${name} ${region}`)!;
    assert.ok(expected);
    assert.equal(getAccountBrand({ institution: `${name} ${region}`, type: "bank" }).logoSrc, expected.src);
    assert.ok(getInstitutionSuggestionGroups(name.replace(" Hong Kong", ""), "account").flatMap((group) => group.items).length > 0, `search suggestion: ${name}`);
  }
  assert.equal(getAccountBrand({ institution: "Metrobank", type: "bank" }).label, "Metrobank", "UK Metro Bank must not replace Philippine Metrobank");
  assert.equal(getAccountBrand({ institution: "CIMB", type: "bank" }).label, "CIMB");
  assert.equal(findAdditionalBankLogo("Unknown institution"), null);
  assert.equal(getAccountBrand({ institution: "Monzo", logoUrl: tinyPng }).logoSrc, tinyPng, "custom logos always win");
  const olderLogoUrl = ADDITIONAL_BANK_LOGOS[0].src.replace(/v=.*/, "v=oldversion");
  assert.equal(isValidAccountLogoUrl(olderLogoUrl), true);
  assert.equal(getAccountBrand({ logoUrl: olderLogoUrl }).logoSrc, ADDITIONAL_BANK_LOGOS[0].src, "saved built-in choices must adopt the current cache version");
  console.log(`Additional logos: ${ADDITIONAL_BANK_LOGOS.length}; source bytes: ${originalBytes}; optimized bytes: ${optimizedBytes}`);

  const card = read("components/financial-account-card.tsx");
  const picker = read("components/account-logo-picker.tsx");
  const accountRoute = read("app/api/accounts/[accountId]/route.ts");
  const accountsPage = read("app/accounts/page.tsx");
  const detailPage = read("app/accounts/[accountId]/page.tsx");
  const migration = read("prisma/migrations/20260829153000_account_logo_override/migration.sql");
  assert.match(card, /<AccountLogoPicker/);
  assert.match(picker, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(picker, /createPortal/);
  assert.doesNotMatch(picker, /financial-account-card__logo-edit/);
  assert.match(accountRoute, /isValidAccountLogoUrl/);
  assert.match(accountRoute, /columns\.has\("logoUrl"\)/);
  assert.match(accountsPage, /onLogoCommit=/);
  assert.match(detailPage, /onLogoCommit=\{saveAccountLogo\}/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "logoUrl" TEXT/);

  console.log(`Account logo regression passed with ${ACCOUNT_LOGO_OPTIONS.length} bundled choices.`);
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
