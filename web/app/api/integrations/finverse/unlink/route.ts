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
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan-quota:${workspace.userId}`}, 0))`;
      const link = await tx.finverseAccountLink.findFirst({ where: { accountId: body.accountId, workspaceId: body.workspaceId, connection: { user: { clerkUserId: userId } } }, include: { connection: true } });
      if (!link) return null;
      if (link.unlinkedAt) return { resetsAt: null };
      const allowance = await bankLinkAllowance(tx, workspace.userId);
      const others = await tx.finverseAccountLink.count({ where: { connectionId: link.connectionId, unlinkedAt: null, accountId: { not: null }, id: { not: link.id } } });
      // Revoke the provider authorization only after its final account is unlinked.
      if (!others) {
        const token = await getActiveFinverseToken(link.connection);
        await unlinkFinverseIdentity(token);
        await tx.finverseConnection.update({ where: { id: link.connectionId }, data: { status: 'disconnected', encryptedAccessToken: null, encryptedRefreshToken: null, accessTokenExpiresAt: null, loginIdentityId: null } });
      }
      await tx.finverseAccountLink.update({ where: { id: link.id }, data: { unlinkedAt: new Date() } });
      return { resetsAt: allowance.periodEnd };
    }, { timeout: 45_000 });
    if (!result) return NextResponse.json({ error: 'Linked account not found.' }, { status: 404 });
    return NextResponse.json({ status: 'unlinked', ...result });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Choose a linked account.' }, { status: 400 });
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ error: message === 'UNAUTHORIZED' ? 'Please sign in again.' : 'Unable to unlink this account. Your records are unchanged. Try again.' }, { status: message === 'UNAUTHORIZED' ? 401 : message === 'WORKSPACE_NOT_FOUND' ? 404 : 502 });
  }
}
