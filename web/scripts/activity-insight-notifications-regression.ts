import { loadActivityInsightNotifications } from "../lib/activity-insight-notifications.server";
import { prisma } from "../lib/prisma";
import assert from "node:assert/strict";
import { activityInsightNotifications, firstInsightNotification } from "../lib/activity-insight-notifications";
import { defaultAppPreferences, notificationAllowed } from "../../shared/app-preferences";
import { notificationDestination } from "../../mobile/src/notification-destination";

const now = new Date("2026-11-06T12:00:00Z");
const row = { date: new Date("2026-10-31T18:00:00Z"), createdAt: now, currency: "PHP" };
const rows = Array.from({ length: 10 }, () => row);
const source = { key: "upload:statement1", name: "BPI statement", rows };
const build = (groups = [source]) => activityInsightNotifications("personal", "Asia/Manila", groups, now);
assert.equal(build([{ ...source, rows: rows.slice(0, 5) }]).length, 0);
assert.equal(build([{ ...source, rows: [...rows.slice(0, 9), { ...row, currency: "USD" }] }]).length, 0);
assert.equal(build([{ ...source, rows: [...rows.slice(0, 9), { ...row, date: new Date("2026-12-01") }] }]).length, 0);
assert.equal(build([{ key: "bank:1:week", name: "BPI", rows: rows.slice(0, 5) }]).length, 0);
assert.equal(build([{ key: "manual:week", name: "your manual entries", rows }]).length, 1);
const [notification] = build();
assert.equal(notification.title, "Your insights from BPI statement are ready");
assert.match(notification.href ?? "", /from=2026-11-01&to=2026-11-01&currency=PHP/);
assert.equal(notificationDestination(notification.href!), notification.href);
assert.equal(build([{ ...source, rows: [...rows, row] }])[0].id, notification.id);
assert.equal(notificationAllowed(notification.id, { ...defaultAppPreferences.notifications, importComplete: false }, "inApp"), false);
assert.equal(notificationDestination("/transactions?report=1&currency=PHP&customStart=2026-10-01&customEnd=2026-10-31&types=debit&categories=dining"),
  "/(tabs)/transactions?report=report%3D1%26currency%3DPHP%26customStart%3D2026-10-01%26customEnd%3D2026-10-31%26types%3Ddebit%26categories%3Ddining");
assert.equal(notificationDestination("/recurring?commitment=bill123"), "/recurring?commitmentId=bill123");
assert.equal(notificationDestination("/accounts?currency=PHP"), "/accounts?currency=PHP");
assert.equal(notificationDestination("/reports?redirect=https://example.com"), null);
const firstRows = Array.from({ length: 10 }, (_, i) => ({
  ...row,
  type: i === 9 ? "expense" as const : "income" as const,
  createdAt: new Date(+now - (9 - i) * 2 * 86_400_000),
}));
const first = (entries = firstRows, asOf = now) => firstInsightNotification("personal", "Asia/Manila", entries, asOf);
assert.equal(first(firstRows.slice(0, 9)), undefined);
assert.equal(first(firstRows.map(entry => ({ ...entry, type: "income" }))), undefined);
assert.equal(first([...firstRows.slice(0, 9), { ...firstRows[9], type: "transfer" }]), undefined);
assert.equal(first([...firstRows.slice(0, 9), { ...firstRows[9], date: new Date("2026-12-01") }]), undefined);
assert.equal(first([...firstRows.slice(0, 9), { ...firstRows[9], currency: "USD" }]), undefined);
const firstReady = first()!;
assert.equal(firstReady.id, "first-activity-insight:personal");
assert.equal(firstReady.createdAt, now.toISOString());
assert.match(firstReady.href ?? "", /currency=PHP&transfers=exclude&review=confirmed/);
assert.equal(notificationDestination(firstReady.href!), firstReady.href);
assert.equal(first([...firstRows, ...firstRows])?.id, firstReady.id);
assert.equal(first(firstRows, new Date(+now + 8 * 86_400_000)), undefined);
assert.equal(notificationAllowed(firstReady.id, { ...defaultAppPreferences.notifications, inApp: false }, "inApp"), false);
console.log("Activity insights and native drill-down regression passed.");


async function checkFirstInsightFeed() {
  const originalWorkspace = prisma.workspace.findUnique;
  const originalTransactions = prisma.transaction.findMany;
  prisma.workspace.findUnique = (async () => ({
    user: { regionalPreferences: { timeZone: "Asia/Manila", baseCurrency: "PHP" } },
  })) as typeof originalWorkspace;
  prisma.transaction.findMany = (async args => {
    assert.equal(args?.where?.workspaceId, "personal");
    assert.deepEqual(args?.where?.reviewStatus, { in: ["confirmed", "edited"] });
    assert.equal(args?.where?.isTransfer, false);
    assert.ok(args?.where?.OR?.some(origin => origin.importFile?.status === "done"));
    return firstRows.map((entry, index) => ({
      ...entry, amount: 100, account: { institution: null }, category: null,
      importFile: index < 4 ? { id: "statement", fileName: "Statement" } : null,
      finverseTransactionRecord: index >= 4 && index < 7 ? { connection: { id: "bank", institutionName: "BPI" } } : null,
      isTransfer: false, merchantRaw: "Example", merchantClean: null, description: null,
    }));
  }) as typeof originalTransactions;
  try {
    const feed = await loadActivityInsightNotifications("personal", now);
    assert.deepEqual(feed.map(item => item.id), ["first-activity-insight:personal"]);
    assert.match(feed[0].message, /10 confirmed PHP transactions/);
  } finally {
    prisma.workspace.findUnique = originalWorkspace;
    prisma.transaction.findMany = originalTransactions;
  }
  console.log("First insight feed combines completed upload, linked bank, and manual activity.");
}
void checkFirstInsightFeed();
