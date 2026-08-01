import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

assert.match(
  css,
  /:is\(\.topbar-actions, \.shell-compact-bar__actions\)[\s\S]*?:is\(\.button, \.currency-selector__button, \.reports-range-menu__summary\)[\s\S]*?font-size: 0\.78rem !important;[\s\S]*?font-weight: 600 !important;/,
  "Desktop page-header actions must share Add transaction typography."
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*?:is\(\.topbar-actions, \.shell-compact-bar__actions\)[\s\S]*?font-size: 0\.72rem !important;/,
  "Compact page-header actions must remain consistently sized."
);
assert.match(
  css,
  /\.currency-selector__trigger-all,[\s\S]*?\.currency-selector__trigger-token,[\s\S]*?font-size: inherit !important;[\s\S]*?font-weight: inherit !important;/,
  "Header currency labels must not override the shared CTA typography."
);

console.log("Header CTA typography regression passed.");
