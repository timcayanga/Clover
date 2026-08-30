import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schemaSource = readSource("prisma/schema.prisma");
const migrationSource = readSource("prisma/migrations/20260829183000_in_app_notification_dismissals/migration.sql");
const readMigrationSource = readSource("prisma/migrations/20260830093000_in_app_notification_reads/migration.sql");
const routeSource = readSource("app/api/notifications/route.ts");
const notificationPageSource = readSource("app/notifications/notifications-client.tsx");
const shellSource = readSource("components/clover-shell.tsx");
const feedSource = readSource("lib/in-app-notifications.server.ts");
const stylesSource = readSource("app/globals.css");

assert.match(schemaSource, /model InAppNotificationDismissal/);
assert.match(schemaSource, /@@unique\(\[userId, notificationKey\]\)/);
assert.match(migrationSource, /ON DELETE CASCADE/);
assert.match(schemaSource, /model InAppNotificationRead/);
assert.match(schemaSource, /inAppNotificationReads\s+InAppNotificationRead\[\]/);
assert.match(readMigrationSource, /ON DELETE CASCADE/);
assert.match(readMigrationSource, /InAppNotificationRead_userId_notificationKey_key/);
assert.match(routeSource, /assertTrustedRequestOrigin\(request\)/);
assert.match(routeSource, /dismissAll/);
assert.match(routeSource, /markRead/);
assert.match(routeSource, /inAppNotificationRead\.createMany/);
assert.match(routeSource, /data: ids\.map/);
assert.match(routeSource, /createMany\([\s\S]{0,220}skipDuplicates: true/);
assert.match(routeSource, /if \(!parsed\.data\.markRead && ids\.length > 0\)/);
assert.match(routeSource, /parsed\.data\.dismissAll \|\| parsed\.data\.markRead/);
assert.match(routeSource, /loadActiveInAppNotificationFeed/);

assert.match(notificationPageSource, /className="notification-item__product-link"/);
assert.match(notificationPageSource, /href=\{notification\.productHref\}/);
assert.match(notificationPageSource, /Clear All/);
assert.match(notificationPageSource, /markInAppNotificationsRead/);
assert.match(notificationPageSource, /feed\.notifications\.map\(\(item\) => item\.id\)/);
assert.doesNotMatch(notificationPageSource, /notification-item__tone/);
assert.match(notificationPageSource, /formatInAppNotificationDateTime\(notification\.createdAt\)/);
assert.match(notificationPageSource, /dismissInAppNotifications\(\{ ids: \[notificationId\] \}\)/);
assert.match(notificationPageSource, /dismissInAppNotifications\(\{ dismissAll: true \}\)/);

assert.match(shellSource, /loadInAppNotificationFeed\(searchWorkspaceId, fresh\)/);
assert.match(shellSource, /getNavigationIconSrc\(notification\.product\)/);
assert.match(shellSource, /NotificationCountBadge count=\{notificationCount\}/);
assert.match(shellSource, /setNotificationCount\(feed\.count\)/);
assert.match(shellSource, /markInAppNotificationsRead/);
assert.match(shellSource, /inAppNotificationsReadEvent/);
assert.match(shellSource, /notifications\.length === 0 && searchWorkspaceId/);
assert.match(shellSource, /sidebar-popover__clear-notifications/);
assert.doesNotMatch(shellSource, /sidebar-popover__notification-tone/);
assert.match(shellSource, /formatInAppNotificationDateTime\(notification\.createdAt\)/);
assert.match(feedSource, /Promise\.all\(\[/);
assert.match(feedSource, /inAppNotificationRead\.findMany/);
assert.match(feedSource, /_max: \{ updatedAt: true \}/);
assert.match(feedSource, /invitation\.createdAt\.toISOString\(\)/);
assert.match(feedSource, /mismatchReason: "A transaction from this statement was deleted by the user\."/);
assert.match(feedSource, /product: "transactions"/);
assert.match(feedSource, /product: "accounts"/);
assert.match(feedSource, /product: "recurring"/);
assert.match(feedSource, /product: "circles"/);
assert.match(feedSource, /product: "splitBills"/);
assert.match(feedSource, /product: "investments"/);
assert.match(stylesSource, /\.sidebar-popover--notifications\s*\{[^}]*width:\s*400px;[^}]*max-height:\s*min\(620px/s);

console.log("In-app notification regression checks passed.");
