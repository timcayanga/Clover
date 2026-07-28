import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [shellSource, dashboardSource, workspaceSelectionSource, onboardingSource, pageAuthSource, middlewareSource, globalStyles] = await Promise.all([
    readSource("components/clover-shell.tsx"),
    readSource("app/dashboard/page.tsx"),
    readSource("lib/workspace-selection.ts"),
    readSource("components/onboarding-form.tsx"),
    readSource("lib/page-auth.ts"),
    readSource("middleware.ts"),
    readSource("app/globals.css"),
  ]);
  const protectedPageSources = await Promise.all(
    [
      "app/adviser/page.tsx",
      "app/budgeting/page.tsx",
      "app/goals/page.tsx",
      "app/profile/page.tsx",
      "app/recurring/page.tsx",
      "app/reports/page.tsx",
      "app/review/page.tsx",
      "app/settings/page.tsx",
      "app/split-bill/page.tsx",
    ].map(readSource),
  );

  assert.match(
    workspaceSelectionSource,
    /selectedWorkspaceEventName = "clover:selected-workspace"/,
    "Workspace selection must expose a same-tab synchronization event."
  );
  assert.match(
    workspaceSelectionSource,
    /dispatchEvent\(new CustomEvent\(selectedWorkspaceEventName,\s*\{\s*detail:\s*\{\s*workspaceId/,
    "Workspace changes must notify the shell in the same browser tab."
  );
  assert.match(
    shellSource,
    /workspaceId\?: string/,
    "The shared shell must accept a server-resolved workspace fallback."
  );
  assert.match(
    shellSource,
    /readSelectedWorkspaceId\(\) \|\| workspaceId \|\| ""/,
    "Quick add must hydrate from the server workspace when browser storage is empty."
  );
  assert.match(
    shellSource,
    /addEventListener\(selectedWorkspaceEventName, handleSameTabWorkspaceChange\)/,
    "Quick add must react to workspace selection performed by the current page."
  );
  assert.match(
    shellSource,
    /\{shouldShowBackButton && !mobileFallbackBackOnly \? \([\s\S]{0,900}className="shell-menu-button"/,
    "Compact tablet headers must show the menu when only a phone fallback Back target exists."
  );
  assert.match(
    dashboardSource,
    /<CloverShell[\s\S]{0,180}workspaceId=\{workspaceSummary\.id\}/,
    "Home must provide its resolved workspace to camera and file quick-add actions."
  );
  assert.match(
    onboardingSource,
    /\{importOpen \? \(\s*<ImportFilesModal\s+open/,
    "Onboarding must not download the parser-heavy import modal before the user starts an upload."
  );
  assert.match(
    pageAuthSource,
    /error\.message === "UNAUTHORIZED"[\s\S]{0,100}redirect\("\/sign-in"\)/,
    "Protected Server Component pages must redirect signed-out production visitors instead of rendering an error."
  );
  assert.ok(
    protectedPageSources.every((source) => source.includes("getPageSessionContext")),
    "Every protected Server Component page must use the shared page authentication boundary."
  );
  assert.match(
    middlewareSource,
    /"\/investments\(\.\*\)"[\s\S]{0,180}"\/notifications\(\.\*\)"/,
    "Client-only authenticated pages must be protected before their empty shells can render."
  );
  assert.match(
    middlewareSource,
    /!isGuestEnabledEnvironment\([\s\S]{0,180}auth\.protect\(\{[\s\S]{0,120}unauthenticatedUrl:/,
    "Production app routes must require Clerk authentication without disabling staging guest access."
  );

  assert.match(
    globalStyles,
    /\.contact-page__header p \{[\s\S]{0,160}white-space: normal;/,
    "Contact copy must wrap in tablet and narrow laptop windows."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 760px\) \{[\s\S]*?\.content--has-mobile-leading-action \.shell-topbar-leading__actions \{[\s\S]{0,80}display: none !important;/,
    "Phone headers must remove duplicate leading actions before positioning the title."
  );
  assert.match(
    globalStyles,
    /\.topbar:has\(\.shell-back-button\) \.topbar__title-wrap[\s\S]{0,500}position: static !important;[\s\S]{0,500}grid-column: 2 !important;/,
    "Phone page titles must occupy the grid space between navigation and actions."
  );
  assert.match(
    globalStyles,
    /\.topbar:has\(\.shell-back-button\) \.topbar__title-row h1[\s\S]{0,260}text-overflow: ellipsis;/,
    "Long phone page titles must truncate instead of overlapping actions."
  );
  assert.match(
    globalStyles,
    /\.content--plain-title > :is\(\.topbar, \.shell-compact-bar\) \{[\s\S]{0,160}grid-template-columns: 40px minmax\(0, 1fr\) auto !important;/,
    "Plain phone headers must reserve the real action width instead of overlaying it."
  );
  assert.match(
    globalStyles,
    /\.content--plain-title > \.topbar \.topbar__title-wrap,[\s\S]{0,180}position: static;[\s\S]{0,180}grid-column: 2 !important;/,
    "Plain phone titles must stay in the collision-free middle column."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 981px\) \{[\s\S]{0,180}\.accounts-card-grid\.accounts-card-grid--desktop \{[\s\S]{0,180}repeat\(auto-fit, minmax\(min\(100%, 240px\), 272px\)\)/,
    "Desktop account grids must add columns instead of stretching cards beyond their intended width."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 761px\) and \(max-width: 1180px\) \{[\s\S]{0,240}\.content--plain-title > \.topbar \.topbar__title-wrap,[\s\S]{0,180}justify-items: start !important;/,
    "Compact laptop page titles must stay left-aligned instead of centering within action-reduced space."
  );
  const transactionDesktopColumns =
    "28px 40px minmax(0, 1.8fr) minmax(110px, 0.85fr) minmax(170px, 1.55fr) minmax(140px, 0.9fr) minmax(110px, 0.8fr) 40px 40px";
  assert.equal(
    globalStyles.split(transactionDesktopColumns).length - 1,
    2,
    "Desktop transaction headers and rows must share the wider Category column layout."
  );

  console.log("Browser compatibility regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
