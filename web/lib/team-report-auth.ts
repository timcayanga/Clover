import { createHash, timingSafeEqual } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { hasInternalEmail } from "./internal-permissions";
export async function requireReportIngestAccess(request: Request) {
  const configured = process.env.CLOVER_TEAM_REPORT_TOKEN || "";
  const supplied = request.headers.get("authorization") || "";
  if (process.env.VERCEL_ENV !== "production" || configured.length < 64 || !supplied.startsWith("Bearer ") || !timingSafeEqual(createHash("sha256").update(supplied.slice(7)).digest(), createHash("sha256").update(configured).digest())) throw new Error("UNAUTHORIZED");
  const clerk = await clerkClient();
  const users = await clerk.users.getUserList({emailAddress: ["hello@clover.ph"], limit: 2});
  if (users.data.length !== 1 || !hasInternalEmail(users.data[0].emailAddresses)) throw new Error("FORBIDDEN");
  return users.data[0].id;
}
