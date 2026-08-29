import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schemaSource = readSource("prisma/schema.prisma");
const migrationSource = readSource("prisma/migrations/20260829183000_in_app_notification_dismissals/migration.sql");
const routeSource = readSource("app/api/notifications/route.ts");
const notificationPageSource = readSource("app/notifications/notifications-client.tsx");
const shellSource = readSource("components/clover-shell.tsx");
const feedSource = readSource("lib/in-app-notifications.server.ts");

assert.match(schemaSource, /model InAppNotificationDismissal/);
assert.match(schemaSource, /@@unique\(\[userId, notificationKey\]\)/);
assert.match(migrationSource, /ON DELETE CASCADE/);
assert.match(routeSource, /assertTrustedRequestOrigin\(request\)/);
assert.match(routeSource, /dismissAll/);
assert.match(routeSource, /createMany\([\s\S]{0,220}skipDuplicates: true/);
assert.match(routeSource, /loadActiveInAppNotifications/);

assert.match(notificationPageSource, /className="notification-item__product-link"/);
assert.match(notificationPageSource, /href=\{notification\.productHref\}/);
assert.match(notificationPageSource, /Dismiss all/);
assert.match(notificationPageSource, /dismissInAppNotifications\(\{ ids: \[notificationId\] \}\)/);
assert.match(notificationPageSource, /dismissInAppNotifications\(\{ dismissAll: true \}\)/);

assert.match(shellSource, /loadInAppNotificationFeed\(searchWorkspaceId, fresh\)/);
assert.match(shellSource, /getNavigationIconSrc\(notification\.product\)/);
assert.match(shellSource, /NotificationCountBadge count=\{notificationCount\}/);
assert.match(feedSource, /Promise\.all\(\[/);
assert.match(feedSource, /product: "transactions"/);
assert.match(feedSource, /product: "accounts"/);
assert.match(feedSource, /product: "recurring"/);
assert.match(feedSource, /product: "circles"/);
assert.match(feedSource, /product: "splitBills"/);
assert.match(feedSource, /product: "investments"/);

console.log("In-app notification regression checks passed.");
