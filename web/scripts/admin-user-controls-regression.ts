import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const assertContains = (source: string, needle: string, message: string) => {
  if (!source.includes(needle)) throw new Error(message);
};
const assertNotContains = (source: string, needle: string, message: string) => {
  if (source.includes(needle)) throw new Error(message);
};

const consoleSource = read("components/admin-users-console.tsx");
const usersSource = read("lib/admin-users.ts");
const accessRoute = read("app/api/admin/users/[userId]/access/route.ts");
const dataRoute = read("app/api/admin/users/[userId]/data/route.ts");

assertContains(consoleSource, 'user.isBlocked ? "Unblock" : "Block"', "Admin Users must expose both Block and Unblock.");
assertContains(consoleSource, "user.blockedReason", "Admin Users must display the recorded block reason.");
assertContains(consoleSource, "Delete Transaction Data", "Admin Users must expose transaction deletion.");
assertContains(consoleSource, "Delete Accounts", "Admin Users must expose account deletion.");
assertContains(consoleSource, "Delete All Data", "Admin Users must expose full data deletion.");
assertNotContains(consoleSource, "user.transactionVolume", "Per-user transaction volume must not be rendered.");

assertContains(usersSource, "fetchUserAccessStates", "Admin user loading must include audited access state.");
assertContains(usersSource, "totalTransactionVolume", "The all-user tracked-volume aggregate must remain available.");
assertNotContains(usersSource, '"transactionVolume",', "Per-user transaction volume must not be exported.");

assertContains(accessRoute, "banUser", "Blocking must disable the Clerk account.");
assertContains(accessRoute, "unbanUser", "Unblocking must restore the Clerk account.");
assertContains(accessRoute, "block_user", "Blocking must create an audit action.");
assertContains(accessRoute, "unblock_user", "Unblocking must create an audit action.");

assertContains(dataRoute, "createAdminDataSnapshot", "Destructive Admin actions must create a safety snapshot.");
assertContains(dataRoute, "deleteWorkspaceTransactions", "Transaction-only deletion must preserve accounts.");
assertContains(dataRoute, "deleteAccountsAndImportArtifacts", "Account deletion must clean dependent artifacts.");
assertContains(dataRoute, "wipeLocalUserData", "Full deletion must use Clover's established wipe flow.");
assertContains(dataRoute, "reseedStarterWorkspace: true", "Full deletion must leave a usable empty workspace.");

console.log("Admin user controls regression passed.");
