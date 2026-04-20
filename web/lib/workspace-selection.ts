export const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

export type WorkspaceLike = {
  id: string;
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

  if (!workspaceId) {
    window.localStorage.removeItem(selectedWorkspaceKey);
    document.cookie = `${selectedWorkspaceKey}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }

  window.localStorage.setItem(selectedWorkspaceKey, workspaceId);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${selectedWorkspaceKey}=${encodeURIComponent(workspaceId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
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
