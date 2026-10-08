import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createSessionRecovery, type RecoveryClerk } from './session-recovery';

export function useSessionRecovery(clerk: RecoveryClerk, loaded: boolean, userId: string | null | undefined) {
  const latest = useRef({ clerk, userId }); latest.current = { clerk, userId };
  const [controller] = useState(() => createSessionRecovery(() => latest.current.clerk));
  const [recovering, setRecovering] = useState(true);
  const mounted = useRef(false);
  const blocked = useRef(false);
  const checkVersion = useRef(0);
  const recoverSession = useCallback(async () => {
    if (blocked.current) return false;
    if (latest.current.userId) return true;
    const version = ++checkVersion.current;
    setRecovering(true);
    try { return await controller.recover(); }
    finally { if (mounted.current && version === checkVersion.current) setRecovering(false); }
  }, [controller]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.cancel(); };
  }, [controller]);
  useEffect(() => {
    if (!loaded) return;
    if (latest.current.userId) setRecovering(false);
    else void recoverSession();
    let previous = AppState.currentState;
    const listener = AppState.addEventListener('change', state => {
      const resumed = state === 'active' && previous !== 'active';
      previous = state;
      if (resumed && !latest.current.userId) void recoverSession();
    });
    return () => listener.remove();
  }, [loaded, recoverSession]);
  useEffect(() => {
    if (userId) { controller.cancel(); setRecovering(false); }
  }, [userId, controller]);
  const duringSignOut = useCallback(async (signOut: () => Promise<void>) => {
    blocked.current = true; checkVersion.current++; controller.cancel(); setRecovering(false);
    try { await signOut(); }
    finally { blocked.current = false; }
  }, [controller]);
  return { recovering, recoverSession, duringSignOut };
}
