import { prisma } from "@/lib/prisma";
import { getFinverseLoginIdentity, isFinverseDataReady } from "@/lib/finverse";

/** Best-effort post-callback discovery. Never imports accounts or transactions. */
export async function observeFinverseDiscovery(connectionId: string, accessToken: string) {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const result = await getFinverseLoginIdentity(accessToken);
    const identity = result.login_identity ?? {};
    const status = typeof identity.status === "string" ? identity.status : "";
    if (isFinverseDataReady(status)) {
      // A concurrent user selection/sync/unlink always wins over this observer.
      await prisma.finverseConnection.updateMany({
        where: { id: connectionId, status: "retrieving", lastSyncedAt: null, disconnectRequestedAt: null, accountLinks: { none: { unlinkedAt: null, accountId: { not: null } } } },
        data: { status: "awaiting_selection" },
      });
      return;
    }
    if (status === "ERROR") {
      await prisma.finverseConnection.updateMany({
        where: { id: connectionId, status: "retrieving", disconnectRequestedAt: null },
        data: { status: "error", syncError: "Finverse could not retrieve data from this institution.", syncFailureSince: new Date() },
      });
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }
}
