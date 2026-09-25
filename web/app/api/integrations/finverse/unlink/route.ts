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
    const body = z.object({ workspaceId: z.string().min(1), accountId: z.string().min(1) }).strict().parse(await request.json());
    const workspace = await assertWorkspaceAccess(userId, body.workspaceId);
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
