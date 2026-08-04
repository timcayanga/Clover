import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const scopeSource = readSource("lib/admin-data-scope.ts");
const adminSource = readSource("lib/admin.ts");
assert.match(adminSource, /getAdminDataEnvironment = \(\) => "production" as const/);
assert.doesNotMatch(adminSource, /VERCEL_ENV === "preview" \? "staging"/);
assert.match(scopeSource, /@placeholder\.local/);
assert.match(scopeSource, /@example\.com/);
assert.match(scopeSource, /local-admin/);
assert.match(scopeSource, /staging-guest/);
assert.match(scopeSource, /seed-demo-user/);
assert.match(scopeSource, /getCurrentDeploymentErrorWhere/);
assert.match(scopeSource, /deploymentId: build\.deploymentId/);

for (const file of [
  "lib/admin-command-center.ts",
  "lib/admin-analytics.ts",
  "lib/admin-operations.ts",
]) {
  const source = readSource(file);
  assert.match(source, /getAdminReal(?:User|Workspace)Where/);
}

const commandCenterSource = readSource("lib/admin-command-center.ts");
assert.match(commandCenterSource, /getCurrentDeploymentErrorWhere/);
assert.match(commandCenterSource, /Current deploy errors/);

const analyticsSource = readSource("lib/admin-analytics.ts");
assert.match(analyticsSource, /usersWithReviewedTransactions/);
assert.match(analyticsSource, /getAnalyticsBetaStartedAt/);
assert.match(analyticsSource, /betaParticipantUser/);
assert.match(analyticsSource, /betaTransaction/);
assert.match(analyticsSource, /betaImport/);
assert.match(analyticsSource, /getPostHogLiveAnalytics\(getAdminDataEnvironment\(\)\)/);
assert.match(analyticsSource, /environment: getAdminDataEnvironment\(\)/);
assert.match(
  analyticsSource,
  /Users who reviewed a transaction/,
);
assert.doesNotMatch(
  analyticsSource,
  /\{ label: "Items awaiting review", count: reviewQueueItems \}/,
);

const usersSource = readSource("lib/admin-users.ts");
assert.match(usersSource, /const ACTIVE_TRANSACTION_WHERE:[\s\S]*?deletedAt: null,[\s\S]*?\};/);
assert.match(usersSource, /const realUserWhere = getAdminRealUserWhere\(\)/);
assert.match(usersSource, /adminRealUserSqlPredicate/);
assert.match(usersSource, /getCurrentDeploymentErrorWhere/);
assert.match(
  usersSource,
  /const where: Prisma\.UserWhereInput = \{\s*\.\.\.getAdminRealUserWhere\(\),/,
);

const inquiriesSource = readSource("lib/contact-inquiries.ts");
assert.match(inquiriesSource, /items: items\.map\(toAdminContactInquiry\)/);
assert.match(inquiriesSource, /getAdminContactInquiryAttachment/);
assert.match(inquiriesSource, /environment: getDeploymentEnvironment\(\)/);
assert.match(inquiriesSource, /environment: getAdminDataEnvironment\(\)/);

const dataQaSource = readSource("lib/admin-data-qa.ts");
assert.match(dataQaSource, /workspace: getAdminRealWorkspaceWhere\(\)/);
assert.match(dataQaSource, /status: \{ not: "deleted" \}/);

const dataQaRunRouteSource = readSource("app/api/admin/data-qa/[runId]/route.ts");
assert.match(dataQaRunRouteSource, /getCurrentProductionRunWhere/);
assert.match(dataQaRunRouteSource, /workspace: \{ user: \{ environment: getAdminDataEnvironment\(\) \} \}/);

const dataQaFileRouteSource = readSource("app/api/admin/data-qa/file/[importFileId]/route.ts");
assert.match(dataQaFileRouteSource, /await requireAdminAuth\(\)/);
assert.match(dataQaFileRouteSource, /status: \{ not: "deleted" \}/);
assert.match(dataQaFileRouteSource, /environment: getAdminDataEnvironment\(\)/);
assert.doesNotMatch(dataQaFileRouteSource, /assertWorkspaceAccess/);

const sampleCorpusRouteSource = readSource("app/api/admin/data-qa/sample-corpus/route.ts");
assert.match(sampleCorpusRouteSource, /environment: getAdminDataEnvironment\(\)/);
assert.match(sampleCorpusRouteSource, /status: \{ not: "deleted" \}/);
assert.doesNotMatch(sampleCorpusRouteSource, /listAllImportFilesCompat/);

const supportSource = readSource("lib/admin-support.ts");
assert.match(supportSource, /transactions: \{\s*where: \{ deletedAt: null \}/);

const inquiriesComponentSource = readSource(
  "components/admin-inquiries-console.tsx",
);
assert.match(inquiriesComponentSource, /View attachment/);
assert.doesNotMatch(inquiriesComponentSource, /attachment\.dataUrl/);
assert.match(
  inquiriesComponentSource,
  /if \(!normalized\) \{\s*return items;/,
);

const attachmentRouteSource = readSource(
  "app/api/admin/inquiries\/[inquiryId]\/attachment/route.ts",
);
assert.match(attachmentRouteSource, /await requireAdminAuth\(\)/);
assert.match(attachmentRouteSource, /private, no-store/);
assert.match(attachmentRouteSource, /X-Content-Type-Options/);

const importMutationRouteSource = readSource(
  "app/api/imports\/[importId]\/route.ts",
);
assert.equal(
  importMutationRouteSource.match(/await assertWorkspaceAccess\(/g)?.length,
  2,
);
assert.match(
  importMutationRouteSource,
  /await assertWorkspaceAccess\(userId, String\(existingImport\.workspaceId\)\)/,
);
assert.match(
  importMutationRouteSource,
  /await assertWorkspaceAccess\(userId, String\(importFile\.workspaceId\)\)/,
);

console.log("Admin operational scope regression passed.");
