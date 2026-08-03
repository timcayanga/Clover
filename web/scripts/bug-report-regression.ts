import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shell = readFileSync(join(root, "components/clover-shell.tsx"), "utf8");
const widget = readFileSync(join(root, "components/bug-report-widget.tsx"), "utf8");
const route = readFileSync(join(root, "app/api/bug-reports/route.ts"), "utf8");
const styles = readFileSync(join(root, "app/globals.css"), "utf8");
const email = readFileSync(join(root, "lib/contact-email.ts"), "utf8");

assert.match(shell, /<BugReportWidget[\s\S]*workspaceId=\{searchWorkspaceId\}/, "The authenticated Clover shell should mount the bug-report widget.");
assert.match(widget, /accept="image\/\*"/, "Bug reports should accept an optional image.");
assert.match(widget, /getClientDiagnostics\(\)/, "Bug reports should include the bounded browser diagnostic buffer.");
assert.match(widget, /document\.body\.dataset\.buildId/, "Bug reports should include the active build identifier.");
assert.match(route, /await requireAuth\(\)/, "The bug-report endpoint must require a signed-in user.");
assert.match(route, /await assertWorkspaceAccess\(clerkUserId, payload\.workspaceId\)/, "The endpoint must verify workspace ownership.");
assert.match(route, /MAX_ATTACHMENT_BYTES = 2 \* 1024 \* 1024/, "Report images must remain capped at 2 MB.");
assert.match(route, /prisma\.appErrorLog\.findMany/, "The report should include recent structured Clover errors.");
assert.match(route, /createContactInquiry/, "The report should remain visible in Clover Admin support.");
assert.match(email, /kind\?: "contact" \| "bug_report"/, "Email delivery should distinguish bug reports from contact inquiries.");
assert.match(email, /to: CONTACT_ADDRESS/, "Bug report email should use Clover's fixed support destination.");
assert.match(styles, /\.shell-bug-report-button\s*\{[\s\S]*right: 72px;[\s\S]*width: 44px;[\s\S]*height: 44px;/, "The desktop bug button should match the 44px Add button and sit beside it.");
assert.match(styles, /@media \(max-width: 1100px\)\s*\{\s*\.shell-bug-report-button\s*\{\s*display: none !important;/, "The bug-report trigger should remain desktop-only.");

console.log("[PASS] desktop bug-report flow is authenticated, bounded, diagnostic, and email-enabled");
