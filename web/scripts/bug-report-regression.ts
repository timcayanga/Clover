import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shell = readFileSync(join(root, "components/clover-shell.tsx"), "utf8");
const widget = readFileSync(join(root, "components/bug-report-widget.tsx"), "utf8");
const route = readFileSync(join(root, "app/api/bug-reports/route.ts"), "utf8");
const email = readFileSync(join(root, "lib/contact-email.ts"), "utf8");

assert.doesNotMatch(shell, /<BugReportWidget/, "The requested Bug launcher must not appear in Clover’s app shell.");
assert.match(widget, /accept="image\/\*"/, "Bug reports should accept an optional image.");
assert.match(widget, /getClientDiagnostics\(\)/, "Bug reports should include the bounded browser diagnostic buffer.");
assert.match(widget, /document\.body\.dataset\.buildId/, "Bug reports should include the active build identifier.");
assert.match(route, /await requireAuth\(\)/, "The bug-report endpoint must require a signed-in user.");
assert.match(route, /await assertWorkspaceAccess\(clerkUserId, payload\.workspaceId\)/, "The endpoint must verify workspace ownership.");
assert.match(route, /MAX_ATTACHMENT_BYTES = 2 \* 1024 \* 1024/, "Report images must remain capped at 2 MB.");
assert.match(route, /prisma\.appErrorLog\.findMany/, "The report should include recent structured Clover errors.");
assert.match(route, /createContactInquiry/, "The report should remain visible in Clover Admin support.");
assert.match(email, /kind\?: "contact" \| "bug_report"/, "Email delivery should distinguish bug reports from contact inquiries.");
assert.match(email, /to: input\.recipient \?\? CONTACT_ADDRESS/, "Bug report email should use Clover's fixed support destination.");

const dispatch = readFileSync(join(root, "lib/contact-notification.server.ts"), "utf8");
assert.match(route, /await deliverContactNotification\(inquiry\.id\)/, "Persisted reports must use the durable notification claim.");
assert.match(dispatch, /environment === "production"\s*\? "hello@clover.ph"/, "Production support notifications must retain the fixed staff destination.");
console.log("[PASS] Bug launcher removed; retained support endpoint remains authenticated, bounded, diagnostic, and email-enabled");
