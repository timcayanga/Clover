/** Secure storage failures must never destroy credentials or masquerade as sign-out. */
export type SecureTokenStorage = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
};
export function createPersistentTokenCache(storage: SecureTokenStorage) {
  const preference = 'clover-remember-session';
  const transient = new Map<string, string>();
  const seen = new Set<string>();
  let remember: boolean | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work); queue = next.catch(() => {}); return next;
  };
  const remembered = async () => {
    if (remember === undefined) remember = (await storage.get(preference)) !== 'false';
    return remember;
  };
  return {
    setRememberSession: (value: boolean) => serialize(async () => {
      await storage.set(preference, String(value));
      remember = value;
      for (const key of seen) {
        if (value && transient.has(key)) await storage.set(key, transient.get(key)!);
        else if (!value) await storage.remove(key);
      }
    }),
    cache: {
      getToken: (key: string) => serialize(async () => {
        seen.add(key);
        if (!(await remembered())) return transient.get(key) ?? null;
        // Deliberately let a locked/unavailable keychain read fail. Returning null
        // would tell Clerk that no credential exists; deleting it loses login.
        return await storage.get(key);
      }),
      saveToken: (key: string, token: string) => serialize(async () => {
        seen.add(key);
        transient.set(key, token);
        if (await remembered()) await storage.set(key, token);
        else await storage.remove(key);
      }),
      clearToken: (key: string) => serialize(async () => {
        transient.delete(key);
        await storage.remove(key);
      }),
    },
  };
}
