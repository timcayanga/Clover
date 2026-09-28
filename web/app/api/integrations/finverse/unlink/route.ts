import { requestBankDisconnect, revokeBankConnection } from "@/lib/finverse-lifecycle";
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { assertWorkspaceAccess } from '@/lib/workspace-access';
import { prisma } from '@/lib/prisma';
import { bankLinkAllowance } from '@/lib/bank-link-usage';
import { getActiveFinverseToken } from '@/lib/finverse-access-token';
import { unlinkFinverseIdentity } from '@/lib/finverse';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = z.object({ workspaceId: z.string().min(1), accountId: z.string().min(1).optional(), connectionId: z.string().min(1).optional() }).strict().refine(body => Boolean(body.accountId) !== Boolean(body.connectionId)).parse(await request.json());
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
    if (body.connectionId) {
      const attempt = await prisma.finverseConnection.findFirst({ where: { id: body.connectionId, workspaceId: body.workspaceId, userId: workspace.userId } });
      if (!attempt) return NextResponse.json({ error: "Connection not found." }, { status: 404 });
      await requestBankDisconnect(attempt.id, "User cancelled bank setup", undefined, true);
      const current = await prisma.finverseConnection.findUniqueOrThrow({ where: { id: attempt.id } });
      if (current.status !== "disconnected" && !current.disconnectRequestedAt) return NextResponse.json({ error: "This bank has linked accounts. Use Unlink from Connected accounts." }, { status: 409 });
      const revoked = await revokeBankConnection(attempt.id);
      return NextResponse.json({ status: revoked ? "cancelled" : "disconnect_pending", message: revoked ? "Bank linking cancelled. Your existing accounts and history are unchanged." : "Bank linking stopped. Clover will retry disconnecting it with Finverse. Your existing accounts and history are unchanged." });
    }
    const link=await prisma.finverseAccountLink.findFirst({where:{accountId:body.accountId,workspaceId:body.workspaceId,connection:{userId:workspace.userId}}});
    if(!link) return NextResponse.json({error:'Linked account not found.'},{status:404});
    await requestBankDisconnect(link.connectionId,'User disconnected bank');
    const revoked=await revokeBankConnection(link.connectionId);
    return NextResponse.json({status:revoked?'unlinked':'disconnect_pending',message:revoked?'Bank disconnected. Records preserved.':'Disconnection pending; Clover will retry with Finverse. Records preserved.'});
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Choose a linked account.' }, { status: 400 });
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Please sign in again.' : 'Unable to unlink this account. Your records are unchanged. Try again.' }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'WORKSPACE_NOT_FOUND' ? 404 : 502 });
  }
}
