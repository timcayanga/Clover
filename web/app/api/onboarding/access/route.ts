import { auth } from '@clerk/nextjs/server';
import { getOrCreateCurrentUser } from '@/lib/user-context';
import { getProAccess } from '@/lib/pro-access';
export const dynamic = 'force-dynamic';
export async function GET() {
  const {userId} = await auth();
  if (!userId) return Response.json({error:'Sign in to check your plan.'},{status:401});
  try { const user=await getOrCreateCurrentUser(userId), access=await getProAccess(user.id);
    return Response.json({planTier:access.planTier},{headers:{'Cache-Control':'private, no-store'}});
  } catch { return Response.json({error:'Your plan could not be checked. Please try again.'},{status:503}); }
}
