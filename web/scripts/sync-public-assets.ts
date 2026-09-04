import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import path from "node:path";
import { ADDITIONAL_BANK_LOGOS } from "../lib/bank-logo-catalog";
import {
  NAVIGATION_ICON_SOURCE_FILES,
  type NavigationIconName,
} from "../lib/navigation-icons";

const sourceRoot = fileURLToPath(new URL("../../assets/", import.meta.url));
const destinationRoot = fileURLToPath(new URL("../public/assets/", import.meta.url));
const navigationSourceRoot = fileURLToPath(new URL("../../assets/3d icons/", import.meta.url));
const navigationDestinationRoot = fileURLToPath(new URL("../public/assets/3d icons/navigation/", import.meta.url));
const errorSourcePath = fileURLToPath(new URL("../../assets/3d icons/error.png", import.meta.url));
const errorDestinationPath = fileURLToPath(new URL("../public/assets/error-clover.webp", import.meta.url));

const buildNavigationIcon = async (name: NavigationIconName, sourceFile: string) => {
  const sourcePath = `${navigationSourceRoot}${sourceFile}`;
  const destinationPath = `${navigationDestinationRoot}${name}.webp`;

  await stat(sourcePath);
  await sharp(sourcePath)
    .resize({ width: 96, height: 96, fit: "contain" })
    .webp({ quality: 88, alphaQuality: 100, effort: 5 })
    .toFile(destinationPath);
};

const main = async () => {
  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Canonical asset source is not a directory: ${sourceRoot}`);
  }

  // public/assets is a disposable build artifact. Recreate it to avoid stale files.
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });
  await cp(sourceRoot, destinationRoot, { recursive: true, force: true });
  // Keep legacy generic URLs working after the source library moved folders.
  for (const file of ["bank.png", "cash.png", "credit card.png", "investment.png", "others.png", "wallet.png"]) {
    await cp(`${sourceRoot}banks/1 generic/${file}`, `${destinationRoot}banks/${file}`);
  }
  // Decode sequentially: some originals are 4K, and extensionless inputs need a
  // browser-safe content type. Versioned WebP outputs are small and cache-safe.
  for (const logo of ADDITIONAL_BANK_LOGOS) {
    const target = fileURLToPath(new URL(`../public${logo.src.split("?")[0]}`, import.meta.url));
    await mkdir(path.dirname(target), { recursive: true });
    await sharp(`${sourceRoot}banks/${logo.file}`)
      .resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90, alphaQuality: 100, effort: 4 }).toFile(target);
  }
  await stat(errorSourcePath);
  await sharp(errorSourcePath)
    .resize({ width: 480, height: 480, fit: "cover", position: "center" })
    .webp({ quality: 84, effort: 5 })
    .toFile(errorDestinationPath);
  await mkdir(navigationDestinationRoot, { recursive: true });
  // Keep build memory predictable on Vercel instead of decoding every source at once.
  for (const [name, sourceFile] of Object.entries(NAVIGATION_ICON_SOURCE_FILES)) {
    await buildNavigationIcon(name as NavigationIconName, sourceFile);
  }
};

void main();
