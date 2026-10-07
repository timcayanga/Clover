const Module = require('node:module');
const original = Module._load;
const state = { active: true, user: true, admin: false, workspaceChecks: 0, userReads: 0, fetches: 0 };
globalThis.__nativeFxFixture = state;
Module._load = function(id, parent) {
  const route = parent?.filename.includes('/api/mobile/v1/') && parent.filename.endsWith('/route.ts');
  if (route && id === '@clerk/nextjs/server') return { verifyToken: async token => { if(token !== 'test-token') throw Error('Bad token'); return { sub:'test-user', sid:'test-session', sts:state.active?'active':'pending' }; } };
  if (route && id === '@/lib/prisma') return { prisma: { user: { findUnique: async ({where}) => { if(where.clerkUserId !== 'test-user') throw Error('Wrong identity'); state.userReads++; return state.user ? { id:'test-db-user' } : null; } } } };
  if (route && id === '@/lib/user-environment') return { getCurrentUserEnvironment: () => 'staging' };
  if (route && id === '@/lib/admin-access') return { isAdminOnlyUserId: () => state.admin, isConfiguredAdminEmail: async () => false, isAssignedAdmin: async () => false };
  if (route && id === '@/lib/workspace-access') return { assertWorkspaceAccess: async () => { state.workspaceChecks++; throw Error('WORKSPACE_NOT_FOUND'); } };
  if (route && id === '@/lib/plan-quota') return { PlanQuotaError: class extends Error {} };
  if (route && id === '@/lib/native-input-error') return { NativeInputError: class extends Error {} };
  // Unrelated operation handlers are not exercised; no real DB/provider can be reached.
  if (route && id.startsWith('@/lib/') && id !== '@/lib/mobile-api-policy') return {};
  if (route && id === 'next/cache') return { revalidateTag: () => { throw Error('FX must not mutate data'); } };
  return original.apply(this, arguments);
};
