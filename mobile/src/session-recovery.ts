/** Recover only sessions verified by Clerk for this device, never callback IDs. */
type Session = { id: string; status: string; currentTask?: unknown };
type Client = {
  sessions: Session[];
  lastActiveSessionId: string | null;
  signIn?: { status: string | null; createdSessionId: string | null };
  signUp?: { status: string | null; createdSessionId: string | null };
  isNew?: () => boolean;
  reload: () => Promise<unknown>;
};
export type RecoveryClerk = {
  client: Client | undefined;
  session?: Session | null;
  setActive: (params: { session: string }) => Promise<unknown>;
};
export function recoverableSession(client: Client): string | null {
  const active = client.sessions.filter(session => session.status === 'active' && !session.currentTask);
  const preferred = client.sessions.find(session => session.id === client.lastActiveSessionId);
  if (preferred?.status === 'active' && !preferred.currentTask) return preferred.id;
  if (client.sessions.some(session => session.status === 'pending' || session.currentTask)) return null;
  const completedIds = new Set([client.signIn, client.signUp]
    .filter(attempt => attempt?.status === 'complete' && attempt.createdSessionId)
    .map(attempt => attempt!.createdSessionId));
  const completed = active.filter(session => completedIds.has(session.id));
  // A completed, server-verified attempt can replace an ended previous session.
  // Never guess among identities or bypass pending verification/tasks.
  if (completed.length === 1) return completed[0].id;
  if (client.lastActiveSessionId || completed.length > 1) return null;
  return active.length === 1 ? active[0].id : null;
}
export function alreadySignedIn(error: unknown): boolean {
  const problem = error as { message?: string; errors?: { code?: string; message?: string; longMessage?: string }[] } | null;
  return Boolean(problem?.errors?.some(item => ['session_exists', 'already_signed_in', 'session_already_exists'].includes(item.code ?? '') || /already (?:signed|logged) in/i.test(item.longMessage ?? item.message ?? '')) || /already (?:signed|logged) in/i.test(problem?.message ?? ''));
}
export function createSessionRecovery(getClerk: () => RecoveryClerk, timeoutMs = 8000) {
  let generation = 0;
  let pending: Promise<boolean> | null = null;
  return {
    cancel() { generation++; pending = null; },
    recover(): Promise<boolean> {
      if (pending) return pending;
      const run = ++generation;
      let timer: ReturnType<typeof setTimeout>;
      const attempt = (async () => {
        const clerk = getClerk();
        const client = clerk.client;
        if (!client || client.isNew?.()) return false;
        await client.reload();
        if (run !== generation) return false;
        const fresh = getClerk();
        const id = fresh.client && recoverableSession(fresh.client);
        if (!id) return false;
        await fresh.setActive({ session: id });
        return run === generation;
      })();
      const timeout = new Promise<boolean>(resolve => {
        timer = setTimeout(() => { if (run === generation) generation++; resolve(false); }, timeoutMs);
      });
      const task = Promise.race([attempt, timeout]).catch(() => false).finally(() => {
        clearTimeout(timer);
        if (pending === task) pending = null;
      });
      pending = task;
      return task;
    },
  };
}
