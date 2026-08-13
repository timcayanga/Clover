import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const main = async () => {
  const styles = await readFile(path.join(process.cwd(), "app/globals.css"), "utf8");

  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\)/);
  assert.match(styles, /\.content--transactions[\s\S]*?\.transaction-category-icon/);
  assert.match(styles, /\.transaction-inline-edit--date/);
  assert.match(styles, /\.transaction-account-cell \.transaction-inline-edit--select/);
  assert.match(styles, /\.transaction-category-cell \.transaction-inline-edit--select/);
  assert.match(styles, /\.transaction-inline-edit--amount/);
  assert.match(styles, /\.transaction-amount-type-select/);
  assert.match(styles, /\.content--accounts[\s\S]*?\.financial-account-card\.is-interactive/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none !important/);

  console.log("Interaction delight regression passed.");
};

void main();
