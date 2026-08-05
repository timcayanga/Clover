export const selectedWorkspaceKey = "clover.selected-workspace-id.v1";
export const selectedWorkspaceEventName = "clover:selected-workspace";
export const selectedCurrencyByWorkspaceKey = "clover.selected-currency-by-workspace.v1";

export type WorkspaceLike = {
  id: string;
};

const allCurrenciesStorageValue = "ALL";

const readCurrencyPreferences = () => {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(selectedCurrencyByWorkspaceKey) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

export const readSelectedCurrency = (workspaceId: string): string | null => {
  if (!workspaceId) {
    return null;
  }

  const stored = readCurrencyPreferences()[workspaceId];
  if (stored === allCurrenciesStorageValue) {
    return "";
  }

  return typeof stored === "string" && /^[A-Z]{3}$/.test(stored) ? stored : null;
};

export const persistSelectedCurrency = (workspaceId: string, currency: string) => {
  if (typeof window === "undefined" || !workspaceId) {
    return;
  }

  const normalizedCurrency = currency.trim().toUpperCase();
  const storedCurrency = normalizedCurrency && normalizedCurrency !== "ALL"
    ? normalizedCurrency
    : allCurrenciesStorageValue;
  const preferences = readCurrencyPreferences();
  preferences[workspaceId] = storedCurrency;

  try {
    window.localStorage.setItem(selectedCurrencyByWorkspaceKey, JSON.stringify(preferences));
  } catch {
    // Browsing modes with disabled storage should still allow an in-memory selection.
  }
};

export const clearSelectedCurrencyPreferences = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(selectedCurrencyByWorkspaceKey);
  } catch {
    // Disabled storage should not prevent the Settings preference from changing.
  }
};

const captureWorkspaceSwitch = (previousWorkspaceId: string, workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const posthogWindow = window as Window & {
    posthog?: { capture: (event: string, properties?: Record<string, unknown>) => void };
    __posthogQueue?: Array<() => void>;
  };

  const emit = () => {
    posthogWindow.posthog?.capture("workspace_switched", {
      previous_workspace_id: previousWorkspaceId,
      next_workspace_id: workspaceId,
    });
  };

  if (posthogWindow.posthog) {
    emit();
    return;
  }

  posthogWindow.__posthogQueue ??= [];
  posthogWindow.__posthogQueue.push(emit);
};

export const readSelectedWorkspaceId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(selectedWorkspaceKey) ?? "";
};

export const persistSelectedWorkspaceId = (workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const previousWorkspaceId = window.localStorage.getItem(selectedWorkspaceKey) ?? "";

  if (!workspaceId) {
    window.localStorage.removeItem(selectedWorkspaceKey);
    document.cookie = `${selectedWorkspaceKey}=; Path=/; Max-Age=0; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(selectedWorkspaceEventName, { detail: { workspaceId: "" } }));
    return;
  }

  if (previousWorkspaceId && previousWorkspaceId !== workspaceId) {
    captureWorkspaceSwitch(previousWorkspaceId, workspaceId);
  }

  window.localStorage.setItem(selectedWorkspaceKey, workspaceId);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${selectedWorkspaceKey}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(selectedWorkspaceEventName, { detail: { workspaceId } }));
};

export const syncSelectedWorkspaceCookie = () => {
  if (typeof window === "undefined") {
    return;
  }

  const storedWorkspaceId = window.localStorage.getItem(selectedWorkspaceKey) ?? "";
  if (!storedWorkspaceId) {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${selectedWorkspaceKey}=${encodeURIComponent(storedWorkspaceId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
};

export const chooseWorkspaceId = (workspaces: WorkspaceLike[], currentWorkspaceId = "") => {
  if (currentWorkspaceId && workspaces.some((workspace) => workspace.id === currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  const storedWorkspaceId = readSelectedWorkspaceId();
  if (storedWorkspaceId && workspaces.some((workspace) => workspace.id === storedWorkspaceId)) {
    return storedWorkspaceId;
  }

  return workspaces[0]?.id ?? "";
};
