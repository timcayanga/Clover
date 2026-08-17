import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [shell, styles, navigationIcons] = await Promise.all([
    readSource("components/clover-shell.tsx"),
    readSource("app/globals.css"),
    readSource("lib/navigation-icons.ts"),
  ]);

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
    /aria-controls="mobile-settings-drawer"[\s\S]{0,900}<span className="shell-bottom-nav__label">Profile<\/span>/,
    "Profile must open the right-side Settings drawer from the fifth mobile navigation slot.",
  );
  assert.match(shell, /className="sidebar-nav sidebar-nav--mobile"[\s\S]*desktopNavSections\.map/);
  assert.match(shell, /id="mobile-settings-drawer"[\s\S]{0,300}shell-profile-drawer/);
  assert.doesNotMatch(
    shell,
    /href="\/more"[\s\S]{0,700}<span className="shell-bottom-nav__label">More<\/span>/,
    "More must not remain duplicated in the bottom navigation.",
  );
  assert.match(
    shell,
    /document\.addEventListener\("scroll", handleDocumentScroll, \{ passive: true, capture: true \}\)/,
    "Compaction must observe nested page scrollers without blocking scroll performance.",
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
    /\.content--investments \.investments-mobile-header \{[\s\S]{0,80}display: none !important;/,
    "Investments must use the shared shell header instead of rendering a duplicate mobile header.",
  );
  assert.match(
    styles,
    /\.sidebar-nav--mobile \.nav-link \{[\s\S]{0,160}min-height: 32px !important;[\s\S]{0,160}height: 32px !important;/,
    "The mobile drawer rows must stay compact enough to fit in one viewport.",
  );
  assert.match(
    styles,
    /\.sidebar-nav--mobile \.nav-link__icon \.menu-icon-3d,[\s\S]{0,180}\.menu-icon-3d--home,[\s\S]{0,180}\.menu-icon-3d--adviser[\s\S]{0,180}width: 29px !important;[\s\S]{0,100}height: 29px !important;/,
    "Every mobile drawer icon must use the same footprint as Home.",
  );

  console.log("Mobile navigation regression passed.");
}

void main();
