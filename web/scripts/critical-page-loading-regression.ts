import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  guessCategoryName,
  inferAccountTypeFromStatement,
} from "../lib/financial-classification";
import "./in-app-notifications-regression";
import { FEATURE_STORIES } from "../lib/feature-stories";
import { FEATURE_LINKS, FEATURE_PAGE_MAP, resolveFeatureSlug } from "../lib/public-site";
import { landingScenePosition, featurePhotoPosition } from "../lib/landing-motion";

for (const position of [0, .5, .75, 1, 1.25, 1.5]) assert.equal(landingScenePosition(position), 0);
for (const position of [6, 6.5, 6.75, 7, 7.25, 7.5]) assert.equal(landingScenePosition(position), 5);
for (const position of [2, 2.5, 2.75, 3, 3.25, 3.5]) assert.equal(featurePhotoPosition(position, true), 2);
assert.equal(landingScenePosition(8), 7);
assert.equal(featurePhotoPosition(4, true), 4);
assert.equal(featurePhotoPosition(3, false), 3);

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const rootLayoutSource = readSource("app/layout.tsx");
const globalStylesSource = readSource("app/globals.css");
assert.match(rootLayoutSource, /import \{ Poppins, Raleway \} from "next\/font\/google"/);
assert.doesNotMatch(globalStylesSource, /fonts\.googleapis\.com/);

