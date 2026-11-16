const Module = require('module');
const original = Module._load;
globalThis.__deletion = { events: [], status: 200, subscriptions: {}, scopeFails: false };
const g = () => globalThis.__deletion;
const prisma = {
  user: { findUnique: async () => ({ id: 'local_test', environment: 'production', storeAccess: { store: 'play_store' } }) },
  $queryRaw: async () => [{ environment: 'production' }],
  $executeRaw: async () => 1,
  $transaction: async fn => fn(prisma),
  clerkIdentityDeletion: {
    findUnique: async () => g().priorDeletion || null,
    upsert: async () => { g().events.push('tombstone'); },
    update: async () => { g().events.push('completed'); },
  },
  finverseConnection: { findMany: async () => g().banks ? [{id:"fixture-bank"}] : [] },
  adminMember: { updateMany: async () => {} },
};
Module._load = function(id) {
  if (id === '@/lib/prisma' || id === './prisma') return { prisma };
  if (id === '@/lib/admin') return { getAdminDataEnvironment: () => 'production' };
  if (id === './store-access') return { verifyRecoveredStoreAlias: async () => undefined, storeBillingConfig: () => ({ sandbox: false, sandboxAppUserIds: [] }) };
  if (id === './finverse-lifecycle') return { requestBankDisconnect: async () => { g().events.push("bank-request"); }, revokeBankConnection: async () => { g().events.push("bank-revoke"); return !g().bankFails; } };
  if (id === '@/lib/account-management') return {
    assertUserErasureScope: async () => { if(g().scopeFails) throw Error('shared Circle'); },
    cancelWebBillingForDeletion: async () => { g().events.push('web-cancel'); },
    deleteLocalUserAccount: async () => { g().events.push('erase-data'); },
  };
  if (id === 'next/cache') return { revalidateTag: () => {} };
  if (id === '@clerk/nextjs/server') return { clerkClient: async () => ({ users: {
    deleteUser: async () => { g().events.push('erase-login'); },
    getUser: async () => { throw Object.assign(Error('missing'), { status: 404 }); },
  } }) };
  return original.apply(this, arguments);
};
process.env.CLERK_SECRET_KEY = 'sk_live_test_only';
process.env.REVENUECAT_SECRET_API_KEY = 'test_only';
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.revenuecat.com/v1/subscribers/user_deletion_fixture')) throw Error('Unexpected network request blocked');
  if (init?.method === 'POST') {
    g().events.push('google-cancel');
    return new Response('{}', { status: g().status });
  }
  if(g().getStatus) return new Response('{}', { status: g().getStatus });
  return Response.json({ request_date_ms: Date.now(), subscriber: { original_app_user_id: 'user_deletion_fixture', subscriptions: g().subscriptions } });
};
