import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { getVerifiedSpendingMerchantName } from "../lib/transaction-display";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const landingJourneySource = await readSource("app/landing-preview/landing-journey.tsx");
  const landingJourneyStyles = await readSource("app/landing-preview/landing-preview.module.css");
  const landingSceneNames = ["01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "06-life"];

  await Promise.all(
    landingSceneNames.flatMap((scene) =>
      ["", "-mobile"].map((suffix) => access(path.join(root, `../assets/landing-story-v2/${scene}${suffix}.webp`))),
    ),
  );
  assert.match(landingJourneySource, /const scenes = \["01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "06-life"\]/, "The scrollable landing story must retain all six people-led scenes in order.");
  assert.match(landingJourneySource, /<source media="\(max-width: 900px\)" srcSet=\{`\/assets\/landing-story-v2\/\$\{scene\}-mobile\.webp`\}/, "The landing story must use mobile-specific crops that keep its recurring cast visible.");
  assert.match(landingJourneyStyles, /@media\(max-width:900px\)\{[\s\S]*?\.markers\{right:8px;top:50%;bottom:auto;flex-direction:column;/, "The landing-story chapter tracker must remain on the right on mobile.");

  assert.equal(
    getVerifiedSpendingMerchantName({
      merchantClean: "PayPal",
      merchantRaw: "PAYPAL*SPOTIFY*P 402 EBB",
      institution: "BPI",
    }),
    "Spotify",
    "Biggest Merchants must resolve the payee behind a payment intermediary when the raw evidence identifies it.",
  );
  assert.equal(
    getVerifiedSpendingMerchantName({
      merchantClean: "Pymt - Credit Card",
      merchantRaw: "PYMT - CREDIT CARD",
      institution: "BPI",
    }),
    null,
    "Generic card payments must not be presented as verified merchants.",
  );
  assert.equal(
    getVerifiedSpendingMerchantName({
      merchantRaw: "Cebu AIR IN 0 Jozti Https://Www.cph",
      institution: "BPI",
    }),
    "Cebu Pacific",
    "Cebu Air descriptors must resolve to the customer-facing Cebu Pacific merchant.",
  );
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
    modalKeyboardSource,
    rootLayoutSource,
    commitmentsSource,
    investmentsSource,
    investmentMarketSource,
    accountsSource,
    reportsSource,
    reportsPeriodChartSource,
    importModalSource,
    transientRecoverySource,
    notificationsSource,
    publicAccountActionsSource,
  ] = await Promise.all([
    readSource("components/clover-shell.tsx"),
    readSource("components/dashboard-page-content.tsx"),
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
    readSource("components/modal-keyboard-controller.tsx"),
    readSource("app/layout.tsx"),
    readSource("components/commitments-panel.tsx"),
    readSource("app/investments/page.tsx"),
    readSource("components/investment-market-chart.tsx"),
    readSource("app/accounts/page.tsx"),
    readSource("app/reports/reports-page-content.tsx"),
    readSource("components/reports-period-comparison-chart.tsx"),
    readSource("components/import-files-modal.tsx"),
    readSource("components/transient-data-recovery.tsx"),
    readSource("app/notifications/notifications-client.tsx"),
    readSource("components/public-account-actions.tsx"),
  ]);

  assert.match(importModalSource, /role="region"[\s\S]{0,180}aria-label="Upload files"/, "Uploads must render as a full-page region instead of a dialog.");
  assert.match(importModalSource, /capture="environment"/, "The full-page upload flow must expose the device camera directly.");
  assert.match(importModalSource, />\s*Take photo\s*</, "The full-page upload flow must lead with direct CTA buttons.");
  assert.match(globalStyles, /Final responsive overrides[\s\S]*\.modal-backdrop--import-fullscreen \.accounts-import-modal \{[\s\S]{0,240}height: 100dvh;/, "The upload surface must fill the viewport.");
  assert.match(globalStyles, /@media \(max-width: 360px\), \(max-height: 560px\)/, "Clover must support narrow effective viewports and enlarged device text.");
  assert.match(
    globalStyles,
    /html:has\(\.landing-page\) \{[\s\S]{0,100}overflow-y: auto;[\s\S]{0,100}body:has\(\.landing-page\) \{[\s\S]{0,80}overflow: visible !important;/,
    "Every public landing and feature page must use one document scroll root on mobile.",
  );
  assert.doesNotMatch(
    globalStyles,
    /html:has\(\.landing-page--snap\)/,
    "Landing-page scrolling must not be limited to the home-page variant.",
  );
  assert.match(globalStyles, /\.content--notifications \.content-body \{[\s\S]{0,120}margin-inline: -18px;/, "Notifications must use the full mobile content width.");
  assert.match(transientRecoverySource, /MAX_AUTOMATIC_RETRIES = 3/, "Transient Home failures must retry before presenting a persistent recovery state.");
  assert.match(transientRecoverySource, /addEventListener\("online", retryWhenAvailable\)/, "Home recovery must resume when a mobile connection returns.");
  assert.match(notificationsSource, /className="notifications-layout"/, "The Notifications route must retain its shared full-width layout hook.");
  assert.match(rootLayoutSource, /<head>[\s\S]{0,240}<script[\s\S]{0,160}id="clover-theme-bootstrap"/, "The theme bootstrap must remain inside the document head.");
  assert.doesNotMatch(rootLayoutSource, /<\/body>[\s\S]{0,200}<Script/, "Root scripts must not render outside the document body.");
  assert.match(publicAccountActionsSource, /if \(!accountState\?\.signedIn\)[\s\S]{0,900}return <SignedInPublicAccountActions/, "Signed-out public pages must not call Clerk hooks without a provider.");

  assert.match(reportsSource, /report-list--merchant-table/, "Biggest Merchants must use compact table-style rows.");
  assert.match(reportsSource, /report-list__item--ranked-merchant report-list__item--merchant-table/, "Merchant ranks must remain in the left-hand grid column.");
  assert.match(reportsSource, /CategoryBrandMark categoryName=\{merchant\.categoryName\}/, "Biggest Merchants must show the dominant category icon.");
  assert.match(globalStyles, /\.report-list__item--merchant-table \{[\s\S]*grid-template-columns: 30px minmax\(0, 1fr\)/, "Merchant rows must keep a compact rank and detail layout.");

  assert.match(
    reportsSource,
    /const weeklyTrendBuckets = getRollingWeekBuckets\(currentWindowEnd\)/,
    "Reports Trends must prepare recent weekly comparison periods without another data request.",
  );
  assert.match(
    reportsSource,
    /points=\{weeklyTrendPoints\}[\s\S]{0,160}label="Recent weekly summary"/,
    "The Weekly Summary must render its recent income and expense chart.",
  );
  assert.match(
    reportsSource,
    /points=\{monthlyTrendPoints\}[\s\S]{0,160}label="Recent monthly summary"/,
    "The Monthly Summary must render its recent income and expense chart.",
  );
  assert.equal(
    reportsSource.match(/className="button button-primary button-small reports-trend-open-button"/g)?.length,
    2,
    "Weekly and Monthly Summary links must use the shared compact blue button treatment.",
  );
  assert.match(
    reportsPeriodChartSource,
    /reports-period-chart__bar--income[\s\S]{0,500}reports-period-chart__bar--expense/,
    "Report period charts must keep income and expense in separate bars.",
  );
  assert.match(
    globalStyles,
    /@media \(max-width: 700px\) \{[\s\S]{0,900}\.reports-period-chart__plot/,
    "Report period charts must have a compact mobile layout.",
  );
  const protectedPageSources = await Promise.all(
    [
      "app/adviser/page.tsx",
      "app/budgeting/page.tsx",
      "app/goals/page.tsx",
      "app/profile/page.tsx",
      "app/recurring/page.tsx",
      "app/reports/reports-page-content.tsx",
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
    /className=\{`shell-mobile-more-link[\s\S]{0,500}aria-expanded=\{isSidebarOpen\}[\s\S]{0,160}aria-controls="primary-navigation"/,
    "Mobile headers must expose the vertical primary navigation from a stable leading burger control."
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
    /@media \(min-width: 1101px\) \{[\s\S]{0,180}\.accounts-card-grid\.accounts-card-grid--desktop \{[\s\S]{0,180}grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);[\s\S]{0,120}gap: 8px;/,
    "Desktop account cards must follow the same responsive four-column width as the summary cards."
  );
  assert.match(
    globalStyles,
    /\.accounts-card-grid--desktop \.accounts-card-drag-shell \{[\s\S]{0,80}max-width: none;/,
    "Desktop account card wrappers must fill their responsive grid columns."
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
    accountDetailsSource,
    /editableName=\{account\.type === "investment" \? undefined : account\.name\}[\s\S]{0,500}onNameCommit=/,
    "Account identity fields must be editable directly on the account card."
  );
  assert.doesNotMatch(
    accountDetailsSource,
    /className="accounts-detail__account-identity-editor--inline"|className="accounts-detail__account-identity-close"/,
    "Account identity editing must not restore the redundant editor container or Close action."
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
  assert.match(
    rootLayoutSource,
    /<ModalKeyboardController \/>/,
    "Every route must mount the shared modal keyboard controller."
  );
  assert.match(
    modalKeyboardSource,
    /event\.key === "Escape"[\s\S]{0,300}findDismissControl\(modal\)[\s\S]{0,300}closeControl\.click\(\)/,
    "Escape must dismiss the topmost modal through its own close action."
  );
  assert.match(
    modalKeyboardSource,
    /event\.key !== "Enter" && event\.key !== " "[\s\S]{0,500}\[role="button"\][\s\S]{0,500}customButton\.click\(\)/,
    "Enter and Space must activate custom modal buttons just like native buttons."
  );
  assert.match(
    commitmentsSource,
    /className="panel glass recurring-add-modal__card recurring-suggestion-review-modal"[\s\S]{0,300}role="dialog"[\s\S]{0,500}data-modal-close/,
    "Recurring suggestion review must use Clover's visible, keyboard-dismissible modal structure."
  );
  assert.match(
    investmentsSource,
    /mobileSubheader=\{renderInvestmentTabs\(true\)\}[\s\S]{0,1200}ariaLabel="Select investment currency"/,
    "The shared Investments mobile header must keep an accessible currency selector and a separate sub-header."
  );
  assert.match(
    investmentMarketSource,
    /className="investments-market__range-select"[\s\S]{0,240}<select value=\{range\}/,
    "Mobile Markets must expose one compact time-period selector."
  );
  assert.match(
    globalStyles,
    /\.content--investments \.investments-portfolio-table__header \{[\s\S]{0,140}position: sticky;[\s\S]{0,180}background: var\(--surface\);/,
    "Mobile portfolio filters must stay sticky with an opaque theme-aware background."
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
    /\.dashboard-home__report-flow-segment\[data-edge="only"\] \{[\s\S]{0,80}border-radius: 4px;/,
    "Single-value Home report bars must keep compact rounded edges."
  );
  assert.match(
    globalStyles,
    /\.dashboard-home__report-flow-segment\[data-edge="bottom"\][\s\S]{0,180}\.dashboard-home__report-flow-segment\[data-edge="top"\]/,
    "Mixed Home report bars must round only the outside edges of one continuous stack."
  );
  assert.match(
    dashboardSource,
    /days\.map\(\(day\) => day\.income \+ day\.expense\)[\s\S]{0,1800}\.filter\(\(segment\) => segment\.value > 0\)/,
    "Home report bars must scale combined daily movement and omit empty colored segments."
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
    /@media \(max-width: 1100px\) \{[\s\S]{0,500}\.accounts-card-grid\.accounts-card-grid--desktop \{[\s\S]{0,80}display: none !important;[\s\S]{0,240}\.accounts-mobile-list,[\s\S]{0,120}display: grid !important;/,
    "Accounts must switch its desktop cards and mobile list together at the shared mobile breakpoint."
  );
  assert.match(
    accountsSource,
    /aria-expanded=\{isExpanded\}[\s\S]{0,220}setExpandedMobileAccount\(rowKey\)/,
    "Mobile account rows must expose an accessible vertical accordion interaction."
  );
  assert.match(
    accountsSource,
    /MOBILE_EXPANDED_ACCOUNT_STORAGE_KEY[\s\S]{0,1800}sessionStorage\.getItem\(storageKey\)/,
    "Mobile Accounts must remember the expanded row for each workspace and currency."
  );
  assert.doesNotMatch(
    accountsSource,
    /favoriteKey|leftFavorite|rightFavorite/,
    "Accounts must use value-based ordering rather than a separate favorites hierarchy."
  );
  assert.match(
    accountsSource,
    /comparableValue[\s\S]{0,700}valueDifference/,
    "Desktop and mobile account sections must place their highest-value cards first."
  );
  assert.match(
    globalStyles,
    /\.accounts-mobile-list-item__reveal \{[\s\S]{0,500}grid-template-rows: 0fr;[\s\S]{0,800}\.accounts-mobile-list-item\.is-expanded \.accounts-mobile-list-item__reveal \{[\s\S]{0,120}grid-template-rows: 1fr;/,
    "Mobile account drawers must animate between collapsed and expanded states."
  );
  assert.doesNotMatch(
    accountsSource,
    /Favorite accounts carousel/,
    "Mobile Accounts must not restore the duplicate horizontal favorites carousel."
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
    /\.settings-hub__menu-item \{[\s\S]{0,260}font-family: var\(--font-body\);[\s\S]{0,100}font-size: 14px;[\s\S]{0,80}font-weight: 400;/,
    "Settings navigation must inherit the primary menu's font family and regular weight."
  );
  assert.match(
    globalStyles,
    /@media \(min-width: 1101px\) \{[\s\S]{0,220}\.settings-hub__menu-item \{[\s\S]{0,180}min-height: 32px;[\s\S]{0,80}height: 32px;[\s\S]{0,100}padding: 0 5px;[\s\S]{0,80}gap: 8px;[\s\S]{0,80}font-size: 13px;/,
    "Desktop Settings rows must share the primary sidebar's size, padding, and spacing."
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
    /\.accounts-detail__transactions \.accounts-detail__mobile-transaction-name \{[\s\S]{0,120}grid-template-columns: 20px minmax\(0, 1fr\) !important;/,
    "Account Details must retain its compact single-badge mobile transaction layout."
  );
  assert.match(
    globalStyles,
    /\.accounts-detail__transactions \.accounts-detail__mobile-transaction-name \.transactions-mobile-simple-row__name-main \{[\s\S]{0,180}white-space: normal;[\s\S]{0,80}overflow-wrap: anywhere;/,
    "Account Details must show complete mobile transaction names instead of truncating them."
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
  assert.match(
    globalStyles,
    /Final mobile shell alignment[\s\S]{0,1800}\.content--plain-title > \.topbar \.topbar__title-wrap,[\s\S]{0,700}grid-column: 2 !important;[\s\S]{0,260}justify-self: center !important;/,
    "Plain mobile page names must remain centered in the header's middle grid column despite asymmetric controls."
  );
  assert.match(
    globalStyles,
    /Mobile pages with subtabs[\s\S]{0,2400}\.content--has-title-addon > :is\(\.topbar, \.shell-compact-bar\) \.topbar__title-row \{[\s\S]{0,320}align-items: center !important;[\s\S]{0,180}flex-wrap: nowrap !important;/,
    "Tabbed mobile headers must keep the page title and subtabs aligned in one row."
  );
  assert.match(
    globalStyles,
    /Mobile pages with subtabs[\s\S]{0,4200}\.content--has-title-addon \.topbar__title-addon :is\([\s\S]{0,220}\.circles-title-tabs[\s\S]{0,500}overflow-x: auto !important;[\s\S]{0,180}flex-wrap: nowrap !important;[\s\S]{0,180}-webkit-mask-image: none !important;/,
    "Tabbed mobile headers must expose every available subtab in an unfaded horizontal scroller."
  );
  assert.match(
    globalStyles,
    /\.transactions-mobile-simple-row \{[\s\S]{0,100}border-top: 0\.5px solid rgba\(148, 163, 184, 0\.24\);/,
    "Mobile transaction separators must use a light hairline treatment."
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
