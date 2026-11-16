import { strict as assert } from "node:assert";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const localStorage = new MemoryStorage();
const sessionStorage = new MemoryStorage();

Object.assign(globalThis, {
  CustomEvent: class {
    constructor(
      public readonly type: string,
      public readonly init?: { detail?: unknown }
    ) {}
  },
  window: {
    localStorage,
    sessionStorage,
    dispatchEvent: () => true,
  },
});

const main = async () => {
  const {
    clearPersistedWorkspaceAccountDeletionMarkers,
    getDeletedWorkspaceAccountIds,
    getDeletingWorkspaceAccountIds,
    markDeletedWorkspaceAccount,
    markDeletingWorkspaceAccount,
    reconcilePersistedWorkspaceAccountDeletionMarkers,
  } = await import("@/lib/workspace-cache");

  const workspaceId = "workspace-qa";
  markDeletedWorkspaceAccount(workspaceId, "deleted-account");
  markDeletingWorkspaceAccount(workspaceId, "deleting-account");

  clearPersistedWorkspaceAccountDeletionMarkers(workspaceId, [
    "deleted-account",
    "deleting-account",
  ]);

  assert.deepEqual(
    getDeletedWorkspaceAccountIds(workspaceId),
    [],
    "A persisted account must clear a stale completed-deletion marker."
  );
  assert.deepEqual(
    getDeletingWorkspaceAccountIds(workspaceId),
    [],
    "A persisted account must clear a stale in-progress deletion marker."
  );

  markDeletedWorkspaceAccount(workspaceId, "persisted-account");
  markDeletedWorkspaceAccount(workspaceId, "actually-deleted-account");
  markDeletingWorkspaceAccount(workspaceId, "persisted-account");
  const reconciled = reconcilePersistedWorkspaceAccountDeletionMarkers(workspaceId, ["persisted-account"]);
  assert.deepEqual(
    Array.from(reconciled.deletedIds),
    ["actually-deleted-account"],
    "The authoritative server payload must restore persisted accounts without reviving genuinely deleted IDs."
  );
  assert.deepEqual(
    Array.from(reconciled.deletingIds),
    [],
    "The authoritative server payload must override stale in-flight deletion state for persisted accounts."
  );

  console.info("Workspace account deletion marker regression checks passed.");
};

void main();
