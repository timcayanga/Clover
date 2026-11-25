import { useMemo, useReducer } from "react";
import { useSession } from "./session";

export function useBillDeletion() {
  const session = useSession();
  const state = useMemo(() => ({ hidden: new Set<string>(), error: "" }), [session.profileId]);
  const [, render] = useReducer(n => n + 1, 0);
  async function remove(id: string, onSuccess: () => void) {
    if (session.demo || state.hidden.has(id)) return;
    state.hidden.add(id);
    state.error = "";
    render();
    try {
      await session.request(`split-bills/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(session.profileId)}`, {method:"DELETE"});
    } catch (cause) {
      state.hidden.delete(id);
      state.error = cause instanceof Error ? cause.message : "Could not delete this bill. Please retry.";
      render();
      return;
    }
    onSuccess();
  }
  return { hidden: state.hidden, error: state.error, remove };
}
