import { timingSafeEqual } from "node:crypto";
import { sweepSignupTrials } from "@/lib/signup-trial-lifecycle";
import { sweepBankConnections } from "@/lib/finverse-lifecycle";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const trials = await sweepSignupTrials();
    const banks = await sweepBankConnections();
    return Response.json({ trials, banks });
  } catch {
    return Response.json({ error: "Trial lifecycle run needs retry. Inspect the delivery and bank lifecycle ledgers." }, { status: 500 });
  }
}
