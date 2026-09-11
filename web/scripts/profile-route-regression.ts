import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Run the real route against isolated in-memory dependencies, without sessions,
// network access, or a database. Exercises both local and authenticated ownership.
const source = readFileSync(new URL("../app/api/workspaces/route.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function check(local: boolean) {
  const owner = local ? "local-admin" : "signed-in-user";
  const profiles: Array<Record<string, unknown>> = [];
  const user = { id: owner, clerkUserId: owner, email: "qa@example.invalid", verified: true, environment: "staging", planTier: "pro" };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { clerkUserId: string } }) => ({ ...user, id: where.clerkUserId, workspaces: profiles.filter(row => row.userId === where.clerkUserId) }),
      update: async () => user,
    },
    workspace: {
      findMany: async ({ where }: { where: { userId: string } }) => profiles.filter(row => row.userId === where.userId),
      count: async () => profiles.length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `profile-${profiles.length}`, createdAt: new Date(), updatedAt: new Date() };
        profiles.push(row); return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => profiles.find(row => row.id === where.id),
    },
  };
  const deps: Record<string, unknown> = {
    "@/lib/prisma": { prisma },
    "@/lib/auth": { isLocalDevHost: async () => local, requireAuth: async () => ({ userId: local ? "staging-guest" : owner }) },
    "@/lib/clerk": { syncClerkUser: async (id: string) => ({ ...user, clerkUserId: id }) },
    "@/lib/user-context": { getOrCreateCurrentUser: async (id: string) => ({ ...user, id }) },
    "@/lib/starter-data": {
      ensureStarterWorkspace: async () => profiles[0] ?? prisma.workspace.create({ data: { userId: owner, name: "Personal", type: "personal" } }),
      repairDuplicateStarterWorkspaces: async () => {}, seedWorkspaceDefaults: async () => {},
    },
    "@/lib/user-environment": { getCurrentUserEnvironment: () => "staging", resolvePersistedUserEnvironment: () => "staging" },
    "@/lib/user-limits": { getEffectiveProfileLimit: () => 10 },
    "@/lib/analytics": { capturePostHogServerEvent: async () => {} },
    "@/lib/request-security": { assertTrustedRequestOrigin: () => {} },
    "@/lib/transient-data": { isTransientDataError: () => false, isUnauthorizedDataError: () => false },
    "next/server": { NextResponse: { json: (value: unknown) => value }, after: () => {} },
  };
  const route: Record<string, (request?: unknown) => Promise<any>> = {};
  new Function("require", "exports", code)((name: string) => {
    assert.ok(name in deps, `Unexpected route dependency ${name}`); return deps[name];
  }, route);
  await route.GET();
  const created = await route.POST({ json: async () => ({ name: "QA Profile", type: "personal" }) });
  assert.equal(created.workspace.userId, owner);
  const refreshed = await route.GET();
  assert.deepEqual(refreshed.workspaces.map((row: { name: string }) => row.name), ["Personal", "QA Profile"]);
}
async function main() { await check(true); await check(false); console.log("Profile create/reload ownership regression passed (local and authenticated)"); }
void main();
