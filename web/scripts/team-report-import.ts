// Scoped delivery bridge: no Clerk/database credentials or browser cookies needed.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { teamReportSchema } from "../lib/team-report-contract";
async function main() {
  const file = process.argv[2];
  const token = process.env.CLOVER_TEAM_REPORT_TOKEN;
  if (!file || !token || token.length < 64) throw new Error("Report file and scoped token required");
  const report = teamReportSchema.parse(JSON.parse(await readFile(file, "utf8")));
  const body = JSON.stringify(report);
  const response = await fetch("https://team.clover.ph/api/team/reports/ingest", {
    method: "POST", headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"}, body,
    redirect: "error", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Report delivery failed (${response.status})`);
  const result = await response.json();
  if (result.contentHash !== createHash("sha256").update(body).digest("hex") || !/^[a-f0-9-]{36}$/.test(result.id)) throw new Error("Unverified delivery receipt");
  console.log(JSON.stringify({id:result.id,href:`https://team.clover.ph/team/assignments/${result.id}`,contentHash:result.contentHash,duplicate:result.duplicate===true}));
}
main().catch(() => {console.error("Report delivery failed; keep the stable report key and retry after checking the connection. No verified delivery receipt recorded.");process.exitCode=1;});
