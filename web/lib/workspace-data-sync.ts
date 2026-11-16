"use client";

import { clearAllWorkspaceCaches, clearWorkspaceCache } from "@/lib/workspace-cache";
import { readSelectedWorkspaceId } from "@/lib/workspace-selection";

export const workspaceDataChangedEventName = "clover:workspace-data-changed";
export const workspaceDataRevisionKey = "clover.workspace-data-revision.v1";

export type WorkspaceDataDomain =
  | "accounts"
  | "transactions"
  | "recurring"
  | "circles"
  | "split-bills"
  | "budgeting"
  | "goals"
  | "investments"
  | "adviser"
  | "home"
  | "reports";

export type WorkspaceDataChange = {
  workspaceId: string | null;
  source: WorkspaceDataDomain;
  affected: WorkspaceDataDomain[];
  path: string;
  revision: number;
};

const domainDependencies: Record<WorkspaceDataDomain, WorkspaceDataDomain[]> = {
  accounts: ["accounts", "transactions", "recurring", "circles", "budgeting", "goals", "investments", "adviser", "home", "reports"],
  transactions: ["accounts", "transactions", "recurring", "circles", "split-bills", "budgeting", "goals", "investments", "adviser", "home", "reports"],
  recurring: ["recurring", "budgeting", "goals", "adviser", "home", "reports"],
  circles: ["circles", "split-bills", "adviser", "home"],
  "split-bills": ["split-bills", "circles", "adviser", "home", "reports"],
  budgeting: ["budgeting", "goals", "adviser", "home", "reports"],
  goals: ["goals", "adviser", "home"],
  investments: ["accounts", "investments", "circles", "goals", "adviser", "home", "reports"],
  adviser: ["adviser"],
  home: ["home"],
  reports: ["reports"],
};

const mutationRoutes: Array<{ pattern: RegExp; domain: WorkspaceDataDomain }> = [
  { pattern: /^\/api\/transactions(?:\/|$)/, domain: "transactions" },
  { pattern: /^\/api\/accounts(?:\/|$)/, domain: "accounts" },
  { pattern: /^\/api\/investment-(?:holdings|snapshots|purchases|dividends)(?:\/|$)/, domain: "investments" },
  { pattern: /^\/api\/commitments(?:\/|$)/, domain: "recurring" },
  { pattern: /^\/api\/recurring(?:\/|$)/, domain: "recurring" },
  { pattern: /^\/api\/budgets(?:\/|$)/, domain: "budgeting" },
  { pattern: /^\/api\/(?:goals|goal-settings)(?:\/|$)/, domain: "goals" },
  { pattern: /^\/api\/circles(?:\/|$)/, domain: "circles" },
  { pattern: /^\/api\/circle-invitations(?:\/|$)/, domain: "circles" },
  { pattern: /^\/api\/split-bills?(?:\/|$)/, domain: "split-bills" },
  { pattern: /^\/api\/split-bill-(?:groups|people|payment-profiles)(?:\/|$)/, domain: "split-bills" },
];

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const parseRequestUrl = (input: RequestInfo | URL) => {
  try {
    const value = input instanceof Request ? input.url : String(input);
    return new URL(value, window.location.origin);
  } catch {
    return null;
  }
};

const readWorkspaceIdFromBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== "string" || !body.trim().startsWith("{")) return null;
  try {
    const value = JSON.parse(body) as Record<string, unknown>;
    return typeof value.workspaceId === "string" && value.workspaceId.trim() ? value.workspaceId.trim() : null;
  } catch {
    return null;
  }
};

export const classifyWorkspaceMutation = (pathname: string, method: string): WorkspaceDataDomain | null => {
  if (!mutationMethods.has(method.toUpperCase())) return null;
  return mutationRoutes.find((route) => route.pattern.test(pathname))?.domain ?? null;
};

export const getAffectedWorkspaceDataDomains = (source: WorkspaceDataDomain) => [...domainDependencies[source]];

export const publishWorkspaceDataChange = (change: WorkspaceDataChange) => {
  if (change.workspaceId) clearWorkspaceCache(change.workspaceId);
  else clearAllWorkspaceCaches();

  window.dispatchEvent(new CustomEvent<WorkspaceDataChange>(workspaceDataChangedEventName, { detail: change }));
  try {
    window.localStorage.setItem(workspaceDataRevisionKey, JSON.stringify(change));
  } catch {
    // The in-tab event still keeps the active session consistent.
  }
};

let observerReferences = 0;
let originalFetch: typeof window.fetch | null = null;
let observedFetch: typeof window.fetch | null = null;

export const installWorkspaceMutationObserver = () => {
  if (typeof window === "undefined") return () => undefined;
  observerReferences += 1;

  if (!observedFetch) {
    originalFetch = window.fetch.bind(window);
    observedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await originalFetch!(input, init);
      const request = input instanceof Request ? input : null;
      const method = String(init?.method ?? request?.method ?? "GET").toUpperCase();
      const url = parseRequestUrl(input);
      const source = url ? classifyWorkspaceMutation(url.pathname, method) : null;

      if (response.ok && source && url?.origin === window.location.origin) {
        const workspaceId =
          url.searchParams.get("workspaceId")?.trim() ||
          readWorkspaceIdFromBody(init?.body) ||
          readSelectedWorkspaceId() ||
          null;
        publishWorkspaceDataChange({
          workspaceId,
          source,
          affected: getAffectedWorkspaceDataDomains(source),
          path: url.pathname,
          revision: Date.now(),
        });
      }

      return response;
    };
    window.fetch = observedFetch;
  }

  return () => {
    observerReferences = Math.max(0, observerReferences - 1);
    if (observerReferences === 0 && observedFetch && window.fetch === observedFetch && originalFetch) {
      window.fetch = originalFetch;
      observedFetch = null;
      originalFetch = null;
    }
  };
};

export const subscribeWorkspaceDataChanges = (listener: (change: WorkspaceDataChange) => void) => {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<WorkspaceDataChange>).detail;
    if (detail?.source && Array.isArray(detail.affected)) listener(detail);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== workspaceDataRevisionKey || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue) as WorkspaceDataChange;
      if (!detail?.source || !Array.isArray(detail.affected)) return;
      if (detail.workspaceId) clearWorkspaceCache(detail.workspaceId);
      else clearAllWorkspaceCaches();
      listener(detail);
    } catch {
      // Ignore malformed or legacy revision values.
    }
  };

  window.addEventListener(workspaceDataChangedEventName, handleChange as EventListener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(workspaceDataChangedEventName, handleChange as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
};

export const getWorkspaceDataDomainForPath = (pathname: string): WorkspaceDataDomain | null => {
  if (pathname === "/" || pathname.startsWith("/home") || pathname.startsWith("/dashboard")) return "home";
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/transactions")) return "transactions";
  if (pathname.startsWith("/recurring")) return "recurring";
  if (pathname.startsWith("/circles")) return "circles";
  if (pathname.startsWith("/split-bill")) return "split-bills";
  if (pathname.startsWith("/budgeting")) return "budgeting";
  if (pathname.startsWith("/goals")) return "goals";
  if (pathname.startsWith("/investments")) return "investments";
  if (pathname.startsWith("/adviser")) return "adviser";
  if (pathname.startsWith("/reports")) return "reports";
  return null;
};
