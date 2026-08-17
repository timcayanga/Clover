import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [themePreference, themeSync, rootLayout, globalStyles, responsiveLayout] = await Promise.all([
    readSource("lib/theme-preference.ts"),
    readSource("components/theme-sync.tsx"),
    readSource("app/layout.tsx"),
    readSource("app/globals.css"),
    readSource("lib/responsive-layout.ts"),
  ]);

  for (const route of [
    "/",
    "/contact-us",
    "/features",
    "/install",
    "/onboarding",
    "/pricing",
    "/privacy-policy",
    "/sso-callback",
    "/terms-of-service",
  ]) {
    assert.ok(themePreference.includes(`"${route}"`), `${route} must use Clover's intentional light public theme.`);
  }
  assert.match(themePreference, /LIGHT_ONLY_THEME_PREFIXES = \["\/sign-in", "\/sign-up"\]/);
  assert.match(themeSync, /isLightOnlyThemeRoute\(pathname\)/);
  assert.doesNotMatch(
    themeSync,
    /pathname === "\/"|pathname\.startsWith\("\/sign-in"\)/,
    "Client theme synchronization must not duplicate the route contract.",
  );
  assert.match(rootLayout, /JSON\.stringify\(LIGHT_ONLY_THEME_ROUTES\)/);
  assert.match(rootLayout, /JSON\.stringify\(LIGHT_ONLY_THEME_PREFIXES\)/);

  assert.match(themePreference, /light: "#ffffff"[\s\S]{0,80}dark: "#08111e"/);
  assert.match(rootLayout, /prefers-color-scheme: light[\s\S]{0,160}THEME_COLORS\.light/);
  assert.match(rootLayout, /prefers-color-scheme: dark[\s\S]{0,160}THEME_COLORS\.dark/);
  assert.match(themePreference, /meta\[data-clover-theme-color="true"\]/);
  assert.match(themePreference, /themeColor\.content = THEME_COLORS\[resolved\]/);

  assert.match(responsiveLayout, /MOBILE_LAYOUT_MAX_WIDTH = 1100/);
  assert.match(globalStyles, /@media \(min-width: 1101px\) \{[\s\S]{0,240}\.app-shell/);
  assert.match(globalStyles, /@media \(max-width: 1100px\) \{[\s\S]{0,260}\.app-shell/);

  assert.match(globalStyles, /html\[data-theme="dark"\] \{[\s\S]{0,260}--bg: #08111e/);
  for (const selector of [
    ".dashboard-home__hero-mini-card",
    ".accounts-overview-grid",
    ".transactions-table",
    ".recurring-modal",
    ".investments-page",
    ".settings-hub",
    ".help-page",
  ]) {
    assert.ok(
      globalStyles.includes(`html[data-theme="dark"] ${selector}`),
      `${selector} must retain an explicit dark-mode contract.`,
    );
  }

  assert.match(globalStyles, /\.clover-auth-card__brand \{[\s\S]{0,120}min-height: 44px/);
  assert.match(globalStyles, /\.clover-auth-password-toggle \{[\s\S]{0,220}width: 44px/);
  assert.match(globalStyles, /\.clover-auth-forgot-password \{[\s\S]{0,140}min-height: 40px/);
  assert.match(
    globalStyles,
    /Canonical product subtabs and tabbed header alignment[\s\S]{0,1600}color: rgba\(71, 85, 105, 0\.78\) !important;[\s\S]{0,260}font-weight: 500 !important;/,
    "Product subtabs must share the Investments typography and inactive color in light mode.",
  );
  assert.match(
    globalStyles,
    /html\[data-theme="dark"\] :is\([\s\S]{0,300}\.animated-tabs__tab,[\s\S]{0,360}color: rgba\(203, 213, 225, 0\.78\) !important;/,
    "Product subtabs must preserve the same hierarchy in dark mode.",
  );

  console.log("UI theme and layout consistency regression passed.");
}

void main();
