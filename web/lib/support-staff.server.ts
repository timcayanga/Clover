import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "./prisma";
import { getAdminDataEnvironment } from "./admin";

type StaffLabel = { displayName: string; email: string | null };
const labels = new Map<string, { value: StaffLabel; expires: number }>();

/** Display enrichment only. Call after support access and case scope checks. */
export async function getSupportStaffLabels(ids: string[]) {
  const environment = getAdminDataEnvironment();
  const unique = [...new Set(ids.filter(Boolean))];
  const result: Record<string, StaffLabel> = Object.create(null);
  const missing: string[] = [];
  for (const id of unique) {
    const cached = labels.get(`${environment}:${id}`);
    if (cached && cached.expires > Date.now()) result[id] = cached.value;
    else missing.push(id);
  }
  if (!missing.length) return result;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const lookup = async () => {
      const found: Record<string, StaffLabel> = Object.create(null);
      const client = await clerkClient();
      for (let index = 0; index < missing.length; index += 100) {
        const response = await client.users.getUserList({ userId: missing.slice(index, index + 100), limit: 100 });
        for (const user of response.data) {
          if (!missing.includes(user.id)) continue;
          const email = (user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId) ?? user.emailAddresses[0])?.emailAddress ?? null;
          const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
          if (name || email) found[user.id] = { displayName: name || email!, email };
        }
      }
      return found;
    };
    Object.assign(result, await Promise.race([
      lookup(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Staff lookup timed out")), 1500); }),
    ]));
  } catch { /* A name lookup must not hide support cases or delivery status. */ }
  finally { if (timeout) clearTimeout(timeout); }
  const unresolved = missing.filter((id) => !result[id]);
  if (unresolved.length) {
    try {
      const users = await prisma.user.findMany({
        where: { clerkUserId: { in: unresolved }, environment },
        select: { clerkUserId: true, email: true },
      });
      for (const user of users) result[user.clerkUserId] = {
        displayName: user.email,
        email: user.email,
      };
    } catch { /* Preserve the support flow during identity-service outages. */ }
  }
  for (const id of missing) {
    const value = result[id] ?? { displayName: "Team member", email: null };
    result[id] = value;
    if (labels.size >= 500) labels.delete(labels.keys().next().value!);
    labels.set(`${environment}:${id}`, { value, expires: Date.now() + (value.email ? 300_000 : 30_000) });
  }
  return result;
}
