import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const scopeSource = readSource("lib/admin-data-scope.ts");
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
assert.match(
  analyticsSource,
  /Users who reviewed a transaction/,
);
assert.doesNotMatch(
  analyticsSource,
  /\{ label: "Items awaiting review", count: reviewQueueItems \}/,
);

const usersSource = readSource("lib/admin-users.ts");
assert.match(usersSource, /const realUserWhere = getAdminRealUserWhere\(\)/);
assert.match(usersSource, /adminRealUserSqlPredicate/);
assert.match(usersSource, /getCurrentDeploymentErrorWhere/);
assert.match(
  usersSource,
  /const where: Prisma\.UserWhereInput = \{\s*\.\.\.PRODUCTION_USER_WHERE,/,
);

const inquiriesSource = readSource("lib/contact-inquiries.ts");
assert.match(inquiriesSource, /items: items\.map\(toAdminContactInquiry\)/);
assert.match(inquiriesSource, /getAdminContactInquiryAttachment/);

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
