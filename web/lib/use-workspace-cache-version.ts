"use client";

import { useCallback, useRef, useState } from "react";

// A consumed cache version must render in the same React lane as its data.
// Updating only a ref lets a synchronous render publish old rows under the
// version of a still-pending transition. Own writes do not need another render.
export function useWorkspaceCacheVersion(workspaceId: string) {
  const [consumed, setConsumed] = useState({workspaceId: "", updatedAt: 0});
  const published = useRef(new Map<string, number>());
  const consume = useCallback((id: string, updatedAt: number) => {
    setConsumed(current => current.workspaceId === id && current.updatedAt === updatedAt
      ? current : {workspaceId: id, updatedAt});
  }, []);
  const publish = useCallback((id: string, updatedAt: number) => {
    published.current.set(id, updatedAt);
  }, []);
  return {
    expectedVersion: Math.max(consumed.workspaceId === workspaceId ? consumed.updatedAt : 0, published.current.get(workspaceId) ?? 0),
    consume,
    publish,
  };
}
