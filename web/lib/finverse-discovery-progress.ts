import { withBankMonitoring, bindBankMonitoring, bankProducts, bankJourney } from "./bank-journey-monitor";
import { finverseDataReadiness } from "./finverse-data-readiness";
import { prisma } from "@/lib/prisma";
import { getFinverseLoginIdentity } from "@/lib/finverse";

/** Best-effort post-callback discovery. Never imports accounts or transactions. */
export function observeFinverseDiscovery(connectionId:string,accessToken:string){return withBankMonitoring("sync",()=>observe(connectionId,accessToken));}
async function observe(connectionId: string, accessToken: string) {
  const c=await prisma.finverseConnection.findUnique({where:{id:connectionId},select:{id:true,userId:true,workspaceId:true,institutionId:true,institutionName:true,createdAt:true,user:{select:{clerkUserId:true}}}}).catch(()=>null);
  if(c)await bindBankMonitoring(c,c.user.clerkUserId);
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const result = await getFinverseLoginIdentity(accessToken);
    const identity = result.login_identity ?? {};
    bankProducts(identity);
    const readiness = finverseDataReadiness(identity);
    if (readiness.ready) {
      bankJourney("retrieval","succeeded",{providerStatus:readiness.providerStatus});
      // A concurrent user selection/sync/unlink always wins over this observer.
      await prisma.finverseConnection.updateMany({
        where: { id: connectionId, status: "retrieving", lastSyncedAt: null, disconnectRequestedAt: null, accountLinks: { none: { unlinkedAt: null, accountId: { not: null } } } },
        data: { status: "awaiting_selection" },
      });
      return;
    }
    if (readiness.failed) {
      bankJourney("retrieval","failed",{error:{providerCode:"PRODUCT_RETRIEVAL_FAILED"},providerStatus:readiness.providerStatus});
      await prisma.finverseConnection.updateMany({
        where: { id: connectionId, status: "retrieving", disconnectRequestedAt: null },
        data: { status: "error", syncError: "Finverse could not retrieve data from this institution.", syncFailureSince: new Date() },
      });
      return;
    }
    bankJourney("retrieval","pending",{providerStatus:readiness.providerStatus});
    await new Promise(resolve => setTimeout(resolve, 3_000));
  }
}
