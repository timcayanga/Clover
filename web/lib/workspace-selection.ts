const selectedWorkspaceKey = "clover.selected-workspace-id.v1";

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
    return;
  }

  window.localStorage.setItem(selectedWorkspaceKey, workspaceId);
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
