import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [shell, styles, navigationIcons, animatedTabs, reportsPage, recurringPage, investmentsPage, transactionsPage] = await Promise.all([
    readSource("components/clover-shell.tsx"),
    readSource("app/globals.css"),
    readSource("lib/navigation-icons.ts"),
    readSource("components/animated-tabs.tsx"),
    readSource("app/reports/reports-page-content.tsx"),
    readSource("components/recurring-page-client.tsx"),
    readSource("app/investments/page.tsx"),
    readSource("app/transactions/page.tsx"),
  ]);

  assert.match(recurringPage, /className="recurring-desktop-adviser"><ContextualAskClover/, "Recurring's desktop Adviser needs a separately hidden mobile wrapper.");
  assert.match(styles, /\.recurring-desktop-adviser \{ display: none !important; \}/);
  assert.match(styles, /\.split-bill-home > \.split-bill-pulse \{ display: none; \}/, "Split Bills summaries must be hidden on mobile.");
  assert.match(await readSource("components/split-bill-action-buttons.tsx"), /aria-label="Add split bill"/, "Split Bills must participate in the shared circular mobile Add controls.");
  assert.doesNotMatch(styles, /\.content--investments \.topbar-actions \.currency-selector__trigger-(?:token|all)[^{]*\{\s*display: none/, "Investment currency symbols must not be hidden.");

  assert.match(
    shell,
    /className=\{`shell-mobile-more-link[\s\S]{0,300}aria-expanded=\{isSidebarOpen\}[\s\S]{0,160}aria-controls="primary-navigation"/,
    "The mobile header burger must control the primary navigation drawer.",
  );
  assert.match(
    shell,
    /<MenuIcon name="menu" open=\{isSidebarOpen\} \/>/,
    "The burger icon must reflect the drawer's open state.",
  );
  assert.match(
    shell,
    /<button[\s\S]{0,180}className="sidebar-mobile-close"[\s\S]{0,180}<MenuIcon name="menu" open \/>/,
    "The drawer must expose an animated close control.",
  );
  assert.match(
    shell,
    /aria-controls="mobile-settings-drawer"[\s\S]{0,700}<span className="shell-bottom-nav__label">Account<\/span>/,
    "Account must occupy the fifth mobile navigation slot and control the settings drawer.",
  );
  assert.match(shell, /className="sidebar-nav sidebar-nav--mobile"[\s\S]*desktopNavSections\.map/);
  assert.match(shell, /id="mobile-settings-drawer"[\s\S]{0,300}shell-profile-drawer/);
  assert.match(shell, /shell-profile-drawer__account-card[\s\S]{0,500}\{displayName\}/, "The settings drawer must lead with a separate account identity card.");
  assert.match(shell, /shell-bottom-nav__profile-photo[\s\S]{0,250}profileImage/, "The Account tab must show the user's profile photo when available.");
  assert.match(
    shell,
    /document\.addEventListener\("scroll", handleDocumentScroll, \{ passive: true, capture: true \}\)/,
    "Compaction must observe nested page scrollers without blocking scroll performance.",
  );
  assert.match(
    shell,
    /document\.addEventListener\("touchmove", handleTouchMove, \{ passive: false \}\)/,
    "Pull-to-refresh must be able to contain the browser gesture after a vertical pull is recognized.",
  );
  assert.match(
    shell,
    /MOBILE_PULL_REFRESH_THRESHOLD = 54/,
    "Pull-to-refresh must use a reachable release threshold.",
  );
  assert.match(
    shell,
    /deltaY \* 0\.75/,
    "Pull-to-refresh must trigger after a natural mobile gesture rather than an excessive damped distance.",
  );
  assert.match(
    shell,
    /getGestureScrollTop\(target\) > 0 \|\| isMobileGestureBlockedTarget\(target\)/,
    "Pull-to-refresh must not activate inside a scrolled region or an interactive gesture surface.",
  );
  assert.match(
    shell,
    /window\.dispatchEvent\(new CustomEvent\(cloverPullToRefreshEvent,[\s\S]{0,220}router\.refresh\(\)/,
    "A completed pull must notify client data views and refresh the current server route.",
  );
  assert.match(
    shell,
    /touch\.clientX <= MOBILE_EDGE_SWIPE_WIDTH[\s\S]{0,900}kind: "open-sidebar"/,
    "A rightward gesture from the left edge must offer a mobile navigation shortcut.",
  );
  assert.match(
    shell,
    /kind === "close-sidebar" && deltaX <= -MOBILE_SIDEBAR_SWIPE_THRESHOLD[\s\S]{0,120}setIsSidebarOpen\(false\)/,
    "The mobile navigation drawer must close with a leftward swipe.",
  );
  assert.match(shell, /scrollTop - previousScrollTop >= 5[\s\S]{0,100}setIsBottomNavCompact\(true\)/);
  assert.match(shell, /previousScrollTop - scrollTop >= 8[\s\S]{0,100}setIsBottomNavCompact\(false\)/);
  assert.match(
    shell,
    /const isMobileRootRoute = new Set\([\s\S]{0,500}"\/transactions"[\s\S]{0,500}"\/profile"/,
    "Top-level mobile pages must prefer the burger while detail routes retain Back.",
  );

  assert.match(styles, /\.shell-mobile-more-link \{[\s\S]{0,100}display: none;/);
  assert.match(
    styles,
    /@media \(max-width: 1100px\) \{[\s\S]*?\.shell-mobile-more-link \{[\s\S]{0,140}display: inline-flex;/,
  );
  assert.match(
    styles,
    /\.shell-menu-icon\.is-open \.shell-menu-icon__line--top[\s\S]{0,160}rotate\(45deg\)/,
    "The burger lines must animate into a close icon.",
  );
  assert.match(
    styles,
    /\.sidebar-backdrop \{[\s\S]{0,160}opacity: 1;[\s\S]{0,160}transition: opacity 180ms ease/,
    "The mobile drawer must animate over an interactive backdrop.",
  );
  assert.match(
    styles,
    /\.shell-bottom-nav\.is-compact \.shell-bottom-nav__item \{[\s\S]{0,180}min-height: 44px;[\s\S]{0,180}place-content: center;/,
    "Compact mobile navigation must retain accessible touch targets.",
  );
  assert.match(
    styles,
    /\.shell-bottom-nav\.is-compact \.shell-bottom-nav__label \{[\s\S]{0,180}clip-path: inset\(50%\);/,
    "Compact navigation must hide labels visually without removing their accessible names.",
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]{0,500}\.shell-bottom-nav[\s\S]{0,500}transition: none !important;/,
    "Navigation motion must respect reduced-motion preferences.",
  );
  assert.match(
    styles,
    /App-wide mobile gestures[\s\S]{0,1400}\.mobile-pull-refresh--refreshing[\s\S]{0,900}clover-mobile-refresh-spin/,
    "The mobile refresh gesture must provide visible pulling, release, and loading feedback.",
  );
  assert.match(
    styles,
    /@media \(max-width: 1100px\) and \(prefers-reduced-motion: reduce\)[\s\S]{0,260}\.mobile-pull-refresh[\s\S]{0,180}transition: none !important;/,
    "Pull-to-refresh feedback must respect reduced-motion preferences.",
  );
  assert.match(
    navigationIcons,
    /CRITICAL_NAVIGATION_ICON_NAMES[\s\S]{0,500}"profile"/,
    "The Profile artwork must be preloaded with the rest of the primary navigation.",
  );
  assert.match(shell, /shell-quick-add-popover__item--camera[\s\S]{0,500}<strong>Camera<\/strong>/);
  assert.match(shell, /shell-bottom-nav__add\$\{isQuickAddOpen \? " is-open" : ""\}/);
  assert.match(
    styles,
    /\.shell-quick-add-popover \{[\s\S]{0,220}left: 50% !important;[\s\S]{0,500}grid-template-columns: repeat\(2/,
    "The mobile quick-add choices must animate from a compact palette centered on the plus button.",
  );
  assert.match(styles, /\.shell-quick-add-popover__item--camera[\s\S]{0,220}background: var\(--brand-gradient\)/);
  assert.match(
    styles,
    /\.content--plain-title > :is\(\.topbar, \.shell-compact-bar\) \{[\s\S]{0,180}grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\) !important;/,
    "Plain mobile page titles must occupy the center of equal-width header tracks.",
  );
  assert.match(
    styles,
    /\.content > :is\(\.topbar, \.shell-compact-bar\) \{[\s\S]{0,500}width: 100vw !important;[\s\S]{0,220}margin-inline: calc\(50% - 50vw\) !important;/,
    "Mobile headers must cover the viewport edge to edge without inheriting page padding.",
  );
  assert.match(
    styles,
    /\.content--has-title-addon > :is\(\.topbar, \.shell-compact-bar\) \.topbar__title-row > h1 \{[\s\S]{0,220}position: static !important;[\s\S]{0,500}font-size: 14px !important;/,
    "Tabbed mobile page titles must remain inline with their subtabs instead of overlaying them.",
  );
  assert.match(
    styles,
    /\.content--has-title-addon \.topbar__title-addon :is\([\s\S]{0,180}\.reports-top-tabs,[\s\S]{0,180}\.investments-tabs,[\s\S]{0,180}\.recurring-tabs--top,[\s\S]{0,180}\.circles-title-tabs[\s\S]{0,260}font-size: 14px !important;/,
    "Tabbed mobile page titles and subtab labels must share one compact type scale.",
  );
  assert.match(
    styles,
    /Canonical product subtabs and tabbed header alignment[\s\S]{0,1600}font-size: 14px !important;[\s\S]{0,180}font-style: normal !important;[\s\S]{0,180}font-weight: 500 !important;/,
    "Every product subtab must inherit the desktop Investments type contract.",
  );
  assert.match(
    styles,
    /Keep the accessible target while removing the decorative burger circle[\s\S]{0,520}border: 0 !important;[\s\S]{0,180}border-radius: 0 !important;[\s\S]{0,180}background: transparent !important;[\s\S]{0,180}box-shadow: none !important;/,
    "The mobile burger must keep its tap target without rendering a circular container.",
  );
  assert.match(
    styles,
    /Canonical product subtabs and tabbed header alignment[\s\S]{0,7000}grid-template-columns: 44px minmax\(0, 1fr\) auto !important;[\s\S]{0,2200}min-height: 44px !important;[\s\S]{0,1200}align-items: center !important;/,
    "Tabbed mobile headers must reserve stable aligned tracks for navigation, tabs, and actions.",
  );
  assert.match(
    styles,
    /\.content--has-title-addon > :is\(\.topbar, \.shell-compact-bar\) \.topbar__title-row \{[\s\S]{0,420}align-items: center !important;[\s\S]{0,180}flex-wrap: nowrap !important;[\s\S]{0,120}overflow: hidden !important;/,
    "Tabbed mobile headers must keep the page title and subtabs aligned on one row.",
  );
  assert.match(
    styles,
    /\.content--has-title-addon \.topbar__title-addon :is\([\s\S]{0,500}overflow-x: auto !important;[\s\S]{0,160}flex-wrap: nowrap !important;[\s\S]{0,220}-webkit-mask-image: none !important;/,
    "Tabbed mobile headers must expose every subtab through an unfaded horizontal row.",
  );
  assert.match(
    styles,
    /\.content--investments \.investments-mobile-header \{[\s\S]{0,80}display: none !important;/,
    "Investments must use the shared shell header instead of rendering a duplicate mobile header.",
  );
  assert.match(
    styles,
    /Match the compact mobile add action[\s\S]{0,500}\.investments-page__add-button \{[\s\S]{0,180}width: 40px !important;[\s\S]{0,220}border-radius: 50% !important;/,
    "Investments must expose a compact circular plus action on mobile.",
  );
  assert.match(
    styles,
    /\.content--circles \.circles-topbar-action \{[\s\S]{0,260}border-radius: 50% !important;/,
    "Circles must expose a circular mobile plus action.",
  );
  assert.match(
    styles,
    /\.sidebar-nav--mobile \.nav-link \{[\s\S]{0,180}min-height: 44px !important;[\s\S]{0,180}height: 44px !important;[\s\S]{0,220}font-size: 15px !important;/,
    "The mobile drawer rows must provide accessible product tap targets and readable labels.",
  );
  assert.match(
    styles,
    /\.sidebar-nav--mobile \.nav-link__icon \.menu-icon-3d,[\s\S]{0,180}\.menu-icon-3d--home,[\s\S]{0,180}\.menu-icon-3d--adviser[\s\S]{0,180}width: 34px !important;[\s\S]{0,100}height: 34px !important;/,
    "Every mobile drawer icon must use the same footprint as Home.",
  );
  assert.match(
    styles,
    /\.sidebar-nav--mobile \{[\s\S]{0,260}overflow-y: auto !important;/,
    "The larger mobile drawer menu must remain usable on short screens.",
  );
  assert.match(shell, /mobileSubheader\?: ReactNode/);
  assert.match(shell, /className="shell-mobile-subheader"/);
  assert.match(reportsPage, /mobileSubheader=\{<ReportsTopTabs \/>\}/);
  assert.match(recurringPage, /mobileSubheader=\{renderRecurringTabs\(true\)\}/);
  assert.match(investmentsPage, /mobileSubheader=\{renderInvestmentTabs\(true\)\}/);
  assert.match(
    animatedTabs,
    /buttonRect\.left - containerRect\.left \+ container\.scrollLeft/,
    "Animated tab underlines must stay beneath the active tab after horizontal scrolling.",
  );
  assert.match(
    styles,
    /Mobile product chrome:[\s\S]{0,9000}\.shell-mobile-subheader[\s\S]{0,900}flex-direction: column !important/,
    "Mobile product subtabs must use a separate icon-and-label sub-header.",
  );
  assert.match(
    styles,
    /input:not\(\[type="checkbox"\]\)[\s\S]{0,300}textarea,[\s\S]{0,80}select[\s\S]{0,120}font-size: 16px !important/,
    "Mobile editable controls must avoid iOS focus zoom.",
  );
  assert.match(
    styles,
    /\.sidebar \{[\s\S]{0,160}inset: 0 auto 0 0 !important;[\s\S]{0,500}background: #ffffff !important;[\s\S]{0,500}transition: transform 240ms/,
    "The mobile drawer must be an opaque edge-to-edge panel with an animated exit.",
  );
  assert.match(
    styles,
    /\.content--circles \.circles-title-tab\.is-active \.circles-title-tab__name \{[\s\S]{0,120}display: block !important/,
    "The active Circle title must remain visible beside the mobile menu.",
  );
  assert.match(
    styles,
    /Compact-device resilience:[\s\S]{0,900}\.transactions-pagination__nav \.transactions-pagination__page[\s\S]{0,160}min-height: 40px/,
    "Compact transaction pagination must retain usable touch targets.",
  );
  assert.match(
    styles,
    /\.dashboard-home__hero-mini-label \{[\s\S]{0,260}white-space: normal;[\s\S]{0,80}overflow-wrap: anywhere;/,
    "Compact Home labels must reflow instead of clipping at narrow widths or larger text sizes.",
  );
  assert.match(
    styles,
    /@media \(max-width: 360px\) \{[\s\S]{0,160}\.dashboard-home__report-metrics \{[\s\S]{0,100}grid-template-columns: minmax\(0, 1fr\)/,
    "Ultra-compact Home reports must stack monetary metrics instead of truncating amounts.",
  );
  assert.match(
    styles,
    /\.budget-summary-card__items \{[\s\S]{0,180}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    "Budget account labels must have two stable compact columns instead of collapsing four flex items.",
  );
  assert.match(
    styles,
    /Mobile Transactions uses the document as its only vertical scroll owner[\s\S]{0,700}\.content--transactions \{[\s\S]{0,160}height: auto;[\s\S]{0,160}overflow: visible;[\s\S]{0,500}\.content--transactions \.transactions-mobile-view \{[\s\S]{0,180}overflow: visible;/,
    "Mobile Transactions must use document scrolling so older rows and the pagination sentinel remain reachable.",
  );
  assert.match(
    transactionsPage,
    /<button[\s\S]{0,180}ref=\{mobileLoadMoreRef\}[\s\S]{0,260}onClick=\{\(\) => void loadMoreMobileTransactions\(\)\}/,
    "Mobile Transactions must provide a manual load-more fallback when automatic loading is unavailable.",
  );

  const creationRoute = await readSource("lib/use-mobile-creation-route.ts");
  assert.match(creationRoute, /pushState\(\{ cloverCreation: newPath \}/, "Mobile creation must update Next's pathname without copying its private __NA flag.");
  assert.match(creationRoute, /addEventListener\("popstate", sync\)/, "Creation forms must follow browser Back and Forward.");
  assert.match(shell, /if \(creationParent\)[\s\S]{0,220}router\.replace\(creationParent\)/, "Direct Add links must return to their own parent page.");
  assert.match(shell, /shell-bottom-nav__label">Account<\/span>[\s\S]{0,120}NotificationCountBadge/, "Unread notifications belong on the bottom Account tab.");
  assert.match(shell, /item\.href === "\/notifications" \? <NotificationCountBadge/, "The Account drawer must repeat the unread badge on Notifications.");
  const accountMenu = shell.slice(shell.indexOf("const mobileSettingsSections ="), shell.indexOf("const shouldPrefetchNavHref"));
  assert.deepEqual([...accountMenu.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]), ["Notifications", "Settings", "Help", "Plan"]);
  assert.match(styles, /Shared signed-in mobile chrome[\s\S]*right: 12px !important/, "The shared mobile Menu belongs at the right edge.");
  assert.match(styles, /body\.mobile-creation-page \.content-body \{ animation: none !important; transform: none !important;/, "Entry animations must not establish a clipping container for full-page creation.");
  assert.match(transactionsPage, /if \(publishingTransactionsCacheRef\.current\) return;/, "Transactions must not rehydrate its own synchronous cache publication.");
  assert.match(transactionsPage, /publishingTransactionsCacheRef\.current = true;[\s\S]{0,800}finally[\s\S]{0,100}publishingTransactionsCacheRef\.current = false;/, "The cache guard must always reset, including when publication fails.");
  for (const page of ["transactions", "accounts", "investments", "recurring", "circles", "goals"]) {
    const creationPage = await readSource(`app/${page}/new/page.tsx`);
    if (page === "goals") {
      assert.match(creationPage, /resolveBudgetingWorkspace\(await getPageSessionContext\(\)\)/, "Goal creation must resolve the authenticated active Profile.");
      assert.match(creationPage, /<GoalInlineSetup[\s\S]*personalGoal=/, "Goal creation must create an independent goal on its own page.");
      assert.match(creationPage, /mobileBackHref="\/goals"/);
    } else {
      assert.match(creationPage, /export \{ default \} from "\.\.\/page"/, `${page} creation must remain reloadable and reuse the existing authorized page.`);
    }
  }
  assert.match(await readSource("components/settings-hub.tsx"), /router\.push\(`\/settings\/\$\{sectionKey\}`\)/, "Mobile Settings entries must navigate to dedicated pages.");
  assert.match(await readSource("app/settings/[section]/page.tsx"), /if \(!sections\.has\(section\)\) notFound\(\)/, "Settings routes must reject unknown sections.");
  console.log("Mobile navigation regression passed.");
}

void main();
