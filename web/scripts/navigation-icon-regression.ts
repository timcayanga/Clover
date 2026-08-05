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
    ].map(async (relativePath) => ({
      relativePath,
      source: await readFile(path.join(root, relativePath), "utf8"),
    })),
  );

  for (const consumer of consumers) {
    assert.doesNotMatch(
      consumer.source,
      /\/assets\/3d%20icons\/menu\//,
      `${consumer.relativePath} must not use legacy optimized icon copies.`,
    );
    assert.doesNotMatch(
      consumer.source,
      /\/assets\/icons\/goals\.png/,
      `${consumer.relativePath} must not fall back to the legacy goals icon.`,
    );
  }

  console.log(
    `Navigation icon regression passed for ${Object.keys(NAVIGATION_ICON_SOURCE_FILES).length} canonical 3D icons.`,
  );
}

void main();
