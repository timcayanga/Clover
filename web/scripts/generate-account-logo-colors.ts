// Precompute colors from bundled logos; no image processing or network reads at runtime.
// Run from web/: npx tsx scripts/generate-account-logo-colors.ts
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { INSTITUTION_ACCOUNT_LOGO_OPTIONS } from "../lib/account-logo";

async function main() {
  const colors: Record<string, string> = {};
  for (const logo of INSTITUTION_ACCOUNT_LOGO_OPTIONS) {
    const pathname = decodeURIComponent(logo.src.split("?")[0]);
    const { data } = await sharp(path.join(process.cwd(), "public", pathname))
      .resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bins = new Map<string, { count: number; weight: number; red: number; green: number; blue: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const [red, green, blue, alpha] = data.subarray(i, i + 4);
      const max = Math.max(red, green, blue), min = Math.min(red, green, blue);
      if (alpha < 128 || min > 225) continue;
      const saturation = max ? (max - min) / max : 0;
      const weight = (alpha / 255) * (0.15 + saturation * saturation);
      const key = [red, green, blue].map(channel => Math.floor(channel / 32)).join(",");
      const bin = bins.get(key) ?? { count: 0, weight: 0, red: 0, green: 0, blue: 0 };
      bin.count++; bin.weight += weight; bin.red += red; bin.green += green; bin.blue += blue;
      bins.set(key, bin);
    }
    const dominant = [...bins.values()].sort((a, b) => b.weight - a.weight)[0];
    if (!dominant) throw new Error(`No visible logo color: ${pathname}`);
    colors[pathname] = "#" + [dominant.red, dominant.green, dominant.blue]
      .map(value => Math.round(value / dominant.count).toString(16).padStart(2, "0")).join("");
  }
  await fs.writeFile(path.join(process.cwd(), "lib/account-logo-colors.json"), JSON.stringify(colors, null, 2) + "\n");
  console.log(`Saved ${Object.keys(colors).length} bundled logo colors.`);
}
void main();
