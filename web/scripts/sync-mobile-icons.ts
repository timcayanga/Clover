import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { NAVIGATION_ICON_SOURCE_FILES } from "../lib/navigation-icons";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function main() {
  for (const type of ["navigation", "categories", "interface"]) {
    const destination = path.join(root, "mobile/assets/icons", type);
    await mkdir(destination, { recursive: true });
    const entries = type === "navigation"
      ? Object.entries(NAVIGATION_ICON_SOURCE_FILES).map(([name, file]) => [name, path.join(root, "assets/3d icons", file)])
      : (await readdir(path.join(root, "web/public/figma-icons", type))).filter(file => file.endsWith(".svg")).map(file => [file.replace(/\.svg$/, ""), path.join(root, "web/public/figma-icons", type, file)]);
    for (const [name, source] of entries) {
      await sharp(source, { density: 144 }).resize(96, 96, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(destination, `${name}.png`));
    }
  }
}
void main();
