import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const institutionPage = read("app/accounts/institutions/[institutionSlug]/page.tsx");
const institutionRoute = read("app/api/accounts/institution/route.ts");
const importParser = read("lib/import-parser.ts");

assert(
  institutionPage.includes('fetch("/api/accounts/institution"') && institutionPage.includes("accountIds: accounts.map"),
  "institution deletion should use the atomic bulk endpoint"
);
assert(
  !/accounts\.map\(\(account\) =>[\s\S]{0,240}fetch\(`\/api\/accounts\/\$\{account\.id\}`[\s\S]{0,120}method:\s*"DELETE"/.test(
    institutionPage
  ),
  "institution deletion should not race individual account requests"
);
assert(
  institutionRoute.includes("assertTrustedRequestOrigin(request)") && institutionRoute.includes("assertWorkspaceAccess"),
  "institution deletion must validate origin and workspace access"
);
assert(
  institutionRoute.includes("prisma.$transaction") && institutionRoute.includes("deleteAccountsAndImportArtifacts"),
  "institution deletion must remove linked artifacts atomically"
);
assert(/\|GSAVE\|/.test(importParser), "GSave should normalize to its Philippine peso reporting currency");

console.info("Institution deletion regression checks passed.");