const shellSource = readSource("components/clover-shell.tsx");
const settingsHubSource = readSource("components/settings-hub.tsx");
const avatarEditorSource = readSource("components/user-avatar-editor.tsx");
assert.match(shellSource, /const loadImportFilesModal = \(\) =>[\s\S]{0,100}import\("@\/components\/import-files-modal"\)/);
assert.match(shellSource, /const ImportFilesModal = dynamic\(\s*loadImportFilesModal/);
assert.match(shellSource, /onPointerEnter=\{\(\) => \{[\s\S]{0,350}loadDashboardManualTransactionModal\(\)[\s\S]{0,120}loadImportFilesModal\(\)/);
assert.doesNotMatch(shellSource, /^import \{ ImportFilesModal \} from "@\/components\/import-files-modal";/m);
assert.doesNotMatch(shellSource, /^import \{ DashboardManualTransactionModal \} from "@\/components\/dashboard-top-actions";/m);
assert.doesNotMatch(shellSource, /window\.location\.assign\(href\)/, "Sidebar navigation must stay inside the App Router.");
assert.doesNotMatch(shellSource, /prefetchCoreRoutes/, "The shell must not issue a burst of dynamic route requests on every mount.");
assert.match(shellSource, /const clientRouteWarmups = \["\/accounts", "\/transactions", "\/investments"\]/);
assert.doesNotMatch(shellSource, /clientRouteWarmups = \[[^\]]*"\/recurring"/);
assert.match(
  shellSource,
  /function NotificationCountBadge[\s\S]{0,350}?count > 99 \? "99\+" : count/,
  "Notification counts should use one capped badge across header and sidebar surfaces."
);
assert.match(
  shellSource,
  /sidebar-notifications-button[\s\S]{0,500}?<NotificationCountBadge count=\{notificationCount\} \/>/,
  "The persistent notification button should show the live notification count."
);
assert.match(
  shellSource,
  /href="\/settings"[\s\S]{0,220}sidebar-footer__settings[\s\S]{0,500}<MenuIcon name="settings" \/>/,
  "Desktop Settings must remain directly accessible beside the profile control.",
);
const profileMenuStart = shellSource.indexOf('className="sidebar-popover sidebar-popover--profile"');
const profileMenuEnd = shellSource.indexOf("\n          ) : null}", profileMenuStart);
assert.ok(profileMenuStart >= 0 && profileMenuEnd > profileMenuStart, "The desktop Profile menu must be present.");
const profileMenuSource = shellSource.slice(profileMenuStart, profileMenuEnd);
assert.match(profileMenuSource, /href="\/settings\?section=account"/);
assert.match(profileMenuSource, /<MenuIcon name="profile" \/>[\s\S]{0,120}<span>Account<\/span>/);
assert.match(profileMenuSource, /<span>Log Out<\/span>/);
assert.doesNotMatch(
  profileMenuSource,
  /<span>Settings<\/span>/,
  "Settings belongs in the desktop footer row instead of the Profile submenu.",
);
assert.match(
  settingsHubSource,
  /avatarUrl=\{user\?\.imageUrl \?\? avatarUrl\}/,
  "Settings Account must prefer the live authenticated profile photo over a stale cached image.",
);
assert.match(
  settingsHubSource,
  /onAvatarChange=\{\(nextAvatarUrl\) => \{[\s\S]{0,260}setAvatarUrl\(nextAvatarUrl\)[\s\S]{0,260}writeAccountIdentityCache/,
  "Settings Account must synchronize profile photo changes with its visible and cached identity.",
);
assert.match(
  avatarEditorSource,
  /const resolvedAvatarUrl = user\?\.imageUrl \?\? avatarUrl;/,
  "The account photo editor must display the current authenticated photo when available.",
);
assert.match(
  avatarEditorSource,
  /const reloadedUser = await user\.reload\(\);[\s\S]{0,120}onAvatarChange\?\.\(reloadedUser\.imageUrl \?\? null\)/,
  "Photo uploads must notify Settings with the refreshed authenticated image URL.",
);
assert.match(
  globalStylesSource,
  /\.notification-count-badge\s*\{[^}]*position:\s*absolute;[^}]*top:\s*-2px;[^}]*right:\s*-3px;/s,
  "The notification count should sit at the top-right of its button."
);

const clerkSource = readSource("lib/clerk.ts");
const userContextSource = readSource("lib/user-context.ts");
const reportsSource = readSource("app/reports/reports-page-content.tsx");
const reportsRangeSource = readSource("components/reports-range-menu.tsx");
const reportsCurrencySource = readSource("components/reports-currency-filter.tsx");
assert.match(clerkSource, /unstable_cache/);
assert.match(clerkSource, /clover-clerk-user-v1/);
assert.match(userContextSource, /clerkUser\.authoritative/);
assert.match(
  userContextSource,
  /const \[clerkUser, existing\][\s\S]{0,260}Promise\.all/,
  "Authenticated entry should load the Clerk identity and existing database user in parallel.",
);
assert.match(
  reportsSource,
  /const \[[\s\S]{0,220}parsedReportRowCandidates[\s\S]{0,520}Promise\.all/,
  "Report transactions and parsed-row fallbacks should load in parallel for fast filter changes.",
);
assert.match(
  reportsRangeSource,
  /window\.location\.replace\(`\$\{pathname\}\?\$\{params\.toString\(\)\}`\)/,
  "Report range changes should use the fast document handoff instead of a slow RSC replacement.",
);
assert.doesNotMatch(reportsRangeSource, /router\.replace/);
assert.match(
  reportsCurrencySource,
  /window\.location\.replace\(query \? `\$\{targetPath\}\?\$\{query\}` : targetPath\)/,
  "Report currency changes should use the fast document handoff instead of a slow RSC replacement.",
);
assert.doesNotMatch(reportsCurrencySource, /router\.replace/);
assert.match(
  reportsSource,
  /parsedReportRowCandidates\.filter\([\s\S]{0,140}!normalizedImportFileIds\.has/,
  "Parallel report reads must still exclude parsed-row fallbacks once an import has normalized transactions.",
);
assert.match(
  userContextSource,
  /after\(async \(\) => \{[\s\S]{0,180}reconcileBillingPlanTier/,
  "Billing consistency maintenance must not block authenticated page rendering.",
);

const dashboardSource = readSource("components/dashboard-page-content.tsx");
const homePageSource = readSource("app/home/page.tsx");
const balanceVisibilitySource = readSource("components/balance-visibility-toggle.tsx");
const homeReviewLauncherSource = readSource("components/home-transaction-review-launcher.tsx");
assert.match(dashboardSource, /DashboardTopActionsLazy/);
assert.doesNotMatch(dashboardSource, /from "@\/components\/dashboard-top-actions";/);
assert.doesNotMatch(
  dashboardSource,
  /RouteSplash|<Suspense fallback=\{<DashboardStreamFallback \/>\}>/,
  "Home must rely on its route-level loading boundary so custom async trees cannot race hydration.",
);
assert.match(dashboardSource, /export async function DashboardPageContent\(\) \{[\s\S]{0,80}return DashboardPageStream\(\)/);
assert.match(
  homePageSource,
  /export default async function HomePage[\s\S]{0,200}return DashboardPageContent\(\)/,
  "The Home route must await its server tree inside the standard segment loading boundary.",
);
assert.match(dashboardSource, /const todayStart = toDayStart\(now\)/);
assert.doesNotMatch(dashboardSource, /activityAnchorDate/);
assert.match(dashboardSource, /Weekly Report/);
assert.match(dashboardSource, /Monthly Report/);
assert.match(dashboardSource, /Recorded spending in the past 7 days/);
assert.match(dashboardSource, /Recorded spending in the past 30 days/);
assert.match(
  dashboardSource,
  /const monthlyFlow = buildDailyFlow\(currentThirtyDayTransactions, thirtyDaysAgo, 30, \{ day: "numeric" \}\)/,
  "The Monthly Report chart must represent a rolling 30-day window.",
);
assert.match(
  dashboardSource,
  /Monthly Report[\s\S]{0,350}formatCurrency\(rollingThirtyDaySummary\.expense/,
  "The Monthly Report total must use the rolling 30-day summary.",
);
assert.match(dashboardSource, /plannedPaymentsDueSoon\.length === 1 \? "payment is" : "payments are"/);
assert.ok(
  dashboardSource.indexOf('aria-label="Week and month snapshot"') < dashboardSource.indexOf('<OnboardingMissions surface="home" />'),
  "Next Steps should appear below the weekly and monthly reports.",
);
assert.ok(
  dashboardSource.indexOf('<OnboardingMissions surface="home" />') < dashboardSource.indexOf("<DashboardBudgetPulse />"),
  "Next Steps should appear above Budgeting.",
);
assert.match(
  globalStylesSource,
  /\.dashboard-home__report-card h4\s*\{[^}]*font-family:\s*var\(--font-body\)/s,
  "Weekly and monthly report totals should use Clover's standard numeric font",
);
assert.match(dashboardSource, /monthlyTimelineDays/);
assert.match(dashboardSource, /dashboard-home__report-flow-tooltip/);
assert.match(dashboardSource, /function HomeSensitiveAmount/);
assert.match(dashboardSource, /home-sensitive-amount__mask/);
assert.match(
  dashboardSource,
  /label: "Balance in view"[\s\S]{0,220}<HomeSensitiveAmount/,
  "The Home Adviser must respect amount privacy for monetary insights.",
);
assert.match(
  dashboardSource,
  /Weekly Report[\s\S]{0,240}<h4><HomeSensitiveAmount/,
  "The weekly report total must respect the Home amount toggle.",
);
assert.match(
  dashboardSource,
  /Monthly Report[\s\S]{0,240}<h4><HomeSensitiveAmount/,
  "The monthly report total must respect the Home amount toggle.",
);
assert.match(balanceVisibilitySource, /applyHomeAmountVisibility/);
assert.match(
  homeReviewLauncherSource,
  /toLocaleDateString\("en-PH", \{[\s\S]{0,140}timeZone: "UTC"/,
  "Home review dates must use one time zone on the server and client to avoid hydration mismatches.",
);
assert.match(balanceVisibilitySource, /M4 14c2\.2-2\.5 4\.9-3\.8 8-3\.8s5\.8 1\.3 8 3\.8/);
assert.doesNotMatch(balanceVisibilitySource, /balance-visibility-slash|m4 4 16 16/i);
assert.match(
  globalStylesSource,
  /body\[data-clover-home-balances-hidden\] \.home-sensitive-amount__actual\s*\{[^}]*display:\s*none/s,
);
assert.match(
  globalStylesSource,
  /\.dashboard-home__hero--balance\s*\{[^}]*position:\s*sticky;[^}]*top:\s*82px;[^}]*overflow:\s*visible;/s,
  "My Balance should remain at its initial desktop offset instead of shifting into the header.",
);
assert.match(
  globalStylesSource,
  /\.dashboard-home__hero--balance::after\s*\{[^}]*height:\s*14px;[^}]*linear-gradient/s,
  "Content passing beneath My Balance should receive a shallow fade treatment.",
);
assert.match(
  globalStylesSource,
  /\.dashboard-home__hero--balance::before\s*\{[^}]*bottom:\s*100%;[^}]*height:\s*20px;[^}]*background:\s*var\(--surface\);/s,
  "Content passing above My Balance should be fully hidden across the header gap.",
);
assert.match(
  globalStylesSource,
  /@media \(max-width:\s*1100px\)[\s\S]*?\.dashboard-home__hero--balance\s*\{[^}]*top:\s*84px;/,
  "My Balance should remain below the mobile header and its original page gap.",
);
assert.match(
  globalStylesSource,
  /body\[data-clover-home-balances-hidden\] \.home-sensitive-amount__mask\s*\{[^}]*display:\s*inline/s,
);
assert.match(
  globalStylesSource,
  /\.home-sensitive-amount > \.home-sensitive-amount__mask\s*\{[^}]*display:\s*none/s,
  "Report metric layout styles must not reveal the amount mask while values are visible.",
);
assert.match(dashboardSource, /after\(async \(\) => \{[\s\S]{0,250}repairWorkspaceDataVisibility/);

const recurringPageDataSource = readSource("lib/recurring-page.ts");
assert.match(recurringPageDataSource, /after\(async \(\) => \{[\s\S]{0,450}syncWorkspaceRecurringPatterns/);
assert.match(recurringPageDataSource, /transactions: serializedTransactions\.slice\(0, 24\)/);

const globalImportActivitySource = readSource("components/global-import-activity.tsx");
assert.match(
  globalImportActivitySource,
  /const \[activity, setActivity\] = useState<ImportActivitySnapshot \| null>\(null\)/,
  "Global import activity must hydrate from a deterministic empty state.",
);
assert.match(
  shellSource,
  /const \[notifications, setNotifications\] = useState<InAppNotification\[]>\(\[\]\)/,
  "The shared shell must hydrate notifications from a deterministic empty state.",
);

const reportsTabsSource = readSource("components/reports-tabs.tsx");
assert.match(
  reportsTabsSource,
  /const \[activeSection, setActiveSection\] = useState<ReportsSection>\(initialSection\)/,
  "Reports must hydrate the server-selected tab before restoring session state.",
);

const lazyActionsSource = readSource("components/dashboard-top-actions-lazy.tsx");
assert.match(lazyActionsSource, /dynamic\(\s*\(\) => import\("@\/components\/dashboard-top-actions"\)/);
assert.match(lazyActionsSource, /dynamic\(\s*\(\) => import\("@\/components\/import-files-modal"\)/);

const accountsSource = readSource("app/accounts/page.tsx");
assert.match(accountsSource, /awaitHydration: !hydratedFromCache/);
assert.match(
  accountsSource,
  /const cachedWorkspaceId = readSelectedWorkspaceId\(\);[\s\S]{0,240}hydrateWorkspaceFromCache\(cachedWorkspaceId\);[\s\S]{0,120}void loadWorkspaces\(\);/,
  "Accounts must paint its cached workspace before waiting for the workspace request.",
);
assert.doesNotMatch(accountsSource, /from "@\/lib\/import-parser"/);

const accountDetailsSource = readSource("app/accounts/[accountId]/page.tsx");
const transactionsSource = readSource("app/transactions/page.tsx");
const transactionDisplaySource = readSource("lib/transaction-display.ts");
const importOptimisticSummarySource = readSource("lib/import-optimistic-summary.ts");
const importStatementIdentitySource = readSource("lib/import-statement-identity.ts");
for (const source of [
  accountDetailsSource,
  transactionsSource,
  transactionDisplaySource,
  importOptimisticSummarySource,
  importStatementIdentitySource,
]) {
  assert.doesNotMatch(source, /from "@\/lib\/import-parser"/);
}

assert.equal(inferAccountTypeFromStatement("PayPal", "PayPal"), "wallet");
assert.equal(inferAccountTypeFromStatement("RCBC", "RCBC Visa Platinum"), "credit_card");
assert.equal(inferAccountTypeFromStatement("Maya", "Maya Savings"), "bank");
assert.equal(inferAccountTypeFromStatement("PDAX", "PDAX Portfolio"), "investment");
assert.equal(guessCategoryName("Service Navigo Paris", "expense"), "Transport");
assert.equal(guessCategoryName("OpenAI ChatGPT", "expense"), "Bills & Utilities");

const featuresSource = readSource("app/features/page.tsx");
const featureDetailSource = readSource("app/features/[slug]/page.tsx");
const featureStoriesSource = readSource("lib/feature-stories.ts");
const featureStorySource = readSource("components/feature-story.tsx");
assert.equal(FEATURE_STORIES.length, 6);
assert.equal(FEATURE_LINKS.length, 6);
assert.equal(FEATURE_LINKS.find(link => link.href === "/features/plan-ahead")?.products, "Investments · Budgeting · Goals");
assert.deepEqual(FEATURE_STORIES.find(story => story.slug === "plan-ahead")?.chapters.map(chapter => chapter.id), ["overview", "investments", "budgeting", "goals", "start"]);
assert.deepEqual(FEATURE_PAGE_MAP.get("plan-ahead")?.sections.map(section => section.id), ["investments", "budgeting", "goals"]);
for (const story of FEATURE_STORIES) {
  assert.equal(story.chapters.length, 5);
  assert.equal(new Set(story.chapters.map(chapter => chapter.id)).size, 5);
  assert.equal(FEATURE_LINKS.find(link => link.href === `/features/${story.slug}`)?.products, story.products);
  for (const scene of ["hero", "hero-mobile", "end", "end-mobile"]) {
    assert.ok(existsSync(resolve(process.cwd(), "../assets/feature-stories", `${story.asset}-${scene}.webp`)));
  }
}
assert.equal(resolveFeatureSlug("gain-insights"), "understand-your-money");
assert.equal(resolveFeatureSlug("grow-together"), "manage-money-together");
assert.equal(resolveFeatureSlug("split-bills"), "manage-money-together");
assert.match(featureDetailSource, /<FeatureStory /);
assert.match(featureDetailSource, /permanentRedirect/);
for (const slug of ["manage-money", "understand-your-money", "plan-ahead", "manage-money-together", "security", "pro"]) {
  assert.ok(featureStoriesSource.includes(`slug: "${slug}"`), `Missing feature story: ${slug}`);
}
assert.match(featureStorySource, /prefers-reduced-motion/);
assert.match(featureStorySource, /draggable=\{false\}/);
assert.match(featureStorySource, /aria-current/);
assert.match(featureStorySource, /hashchange/);
assert.doesNotMatch(featureStorySource, /data-eyebrow|data-products/);
assert.match(readSource("components/feature-story-demo.tsx"), /<LandingTransactionPhone market=\{market\}/);
const publicJourneyHeaderSource = readSource("app/landing-preview/landing-journey.tsx");
assert.match(publicJourneyHeaderSource, /featuresRef\.current\?\.contains\(target\)/);
assert.match(publicJourneyHeaderSource, /addEventListener\("pointerdown", closeMenus\)/);
assert.doesNotMatch(readSource("components/feature-story-demo.tsx"), /fetch\(|localStorage|useUser\(/);
const helpSource = readSource("app/help/page.tsx");
const landingSource = readSource("app/page.tsx");
const landingCtaSource = readSource("components/landing-cta-actions.tsx");
assert.match(featuresSource, /permanentRedirect\("\/"\)/);
assert.doesNotMatch(featureDetailSource, /resolvePublicAccountState/);
assert.match(featureDetailSource, /title: page\.navLabel/);
assert.doesNotMatch(featureDetailSource, /page\.navLabel\} \| Clover/);
assert.match(helpSource, /title: "Help Center"/);
assert.doesNotMatch(helpSource, /title: "Help Center \| Clover"/);
assert.doesNotMatch(
  landingSource,
  /resolvePublicAccountState/,
  "The landing hero must not wait for server-side account synchronization before it can paint.",
);
assert.doesNotMatch(
  helpSource,
  /resolvePublicAccountState/,
  "Help content must not wait for server-side account synchronization before it can paint.",
);
assert.match(
  landingCtaSource,
  /<a className="button button-primary button-pill landing-account-cta" href="\/home">/,
  "Signed-in public CTAs should cross into Clover with a direct document request instead of a slow RSC transition.",
);
assert.doesNotMatch(
  landingCtaSource,
  /landing-account-cta" href="\/continue"/,
  "The visible Open Clover CTA must not add an intermediate redirect request.",
);

const adviserSource = readSource("app/adviser/page.tsx");
const adviserLoadingSource = readSource("app/adviser/loading.tsx");
const budgetingDataSource = readSource("lib/budgeting-data.ts");
const serverPageErrorSource = readSource("lib/server-page-error.ts");
assert.doesNotMatch(adviserSource, /accounts:\s*\{[\s\S]{0,900}transactions:\s*\{/);
assert.doesNotMatch(adviserSource, /<ReportsStream/, "Adviser must remain chat-first instead of embedding Reports.");
assert.match(adviserLoadingSource, /CloverRouteLoadingScreen label="adviser" prompt/);
assert.doesNotMatch(shellSource, /const coreRoutes = \[[^\]]*"\/adviser"/);
assert.match(adviserSource, /statementCheckpoints:[\s\S]{0,500}take: 1/);
assert.match(adviserSource, /Keep Adviser[\s\S]{0,250}reads in pairs/);
assert.doesNotMatch(
  adviserSource,
  /const \[\s*allTransactionsQuery,[\s\S]{0,250}manualAccountTransactions[\s\S]{0,80}= await Promise\.all/,
);
assert.match(budgetingDataSource, /Keep each batch within Clover's Vercel database pool limit/);
assert.doesNotMatch(
  budgetingDataSource,
  /const \[budgets, transactions, categories, accounts, commitments\] = await Promise\.all/,
);
assert.match(serverPageErrorSource, /\[clover:server-page-error\]/);

const errorBoundarySource = readSource("app/error.tsx");
const errorScreenSource = readSource("components/error-recovery-screen.tsx");
const adminErrorLogsSource = readSource("components/admin-error-logs-table.tsx");
assert.doesNotMatch(errorBoundarySource, /<p>\{error\.message\}<\/p>/);
assert.match(errorBoundarySource, /message: error\.message/);
assert.match(errorBoundarySource, /errorCode/);
assert.match(errorScreenSource, /Something went wrong/);
assert.match(errorScreenSource, /Refresh page/);
assert.match(errorScreenSource, /\/assets\/error-clover\.webp/);
assert.match(adminErrorLogsSource, /Frontend reference/);

const commitmentsSource = readSource("components/commitments-panel.tsx");
assert.match(commitmentsSource, /Why Clover suggested this/);
assert.match(commitmentsSource, /<span>Paid to<\/span>/);
assert.match(commitmentsSource, /<span>Currency<\/span>/);
assert.match(commitmentsSource, /recurring-overview-review-button/);
assert.match(commitmentsSource, /Review suggestions/);
assert.match(commitmentsSource, /Detected transactions/);
assert.doesNotMatch(commitmentsSource, /Next 30 days/i);
assert.doesNotMatch(commitmentsSource, /Add this to Recurring\?/);
assert.doesNotMatch(commitmentsSource, /overviewStats\.upcoming\.length\} scheduled/);
assert.doesNotMatch(commitmentsSource, /overviewStats\.activeCount\} active/);
assert.doesNotMatch(
  commitmentsSource,
  /actionablePlannedPaymentSuggestions\.length \+ suggestedRecurringPatterns\.length/,
);

console.log("Critical page loading regression passed.");
