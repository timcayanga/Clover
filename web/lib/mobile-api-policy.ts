export function mobileOperation(method: string, segments: string[]) {
  if (segments.join("/") === "billing/store" && ["GET", "POST"].includes(method)) return "store-billing";
  if (segments.join("/") === "settings/preferences" && ["GET", "PATCH"].includes(method)) return "settings-preferences";
  const path = segments.join("/");
  if (path === "settings/wipe-data" && method === "POST") return "settings-wipe-data";
  if (path === "settings/delete-account" && method === "POST") return "settings-delete-account";
  if (path === "settings/data" && ["GET", "DELETE"].includes(method)) return "settings-data";
  if (method === "POST" && path === "offline/allowance") return "offline-allowance";
  if (method === "POST" && path === "offline/sync") return "offline-sync";
  if (["settings/export/transactions", "settings/export/account-balances"].includes(path) && method === "GET") return "settings-export";
  if (path === "settings/profiles" && ["GET", "POST"].includes(method)) return "settings-profiles";
  if (segments.length === 3 && segments[0] === "settings" && segments[1] === "profiles" && ["PATCH", "DELETE"].includes(method)) return "settings-profile";
  if (path === "settings/categories" && ["GET", "POST", "PATCH", "DELETE"].includes(method)) return "settings-categories";
  if (path === "onboarding" && method === "POST") return "onboarding";
  if (path === "settings/account" && ["GET", "PATCH"].includes(method)) return "settings-account";
  if (path === "settings/regional" && ["GET", "PATCH"].includes(method)) return "settings-regional";
  if (path === "split-bill-receipts/preview" && method === "POST") return "split-receipt-preview";
  if (["investments", "market-history", "market-news", "together-options", "reports"].includes(path) && method === "GET") return path;
  if (segments.length === 2 && segments[0] === "accounts" && ["GET", "PATCH", "DELETE"].includes(method)) return "account";
  if (path === "recurring" && method === "POST") return "recurring-create";
  if (path === "recurring-suggestions/dismiss" && method === "POST") return "recurring-dismiss";
  if (segments.length === 2 && segments[0] === "recurring" && ["PATCH", "DELETE"].includes(method)) return "recurring-edit";
  if (segments.length === 3 && segments[0] === "recurring" && segments[2] === "completion" && method === "PATCH") return "recurring-completion";
  if (path === "adviser/attachments" && method === "POST") return "adviser-attachments";
  if (path === "adviser/entries" && ["GET", "POST"].includes(method)) return "adviser-entries";
  if (path === "adviser/chat" && method === "POST") return "adviser-chat";
  if (path === "circles" && ["GET", "POST"].includes(method)) return "circles";
  if (segments.length === 2 && segments[0] === "circles" && ["GET", "PATCH"].includes(method)) return "circle";
  if (segments.length === 2 && segments[0] === "split-bill-payment-profiles" && method === "DELETE") return "payment-profile-delete";
  if (segments.length === 3 && segments[0] === "split-bills" && ["payment-requests", "transfer-settlements", "preview", "resolution"].includes(segments[2]) && method === "POST") return segments[2];
  if (path === "split-bill-groups" && method === "POST") return "split-group-create";
  if (segments.length === 2 && segments[0] === "split-bill-groups" && ["PATCH","DELETE"].includes(method)) return "split-group-edit";
  if (path === "split-bills" && ["GET", "POST"].includes(method)) return "split-bills";
  if (segments.length === 2 && segments[0] === "split-bills" && ["GET", "PATCH", "DELETE"].includes(method)) return "split-bill";
  if (path === "budgets" && ["GET", "POST"].includes(method)) return "budgets";
  if (path === "budgets/options") return method === "GET" ? "budget-options" : null;
  if (segments.length === 2 && segments[0] === "budgets" && ["GET", "PATCH", "DELETE"].includes(method)) return "budget";
  if (path === "goals" && ["GET", "POST", "DELETE"].includes(method)) return "goals";
  if (path === "notifications" && ["GET", "PATCH"].includes(method)) return "notifications";
  if (method === "POST" && path === "transactions") return "transaction-create";
  if (method === "POST" && path === "accounts") return "account-create";
  if (
    method === "GET" &&
    ["bootstrap", "transactions", "accounts", "imports", "options", "home", "recurring"].includes(path)
  )
    return path;
  if (
    segments.length === 2 &&
    segments[0] === "transactions" &&
    ["GET", "PATCH", "DELETE"].includes(method)
  )
    return "transaction";
  if (segments.length === 3 && segments[0] === "imports") {
    if (method === "GET" && segments[2] === "status") return "import-status";
    if (method === "POST" && segments[2] === "process") return "import-process";
    if (method === "POST" && segments[2] === "resume") return "import-resume";
  }
  return null;
}

export const mobileResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};

// Call only on cryptographically verified Clerk claims. Pending-factor tokens
// are not an authenticated application session.
export function mobileSessionUser(claims: {
  sub?: unknown;
  sid?: unknown;
  sts?: unknown;
}) {
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.sid !== "string" ||
    !claims.sid
  )
    return null;
  if (claims.sts !== undefined && claims.sts !== "active") return null;
  return claims.sub;
}
