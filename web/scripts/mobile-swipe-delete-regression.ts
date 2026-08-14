import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFile(path.join(root, relativePath), "utf8");

async function main() {
  const [
    component,
    styles,
    accounts,
    accountDetails,
    transactions,
    recurring,
    investments,
    splitBillHome,
    splitBillWorkspace,
  ] = await Promise.all([
    readSource("components/mobile-swipe-delete.tsx"),
    readSource("app/globals.css"),
    readSource("app/accounts/page.tsx"),
    readSource("app/accounts/[accountId]/page.tsx"),
    readSource("app/transactions/page.tsx"),
    readSource("components/commitments-panel.tsx"),
    readSource("app/investments/page.tsx"),
    readSource("components/split-bill-home.tsx"),
    readSource("components/split-bill-workspace.tsx"),
  ]);

  assert.match(
    component,
    /event\.pointerType !== "touch"/,
    "Swipe deletion must only intercept touch gestures.",
  );
  assert.match(
    component,
    /MOBILE_LAYOUT_MEDIA_QUERY/,
    "Swipe deletion must use Clover's shared mobile breakpoint.",
  );
  assert.match(
    component,
    /Math\.abs\(deltaX\) > Math\.abs\(deltaY\)/,
    "Vertical scrolling must win over diagonal swipes.",
  );
  assert.match(
    component,
    /OPEN_THRESHOLD/,
    "A deliberate swipe threshold is required.",
  );
  assert.match(
    component,
    /aria-label=\{deleteLabel\}/,
    "The revealed delete action must have an accessible label.",
  );
  assert.match(
    styles,
    /\.mobile-swipe-delete__content[\s\S]*?touch-action: pan-y/,
  );
  assert.match(
    styles,
    /@media \(max-width: 1100px\)[\s\S]*?\.mobile-swipe-delete__action/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mobile-swipe-delete__content/,
  );

  for (const [name, source] of [
    ["accounts", accounts],
    ["account details", accountDetails],
    ["transactions", transactions],
    ["recurring", recurring],
    ["investments", investments],
    ["split bills", splitBillHome],
  ] as const) {
    assert.match(
      source,
      /MobileSwipeDelete/,
      `${name} mobile rows must support swipe deletion.`,
    );
  }

  assert.match(accounts, /window\.confirm\([\s\S]{0,80}`Delete account/);
  assert.match(accountDetails, /window\.confirm\("Delete this transaction\?/);
  assert.match(
    transactions,
    /window\.confirm\([\s\S]{0,80}`Delete transaction/,
  );
  assert.match(recurring, /window\.confirm\("Delete this recurring item\?"\)/);
  assert.match(investments, /const confirmationMessage/);
  assert.match(
    splitBillHome,
    /onDeleteBill[\s\S]*?onDeleteGroup[\s\S]*?onDeletePerson/,
  );
  assert.match(
    splitBillWorkspace,
    /onDeleteBill=\{removeBill\}[\s\S]*?onDeleteGroup=\{removeGroup\}[\s\S]*?onDeletePerson=\{removePerson\}/,
  );

  console.log("Mobile swipe deletion regression passed.");
}

void main();
