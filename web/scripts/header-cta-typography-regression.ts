import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

assert.match(
  css,
  /--action-button-height: 32px;[\s\S]*?--action-button-padding-inline: 10px;[\s\S]*?--action-button-font-size: 0\.78rem;[\s\S]*?--action-button-font-size-compact: 0\.72rem;[\s\S]*?--action-button-font-weight: 600;/,
  "Shared action-button typography tokens must remain aligned with Add transaction."
);
assert.match(
  css,
  /\.button-small \{[\s\S]*?min-height: var\(--action-button-height\);[\s\S]*?padding: 0 var\(--action-button-padding-inline\);[\s\S]*?font-size: var\(--action-button-font-size\);[\s\S]*?font-weight: var\(--action-button-font-weight\);/,
  "Small action buttons must use the shared compact CTA specification."
);
assert.match(
  css,
  /:is\(\.modal-actions, \.form-actions\) > \.button \{[\s\S]*?min-height: var\(--action-button-height\);[\s\S]*?font-size: var\(--action-button-font-size\);[\s\S]*?font-weight: var\(--action-button-font-weight\);/,
  "Modal and form actions must use the shared compact CTA specification."
);
assert.match(
  css,
  /:is\(\.topbar-actions, \.shell-compact-bar__actions\)[\s\S]*?:is\(\.button, \.currency-selector__button, \.reports-range-menu__summary\)[\s\S]*?font-size: var\(--action-button-font-size\) !important;[\s\S]*?font-weight: var\(--action-button-font-weight\) !important;/,
  "Desktop page-header actions must share Add transaction typography."
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*?:is\(\.topbar-actions, \.shell-compact-bar__actions\)[\s\S]*?font-size: var\(--action-button-font-size-compact\) !important;/,
  "Compact page-header actions must remain consistently sized."
);
assert.match(
  css,
  /\.currency-selector__trigger-all,[\s\S]*?\.currency-selector__trigger-token,[\s\S]*?font-size: inherit !important;[\s\S]*?font-weight: inherit !important;/,
  "Header currency labels must not override the shared CTA typography."
);

for (const selector of [".recurring-compact-action.button-small", ".admin-users__row-actions .button-small", ".settings-session-action.button-small"]) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(rule, `${selector} must retain an explicit layout rule.`);
  assert.doesNotMatch(
    rule[1],
    /(?:font-size|font-weight|min-height|padding(?:-inline)?):/,
    `${selector} must not override shared action-button sizing or typography.`
  );
}

console.log("Action button typography regression passed.");
