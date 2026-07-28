import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "main.js",
  "preload.js",
  "Open Clover.command",
  "Clover.html",
  "Clover.app/Contents/Info.plist",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing required file: ${file}`);
  }
}

const executableCandidates = [
  "Clover.app/Contents/MacOS/Clover",
  "Clover.app/Contents/MacOS/Electron",
];

if (!executableCandidates.some((file) => existsSync(file))) {
  throw new Error("Missing app executable inside Clover.app");
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

if (packageJson.main !== "main.js") {
  throw new Error("package.json main entry must point to main.js");
}

const html = await readFile("index.html", "utf8");
for (const snippet of ["styles.css", "app.js"]) {
  if (!html.includes(snippet)) {
    throw new Error(`index.html is missing reference to ${snippet}`);
  }
}

const main = await readFile("main.js", "utf8");
if (!main.includes("loadFile")) {
  throw new Error("main.js must load the app HTML file");
}

console.log("Check passed: desktop app shell and renderer assets are wired up.");
