import assert from "node:assert/strict";
import { activityInsightNotifications } from "../lib/activity-insight-notifications";
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
assert.equal(notificationDestination("/recurring?commitment=bill123"), "/(tabs)/recurring?commitmentId=bill123");
assert.equal(notificationDestination("/accounts?currency=PHP"), "/(tabs)/accounts?currency=PHP");
assert.equal(notificationDestination("/reports?redirect=https://example.com"), null);
console.log("Activity insights and native drill-down regression passed.");
