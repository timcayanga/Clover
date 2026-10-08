import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ACCOUNT_LOGO_OPTIONS,
  GENERIC_ACCOUNT_LOGO_OPTIONS,
  INSTITUTION_ACCOUNT_LOGO_OPTIONS,
  isValidAccountLogoUrl,
} from "@/lib/account-logo";
import { getAccountBrand, getAccountWalletBrand } from "@/lib/account-brand";
import { genericAccountColors, institutionAccountPalettes } from "../../shared/account-wallet";
import { accountCardPalette } from "../../shared/visual-identity";
import { mobileApiResponse } from "@/lib/mobile-api-response";
import bundledLogoColors from "../lib/account-logo-colors.json";
import { ADDITIONAL_BANK_LOGOS, findAdditionalBankLogo } from "@/lib/bank-logo-catalog";
import { getInstitutionSuggestionGroups } from "@/lib/institution-suggestions";
import { suggestAccountInstitution, suggestedDraftInstitution } from "../../shared/account-institution";
import { mobileAccountOption } from "@/lib/mobile-account-option";
import { createHash } from "node:crypto";
import sharp from "sharp";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const main = async () => {
  for (const name of ["BPI", "BPI Personal 1234", "my BPI savings", "Bank of the Philippine Islands 1234"]) {
    const hint = suggestAccountInstitution(name);
    assert.equal(hint?.institution, "BPI", `Account nickname should identify BPI: ${name}`);
    assert.ok(hint!.confidence >= 95);
  }
  assert.equal(suggestAccountInstitution("BPI Trade Personal", "bank")?.institution, "BPI Trade", "Specific provider wins over parent-bank substring.");
  assert.equal(suggestAccountInstitution("BPI and BDO savings"), null, "Conflicting providers require a user choice.");
  assert.equal(suggestAccountInstitution("Happiness fund"), null);
  assert.equal(suggestAccountInstitution("BPI", "investment"), null, "Stock issuer must not become broker.");
  assert.equal(suggestAccountInstitution("BPI", "cash"), null);
  const draft = { name: "BDO Personal", type: "bank", currentInstitution: "BPI", previousSuggestion: "BPI", editedByUser: false, existingAccount: false };
  assert.equal(suggestedDraftInstitution(draft), "BDO", "Changing nickname updates an automatic suggestion.");
  assert.equal(suggestedDraftInstitution({ ...draft, name: "Holiday fund" }), "", "Unrecognized renamed drafts clear stale suggestions.");
  assert.equal(suggestedDraftInstitution({ ...draft, editedByUser: true }), "BPI", "Explicit institution choice survives nickname edits.");
  assert.equal(suggestedDraftInstitution({ ...draft, currentInstitution: "", editedByUser: true }), "", "Clearing an institution is also a deliberate choice.");
  assert.equal(suggestedDraftInstitution({ ...draft, existingAccount: true }), "BPI", "Existing accounts never change implicitly.");
  assert.equal(suggestedDraftInstitution({ ...draft, currentInstitution: "Custom provider" }), "Custom provider");
  const pickerAccount = { id: "bpi", name: "BPI Personal 1234", institution: "BPI", currency: "PHP", type: "bank", _count: { transactions: 3 }, accountNumber: "private" };
  const pickerOption = mobileAccountOption(pickerAccount);
  assert.equal(pickerOption.brandLogoUrl, getAccountBrand(pickerAccount).logoSrc);
  assert.ok(pickerOption.brandLogoUrl?.includes("bpi"));
  assert.equal(pickerOption.transactionCount, 3);
  assert.ok(!JSON.stringify(pickerOption).includes("private"), "Picker projection cannot expose full account numbers.");
  assert.equal(mobileAccountOption({ ...pickerAccount, logoUrl: "/assets/banks/philippines/gotyme.png" }).brandLogoUrl, "/assets/banks/philippines/gotyme.png", "Picker retains a saved logo override.");
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

  // The wallet finish must retain every selected logo, and its color must not
  // depend on an old institution value after the user changes that logo.
  for (const option of ACCOUNT_LOGO_OPTIONS) {
    const input = Object.freeze({ institution: "BPI", name: "Saved account", type: "bank", logoUrl: option.src });
    const selected = getAccountWalletBrand(input);
    const independent = getAccountWalletBrand({ type: "bank", logoUrl: option.src });
    assert.equal(selected.logoSrc, getAccountBrand(input).logoSrc, `Wallet must retain ${option.src}`);
    assert.deepEqual(selected.logoSrcs, [selected.logoSrc]);
    assert.equal(selected.background, independent.background, `Saved institution cannot override chosen logo colors: ${option.src}`);
    assert.equal(selected.accent, independent.accent, `Logo borders and accents must follow the selected logo: ${option.src}`);
    assert.equal(selected.foreground, independent.foreground, `Selected logo must use matching text contrast: ${option.src}`);
    if (option.kind === "institution") assert.ok((bundledLogoColors as Record<string,string>)[decodeURIComponent(option.src.split("?")[0])], `Missing bundled logo color: ${option.src}`);
    const colors = selected.background.match(/#[0-9a-f]{6}/gi)! as [string, string, ...string[]];
    const brandPalette = { colors, foreground: selected.foreground };
    const row = { id: option.id, type: "bank", institution: "BPI", brandLogoUrl: selected.logoSrc, brandPalette };
    const native = mobileApiResponse("accounts", { accounts: [row] }).accounts[0];
    assert.equal(native.brandLogoUrl, selected.logoSrc, "Native API retains the selected logo");
    assert.deepEqual(accountCardPalette(native), brandPalette, "Native renders the same resolved colors as web");
  }
  for (const [institution, palette] of Object.entries(institutionAccountPalettes)) {
    const brand = getAccountWalletBrand({ institution, type: "bank" });
    assert.deepEqual(brand.background.match(/#[0-9a-f]{6}/gi), palette.colors, `Approved ${institution} color retained`);
  }
  for (const [type, colors] of Object.entries(genericAccountColors)) {
    assert.deepEqual(getAccountWalletBrand({ type }).background.match(/#[0-9a-f]{6}/gi), colors, `${type} keeps its generic icon color`);
  }
  assert.equal(getAccountWalletBrand({ institution: "BPI", type: "bank", logoUrl: "/assets/banks/philippines/gotyme.png" }).background,
    getAccountWalletBrand({ institution: "GoTyme", type: "bank" }).background, "Selected GoTyme logo must have GoTyme colors, not BPI red");
  assert.equal(getAccountWalletBrand({ institution: "BPI", logoUrl: tinyPng }).logoSrc, tinyPng, "Custom image remains intact");

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
