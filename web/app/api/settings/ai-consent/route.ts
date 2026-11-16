import { requireAuth } from "@/lib/auth";
import { getOrCreateCurrentUser } from "@/lib/user-context";
import { prisma } from "@/lib/prisma";
import { getAiConsent, setAiConsent } from "@/lib/ai-consent";
import { assertTrustedRequestOrigin } from "@/lib/request-security";
const headers = { "Cache-Control": "private, no-store" };
async function consentUser() {
  const { userId, isGuest } = await requireAuth();
  if (isGuest) throw new Error("UNAUTHORIZED");
  // Reading permission must not depend on profile sync or plan refresh succeeding.
  return await prisma.user.findUnique({where:{clerkUserId:userId},select:{id:true}}) ?? await getOrCreateCurrentUser(userId);
}
function failure(error: unknown, write: boolean) {
  const message = error instanceof Error ? error.message : "";
  const status = message === "UNAUTHORIZED" ? 401 : message === "ADMIN_ONLY" || message === "Untrusted request origin." ? 403 : write && error instanceof Error && error.name === "ZodError" ? 400 : 503;
  console.error("[ai-consent] request failed", {status,operation:write?"save":"read",errorType:error instanceof Error?error.name:"unknown"});
  return Response.json({ error: status === 401 ? "Sign in to manage AI permission." : "Unable to check AI permission. Please retry." }, { status, headers });
}
export async function GET() {
  try { const user = await consentUser(); return Response.json(await getAiConsent(user.id), { headers }); }
  catch(error) { return failure(error,false); }
}
export async function POST(request: Request) {
  try { assertTrustedRequestOrigin(request); const user = await consentUser(); return Response.json(await setAiConsent(user.id, await request.json()), { headers }); }
  catch(error) { return failure(error,true); }
}
