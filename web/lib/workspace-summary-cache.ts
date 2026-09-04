import { revalidateTag, unstable_cache } from "next/cache";

export type WorkspaceSummaryArea = "budgeting" | "circles" | "goals" | "recurring" | "reports";

const CACHE_VERSION = "v1";
const DEFAULT_REVALIDATE_SECONDS = 15;

export const workspaceSummaryCacheTag = (workspaceId: string) => `clover:workspace-summary:${workspaceId}`;
export const workspaceSummaryAreaCacheTag = (workspaceId: string, area: WorkspaceSummaryArea) =>
  `${workspaceSummaryCacheTag(workspaceId)}:${area}`;
export const userSummaryCacheTag = (userId: string, area: WorkspaceSummaryArea) =>
  `clover:user-summary:${userId}:${area}`;

export async function loadCachedWorkspaceSummary<T>(params: {
  workspaceId: string;
  area: WorkspaceSummaryArea;
  keyParts?: string[];
  revalidateSeconds?: number;
  load: () => Promise<T>;
}): Promise<T> {
  const cached = unstable_cache(
    params.load,
    ["clover-workspace-summary", CACHE_VERSION, params.area, params.workspaceId, ...(params.keyParts ?? [])],
    {
      revalidate: params.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS,
      tags: [workspaceSummaryCacheTag(params.workspaceId), workspaceSummaryAreaCacheTag(params.workspaceId, params.area)],
    }
  );
  return cached();
}

export async function loadCachedUserSummary<T>(params: {
  userId: string;
  area: WorkspaceSummaryArea;
  keyParts?: string[];
  revalidateSeconds?: number;
  load: () => Promise<T>;
}): Promise<T> {
  const cached = unstable_cache(
    params.load,
    ["clover-user-summary", CACHE_VERSION, params.area, params.userId, ...(params.keyParts ?? [])],
    {
      revalidate: params.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS,
      tags: [userSummaryCacheTag(params.userId, params.area)],
    }
  );
  return cached();
}

export function invalidateWorkspaceSummaryCache(workspaceId: string) {
  if (workspaceId) revalidateTag(workspaceSummaryCacheTag(workspaceId));
}

export function invalidateWorkspaceSummaryAreaCache(workspaceId: string, area: WorkspaceSummaryArea) {
  if (workspaceId) revalidateTag(workspaceSummaryAreaCacheTag(workspaceId, area));
}

export function invalidateUserSummaryCache(userId: string, area: WorkspaceSummaryArea) {
  if (userId) revalidateTag(userSummaryCacheTag(userId, area));
}
