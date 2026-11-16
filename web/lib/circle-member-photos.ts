import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

import { resolveCircleMemberPhoto } from "@/lib/circle-member-photo-match";

/** Only call after the caller's Circle access has been established. */
export async function loadCircleMemberPhotos(circles: {id:string;ownerUserId:string;memberships:{id:string;userId:string|null;displayName:string}[]}[]) {
  if (!circles.length) return new Map<string,string|null>();
  const memberUserIds = [...new Set(circles.flatMap(c => c.memberships.flatMap(m => m.userId ? [m.userId] : [])))];
  const ownerIds = [...new Set(circles.map(c => c.ownerUserId))];
  const [users, people] = await Promise.all([
    prisma.user.findMany({where:{id:{in:memberUserIds}},select:{id:true,clerkUserId:true}}),
    prisma.splitBillPerson.findMany({where:{userId:{in:ownerIds}},select:{userId:true,name:true,avatarUrl:true}}),
  ]);
  const photos = new Map<string,string>();
  // Clerk is optional enrichment: an outage must not hide Circle financial data.
  try {
    if (!users.length) return new Map(circles.flatMap(circle => circle.memberships.map(member => [member.id,resolveCircleMemberPhoto(member,people.filter(p=>p.userId===circle.ownerUserId),photos)] as const)));
    const client = await clerkClient();
    for (let i=0;i<users.length;i+=100) {
      const batch = users.slice(i,i+100);
      const response = await client.users.getUserList({userId:batch.map(u=>u.clerkUserId),limit:100});
      for (const user of response.data) {
        const local = batch.find(u=>u.clerkUserId===user.id);
        if (local && user.hasImage && user.imageUrl) photos.set(local.id,user.imageUrl);
      }
    }
  } catch { /* Use the Circle owner's existing shared-person image or initials. */ }
  return new Map(circles.flatMap(circle => circle.memberships.map(member => [member.id,resolveCircleMemberPhoto(member,people.filter(p=>p.userId===circle.ownerUserId),photos)] as const)));
}
