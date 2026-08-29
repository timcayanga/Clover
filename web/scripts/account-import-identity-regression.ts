import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { matchesDurableImportedAccountIdentity } from "@/lib/workspace-cache";

const customizedGoTyme = {
  id: "account-gotyme",
  name: "Japan Travel Fund",
  institution: "GoTyme",
  accountNumber: "1008",
  type: "bank",
  currency: "PHP",
  source: "upload",
  importIdentityName: "GoTyme 1008",
  importIdentityInstitution: "GoTyme",
  importIdentityAccountNumber: "1008",
};

const main = () => {
  assert.equal(
    matchesDurableImportedAccountIdentity(customizedGoTyme, {
      name: "GoTyme 1008",
      institution: "GoTyme",
      accountNumber: "1008",
      type: "bank",
      currency: "PHP",
      source: "upload",
    }),
    true,
    "A statement must still match after the user replaces the display name."
  );
  assert.equal(
    matchesDurableImportedAccountIdentity(
      { ...customizedGoTyme, name: "Anything", institution: "Personal vault" },
      { name: "GoTyme 1008", institution: "GoTyme", accountNumber: "1008", type: "bank", currency: "PHP" }
    ),
    true,
    "Durable source identity must outrank a customized display identity."
  );
  assert.equal(
    matchesDurableImportedAccountIdentity(customizedGoTyme, {
      name: "GoTyme 9999",
      institution: "GoTyme",
      accountNumber: "9999",
      type: "bank",
      currency: "PHP",
    }),
    false,
    "A different account number must not be routed to the customized account."
  );

  const accountRoute = fs.readFileSync(path.join(process.cwd(), "app/api/accounts/[accountId]/route.ts"), "utf8");
  const accountsRoute = fs.readFileSync(path.join(process.cwd(), "app/api/accounts/route.ts"), "utf8");
  const worker = fs.readFileSync(path.join(process.cwd(), "workers/import-processor.ts"), "utf8");
  const migration = fs.readFileSync(
    path.join(process.cwd(), "prisma/migrations/20260829170000_account_import_identity/migration.sql"),
    "utf8"
  );
  assert.match(accountRoute, /userChangedName[\s\S]{0,120}nameCustomized: true/);
  assert.match(accountRoute, /logoCustomized: payload\.logoUrl !== null/);
  assert.match(accountRoute, /account\.nameCustomized[\s\S]{0,80}\? account\.name/);
  assert.match(accountsRoute, /account\.nameCustomized[\s\S]{0,80}\? account\.name/);
  assert.match(worker, /matchesDurableImportedAccountIdentity\(account, incomingImportIdentity\)/);
  assert.match(worker, /!account\.nameCustomized[\s\S]{0,100}data\.name/);
  assert.match(worker, /normalizeAccountRuleKey\(incomingImportIdentity\.name, incomingImportIdentity\.institution\)/);
  assert.match(migration, /"importIdentityName" TEXT/);
  assert.match(migration, /"logoCustomized" BOOLEAN NOT NULL DEFAULT FALSE/);

  console.log("Durable customized-account import identity regression passed.");
};

main();
