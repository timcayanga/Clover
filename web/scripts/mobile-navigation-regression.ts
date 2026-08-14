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
    /href="\/more"[\s\S]{0,180}className=\{`shell-mobile-more-link/,
    "The mobile header burger must open More directly.",
  );
  assert.match(
    shell,
    /href="\/profile"[\s\S]{0,900}<span className="shell-bottom-nav__label">Profile<\/span>/,
    "Profile must replace More as the fifth mobile bottom destination.",
  );
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
    /\.shell-bottom-nav\.is-compact \.shell-bottom-nav__item \{[\s\S]{0,100}min-height: 44px;/,
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

  console.log("Mobile navigation regression passed.");
}

void main();
