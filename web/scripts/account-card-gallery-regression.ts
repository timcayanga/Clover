import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const main = async () => {
  const component = await readFile(
    path.join(process.cwd(), "components/account-card-luxury-gallery.tsx"),
    "utf8",
  );
  const page = await readFile(path.join(process.cwd(), "app/account-card-gallery/page.tsx"), "utf8");
  const styles = await readFile(path.join(process.cwd(), "app/globals.css"), "utf8");

  const sampleIds = Array.from(component.matchAll(/id: "([^"]+)"/g), (match) => match[1]);
  assert.equal(sampleIds.length, 10, "The staging gallery should contain exactly ten card concepts.");
  assert.equal(new Set(sampleIds).size, 10, "Every card concept should have a unique finish.");
  assert.match(component, /<FinancialAccountCard/);
  assert.doesNotMatch(component, /editableName|editableAccountNumber|editableAmount/);
  assert.match(page, /process\.env\.VERCEL_ENV === "production"/);
  assert.match(page, /notFound\(\)/);
  assert.match(styles, /\.card-atelier__grid/);
  assert.match(styles, /\.luxury-account-card::before/);

  console.log("Account card gallery regression passed.");
};

void main();
