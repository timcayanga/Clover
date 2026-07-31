import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [
    shellSource,
    dashboardSource,
    workspaceSelectionSource,
    onboardingSource,
    circlesSource,
    pageAuthSource,
    middlewareSource,
    globalStyles,
    transactionsSource,
    accountDetailsSource,
    responsiveLayoutSource,
    dashboardActionsSource,
    dashboardActionsLazySource,
    settingsHubSource,
    postHogSource,
  ] = await Promise.all([
    readSource("components/clover-shell.tsx"),
    readSource("app/dashboard/page.tsx"),
    readSource("lib/workspace-selection.ts"),
    readSource("components/onboarding-form.tsx"),
    readSource("components/circles-page-client.tsx"),
    readSource("lib/page-auth.ts"),
    readSource("middleware.ts"),
    readSource("app/globals.css"),
    readSource("app/transactions/page.tsx"),
    readSource("app/accounts/[accountId]/page.tsx"),
    readSource("lib/responsive-layout.ts"),
    readSource("components/dashboard-top-actions.tsx"),
    readSource("components/dashboard-top-actions-lazy.tsx"),
    readSource("components/settings-hub.tsx"),
    readSource("components/posthog-analytics.tsx"),
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
    circlesSource,
    /accounts-toolbar-button accounts-toolbar-button--upload circles-topbar-action/,
    "Create Circle must use the same compact toolbar sizing as Upload files."
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
    /if \(isProtectedAppRoute\(request\)\) \{[\s\S]{0,120}await auth\.protect\(\{[\s\S]{0,120}unauthenticatedUrl:/,
    "Protected app routes must require Clerk authentication in every deployed environment."
  );
  assert.doesNotMatch(
    middlewareSource,
    /isGuestEnabledEnvironment|VERCEL_ENV === "preview"|staging\.clover\.ph/,
    "Staging and preview deployments must not bypass Clerk authentication for protected app routes."
  );

  assert.match(
    globalStyles,
    /\.contact-page__header p \{[\s\S]{0,160}white-space: normal;/,
    "Contact copy must wrap in tablet and narrow laptop windows."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]*?\.content--has-mobile-leading-action \.shell-topbar-leading__actions \{[\s\S]{0,80}display: none !important;/,
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
    /@media \(min-width: 1101px\) \{[\s\S]{0,180}\.accounts-card-grid\.accounts-card-grid--desktop \{[\s\S]{0,180}repeat\(auto-fit, minmax\(min\(100%, 240px\), 272px\)\)/,
    "Desktop account grids must add columns instead of stretching cards beyond their intended width."
  );
  assert.match(
    globalStyles,
    /\.content--accounts \.accounts-overview-grid \{[\s\S]{0,180}top: calc\(var\(--accounts-sticky-header-height\) \+ var\(--accounts-sticky-page-gap\)\);[\s\S]{0,220}width: calc\(100% \+ \(var\(--content-inline-gutter\) \* 2\)\);/,
    "The desktop Accounts summary must remain at its initial header offset and span both content gutters."
  );
  assert.match(
    globalStyles,
    /\.content--accounts \.accounts-group,[\s\S]{0,180}\.accounts-group--drop-target\.is-drag-over \{[\s\S]{0,80}border-radius: 0 !important;/,
    "Desktop account section dividers must keep straight edges in every drag state."
  );
  const creditDetailLayout = accountDetailsSource.slice(
    accountDetailsSource.indexOf('<div className={`accounts-detail__hero-layout'),
    accountDetailsSource.indexOf("{account.type !== \"investment\" && accountIdentityEditorOpen")
  );
  assert.ok(
    creditDetailLayout.indexOf('className="accounts-detail__hero-card-row"') <
      creditDetailLayout.indexOf('className="accounts-detail__credit-inline"'),
    "Credit-card details must render below the centered account card."
  );
  assert.match(
    globalStyles,
    /\.accounts-detail__hero-layout\.is-credit-account \{[\s\S]{0,100}grid-template-columns: 1fr;[\s\S]{0,100}width: min\(100%, 320px\);/,
    "Credit-card detail headers must use one centered column at desktop widths."
  );
  assert.match(
    globalStyles,
    /\.accounts-detail__account-identity-editor--inline \.accounts-inline-edit__grid input \{[\s\S]{0,240}border: 0;[\s\S]{0,100}border-bottom:/,
    "Inline account identity fields must use flat underline styling instead of input containers."
  );
  assert.match(
    accountDetailsSource,
    /className="accounts-detail__account-identity-close"[\s\S]{0,120}>\s*Close\s*<\/button>/,
    "The account identity editor must expose a compact text-only Close action."
  );
  assert.match(
    responsiveLayoutSource,
    /MOBILE_LAYOUT_MAX_WIDTH = 1100[\s\S]{0,120}DESKTOP_LAYOUT_MIN_WIDTH = MOBILE_LAYOUT_MAX_WIDTH \+ 1[\s\S]{0,120}MOBILE_LAYOUT_MEDIA_QUERY/,
    "Clover must publish one shared mobile/desktop viewport contract."
  );
  assert.ok(
    [transactionsSource, accountDetailsSource, dashboardActionsSource, dashboardActionsLazySource, settingsHubSource].every(
      (source) => source.includes("MOBILE_LAYOUT_MEDIA_QUERY")
    ),
    "Every React-rendered mobile page variant must use the shared layout query."
  );
  assert.match(
    postHogSource,
    /viewport_class: getCloverViewportLayout\(window\.innerWidth\)/,
    "Analytics must report the same two viewport layouts that the interface renders."
  );
  assert.doesNotMatch(
    postHogSource,
    /viewport_class:[^\n]*tablet/,
    "Analytics must not retain a third tablet layout class."
  );
  const transactionDesktopColumns =
    "28px 40px minmax(0, 1.8fr) minmax(110px, 0.85fr) minmax(170px, 1.55fr) minmax(140px, 0.9fr) minmax(110px, 0.8fr) 40px 40px";
  assert.equal(
    globalStyles.split(transactionDesktopColumns).length - 1,
    2,
    "Desktop transaction headers and rows must share the wider Category column layout."
  );
  assert.match(
    globalStyles,
    /\.dashboard-home__report-flow-segment \{[\s\S]{0,140}border-radius: 999px;/,
    "Home report bars must remain rounded even when a value produces a short segment."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 1101px\) \{[\s\S]{0,100}\.app-shell > \.sidebar \{[\s\S]{0,100}position: sticky !important;[\s\S]{0,100}top: 0 !important;/,
    "The desktop sidebar must remain anchored while the document scrolls."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 1101px\) \{[\s\S]{0,1000}\.topbar__title-wrap,[\s\S]{0,120}order: 0 !important;[\s\S]{0,80}grid-column: 1 !important;[\s\S]{0,180}\.topbar-actions,[\s\S]{0,120}grid-column: 2 !important;/,
    "Desktop headers must keep titles before actions at every desktop width."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]{0,100}\.shell-bottom-nav \{[\s\S]{0,80}display: grid !important;/,
    "The complete mobile layout must include bottom navigation at every mobile width."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]{0,220}\.transactions-table-wrap \{[\s\S]{0,80}display: none !important;[\s\S]{0,160}\.transactions-mobile-view \{[\s\S]{0,80}display: grid !important;/,
    "Transactions must switch its list and table together at the shared mobile breakpoint."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]{0,500}\.accounts-card-grid\.accounts-card-grid--desktop \{[\s\S]{0,80}display: none !important;[\s\S]{0,240}\.accounts-mobile-featured,[\s\S]{0,120}display: grid !important;/,
    "Accounts must switch its desktop cards and mobile list together at the shared mobile breakpoint."
  );
  assert.doesNotMatch(
    globalStyles,
    /@media \(max-width: 1180px\) \{[\s\S]{0,120}\.(?:app-shell|sidebar|transactions-table-wrap|transactions-mobile-view|split-bill-mobile-home)/,
    "No legacy 1,180px rule may activate a third application layout."
  );
  assert.match(
    globalStyles,
    /\.content > :is\(\.topbar, \.shell-compact-bar\) \{[\s\S]{0,100}position: sticky !important;[\s\S]{0,80}top: 0;/,
    "Shared page headers must remain anchored across desktop and compact layouts."
  );
  assert.match(
    globalStyles,
    /\.content > :is\(\.topbar, \.shell-compact-bar\) \{[\s\S]{0,240}background: var\(--surface\) !important;[\s\S]{0,100}box-shadow: none !important;/,
    "Sticky page headers must use an opaque page-matched background without a container shadow."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 1101px\) \{[\s\S]{0,520}\.nav-link \{[\s\S]{0,140}font-size: 13px;[\s\S]{0,180}\.nav-link__icon \{[\s\S]{0,80}width: 20px;[\s\S]{0,80}height: 20px;/,
    "Desktop sidebar labels and icon slots must retain their readable sizing."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]{0,140}\.content > :is\(\.topbar, \.shell-compact-bar\):has\(\.shell-back-button\) \{[\s\S]{0,100}grid-template-columns: auto minmax\(0, 1fr\) auto !important;/,
    "Compact headers must reserve separate columns for leading controls, titles, and actions."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]{0,140}\.content--has-mobile-leading-action \.shell-topbar-leading__actions \{[\s\S]{0,80}display: inline-flex !important;/,
    "Mobile Accounts, Transactions, and Recurring headers must expose their Ask Clover action."
  );
  assert.match(
    globalStyles,
    /\.content--has-mobile-leading-action[\s\S]{0,160}> :is\(\.topbar, \.shell-compact-bar\):has\(\.shell-back-button\)[\s\S]{0,100}\.topbar__title-row[\s\S]{0,300}h1 \{[\s\S]{0,100}flex: 1 1 auto;[\s\S]{0,160}text-overflow: ellipsis;/,
    "Very narrow mobile headers must shrink and ellipsize titles inside the center column."
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 1100px\) \{[\s\S]*?\.transactions-mobile-simple-row \{[\s\S]{0,180}min-height: 40px;[\s\S]{0,120}padding: 6px 4px 6px 6px;/,
    "Mobile transaction lists must keep their compact row sizing."
  );
  assert.match(
    globalStyles,
    /\.transactions-mobile-simple-row__name-main,[\s\S]{0,100}\.transactions-mobile-simple-row__amount \{[\s\S]{0,100}font-size: 0\.82rem;/,
    "Mobile transaction names and amounts must use the compact shared type scale."
  );
  assert.match(
    globalStyles,
    /\.accounts-detail__transactions \.accounts-detail__mobile-transaction-name \{[\s\S]{0,120}grid-template-columns: 20px minmax\(0, 1fr\);/,
    "Account Details must retain its compact single-badge mobile transaction layout."
  );
  assert.match(
    globalStyles,
    /\.transactions-mobile-date-divider::before,[\s\S]{0,100}\.transactions-mobile-date-divider::after \{[\s\S]{0,120}border-top: 1px dashed currentColor;/,
    "Mobile transaction dates must use equal flexible divider lines instead of typed hyphens."
  );
  assert.match(
    globalStyles,
    /\.transactions-mobile-date-divider,[\s\S]{0,80}\.transactions-mobile-date-divider span \{[\s\S]{0,80}min-height: 18px;/,
    "Mobile transaction date dividers must keep their compact vertical rhythm."
  );
  assert.ok(
    [transactionsSource, accountDetailsSource].every(
      (source) =>
        /className="transactions-mobile-date-divider">\s*<span>\{group\.label\}<\/span>/.test(source) &&
        /size=\{20\}[\s\S]{0,100}className="transactions-mobile-simple-row__category-icon"/.test(source)
    ),
    "Transactions and Account Details must use centered date labels and equal 20px mobile badges."
  );

  console.log("Browser compatibility regression passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
