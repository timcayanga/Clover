import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  getNavigationIconSrc,
  NAVIGATION_ICON_SOURCE_FILES,
  type NavigationIconName,
} from "../lib/navigation-icons";

const root = process.cwd();
const sourceRoot = path.resolve(root, "../assets/3d icons");
const publicRoot = path.resolve(root, "public");

async function main() {
  const contextualAdviser = await readFile(path.join(root, "components/contextual-ask-clover.tsx"), "utf8");
  assert.doesNotMatch(contextualAdviser, /showLabel|trigger--labeled/, "Adviser actions must not render a labeled pill.");
  assert.match(contextualAdviser, /src=\{getNavigationIconSrc\("adviser"\)\}/, "Contextual Adviser must use the same artwork as the shared Adviser link.");
  const adviserStyles = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.match(adviserStyles, /--clover-adviser-action-size: 52px/, "Desktop Adviser icons must match Transactions.");
  assert.match(adviserStyles, /@media \(max-width: 1100px\) \{\s*\.content \{ --clover-adviser-action-size: 44px;/, "Mobile Adviser icons must match Transactions.");
  assert.match(adviserStyles, /\.content \.contextual-ask-clover__trigger \{\s*padding: 0 !important;\s*border: 0 !important;\s*background: transparent !important;\s*box-shadow: none !important;/, "Shared Adviser actions must remain container-free.");
  const overviewIcons = await Promise.all([
    ["components/recurring-page-client.tsx", "RecurringTabIcon"],
    ["components/reports-tabs.tsx", "ReportsTabIcon"],
    ["app/investments/page.tsx", "InvestmentTabIcon"],
  ].map(async ([file, component]) => {
    const source = await readFile(path.join(root, file), "utf8");
    const body = source.split(`function ${component}(`)[1]?.split("\n}")[0];
    const icons = body?.match(/return <svg[^\n]+<\/svg>;/g);
    assert.ok(icons?.length, `${component} must render its tab icons.`);
    return icons.at(-1);
  }));
  assert.equal(overviewIcons[0], overviewIcons[1], "Recurring and Reports must use the same Overview icon.");
  assert.equal(overviewIcons[0], overviewIcons[2], "Recurring and Investments must use the same Overview icon.");

  for (const [name, sourceFile] of Object.entries(NAVIGATION_ICON_SOURCE_FILES)) {
    const iconName = name as NavigationIconName;
    const sourcePath = path.join(sourceRoot, sourceFile);
    const publicPath = path.join(
      publicRoot,
      decodeURIComponent(getNavigationIconSrc(iconName)).replace(/^\//, ""),
    );

    await access(sourcePath);
    const outputStats = await stat(publicPath);
    const metadata = await sharp(publicPath).metadata();

    assert.equal(metadata.format, "webp", `${name} must be emitted as WebP.`);
    assert.equal(metadata.width, 96, `${name} must be navigation-sized.`);
    assert.equal(metadata.height, 96, `${name} must be navigation-sized.`);
    assert.ok(outputStats.size < 64_000, `${name} is too large for immediate menu loading.`);
  }

  const consumers = await Promise.all(
    [
      "app/layout.tsx",
      "app/more/page.tsx",
      "components/clover-shell.tsx",
      "components/settings-hub.tsx",
      "components/circles-workspace.tsx",
      "components/adviser-header-link.tsx",
    ].map(async (relativePath) => ({
      relativePath,
      source: await readFile(path.join(root, relativePath), "utf8"),
    })),
  );

  const globalStyles = await readFile(path.join(root, "app/globals.css"), "utf8");
  assert.ok(
    globalStyles.includes(`  .nav-link .menu-icon-3d--home {
    width: 32px;
    height: 32px;
    transform: none;
  }`),
    "The desktop Home icon must match the 32px size of the other product navigation icons.",
  );

  for (const consumer of consumers) {
    if (consumer.relativePath !== "components/settings-hub.tsx") {
      assert.doesNotMatch(
        consumer.source,
        /\/assets\/3d%20icons\/menu\//,
        `${consumer.relativePath} must not use legacy optimized icon copies.`,
      );
    }
    assert.doesNotMatch(
      consumer.source,
      /\/assets\/icons\/goals\.png/,
      `${consumer.relativePath} must not fall back to the legacy goals icon.`,
    );
  }

  const settingsHub = consumers.find(({ relativePath }) => relativePath === "components/settings-hub.tsx")?.source ?? "";
  assert.match(
    settingsHub,
    /plan:\s*{\s*title:\s*"Plan",\s*icon:\s*<SettingsIcon name="plan" \/>/,
    "The Settings Plan submenu must use the dedicated Plan icon.",
  );

  // Verify the actual menu assets consumed by both clients, not obsolete copies.
  const nativeSource = await readFile(path.resolve(root, "../mobile/src/icon-assets.ts"), "utf8");
  for (const name of ["profile", "settings", "help", "signOut", "profiles", "display", "data", "review", "categories", "notifications", "security", "region", "plan"] as NavigationIconName[]) {
    assert.equal(NAVIGATION_ICON_SOURCE_FILES[name], `figma-library-transparent/${name}.png`, `${name} must use the approved icon library, not captured legacy menu artwork.`);
    const publicPath = path.join(publicRoot, decodeURIComponent(getNavigationIconSrc(name)));
    const nativePath = path.resolve(root, `../mobile/assets/icons/navigation/${name}.png`);
    assert.ok(nativeSource.includes(`../assets/icons/navigation/${name}.png`), `${name} must use the synchronized native asset.`);
    for (const file of [publicPath, nativePath]) {
      const icon = sharp(file);
      assert.equal((await icon.metadata()).hasAlpha, true, `${file} must retain transparency.`);
      const { data, info } = await icon.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (const pixel of [0, info.width - 1, info.width * (info.height - 1), info.width * info.height - 1]) {
        assert.equal(data[pixel * 4 + 3], 0, `${file} must have transparent corners.`);
      }
    }
    const expected = await sharp(path.join(sourceRoot, NAVIGATION_ICON_SOURCE_FILES[name]), { density: 144 })
      .resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer();
    const actual = await sharp(nativePath).ensureAlpha().raw().toBuffer();
    assert.deepEqual(actual, expected, `${name} native pixels must match the canonical Figma export.`);
  }

  console.log(
    `Navigation icon regression passed for ${Object.keys(NAVIGATION_ICON_SOURCE_FILES).length} canonical 3D icons.`,
  );
}

void main();
