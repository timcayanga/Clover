import { selectedWorkspaceKey } from "./workspace-selection";

type ScopeOptions = {
  workspaceId?: string;
  storedWorkspaceId?: string;
  cookie?: string;
  signal: AbortSignal;
  request?: typeof fetch;
};

/** Resolve navigation context, then verify ownership before restoring chats. */
export async function resolveAdviserScope({ workspaceId, storedWorkspaceId, cookie = "", signal, request = fetch }: ScopeOptions): Promise<string> {
  let cookieWorkspace = "";
  try {
    const value = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${selectedWorkspaceKey}=`));
    cookieWorkspace = value ? decodeURIComponent(value.slice(selectedWorkspaceKey.length + 1)) : "";
  } catch { /* Invalid navigation hints must still pass server authorization. */ }
  let selected = workspaceId || storedWorkspaceId || cookieWorkspace;
  if (!selected) {
    // Directly opened server-rendered pages may precede client Profile setup.
    // The server returns the same ordered personal/default Profiles as Home.
    const response = await request("/api/workspaces", { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load your Profiles. Please retry.");
    const data = await response.json();
    selected = data.workspaces?.[0]?.id;
  }
  if (typeof selected !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(selected)) throw new Error("Choose a Profile to open Ask Clover.");
  const response = await request(`/api/adviser/entries?workspaceId=${encodeURIComponent(selected)}&scopeOnly=true`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to verify this Profile. Choose your Profile or retry.");
  const data = await response.json();
  if (data.workspaceId !== selected) throw new Error("Your Profile changed. Please reopen Ask Clover.");
  return selected;
}
