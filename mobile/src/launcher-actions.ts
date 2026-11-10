import type { Href } from "expo-router";

export const launcherRoutes = {
  expense: { pathname: "/add-transaction", params: { type: "expense" } },
  income: { pathname: "/add-transaction", params: { type: "income" } },
  transfer: { pathname: "/add-transaction", params: { type: "transfer" } },
  receipt: { pathname: "/add-transaction", params: { entry: "upload-receipt", picker: "camera", importMode: "receipt" } },
  transactions: "/(tabs)/transactions",
  accounts: "/(tabs)/accounts",
  ask: "/(tabs)/adviser",
  draft: "/add-transaction",
} as const satisfies Record<string, Href>;

export type LauncherAction = keyof typeof launcherRoutes;
export type LauncherRequest = {
  action: LauncherAction;
  params?: Record<string, string>;
};

export function parseLauncherAction(value: string): LauncherAction | null {
  return Object.hasOwn(launcherRoutes, value) ? value as LauncherAction : null;
}

const safeId = /^[a-zA-Z0-9_-]{1,128}$/;
const categories = new Set(["Food & Dining", "Groceries", "Transport", "Bills & Utilities"]);
const transactionTypes = new Set(["expense", "income", "transfer"]);

export function parseLauncherUrl(url: string | null | undefined): LauncherRequest | null {
  const match = /^(?:clover(?:-preview)?:\/\/\/?|\/?)(?:launcher)\/([a-z]+)\/?(?:\?([^#]*))?$/.exec(url ?? "");
  const action = match && parseLauncherAction(match[1]);
  if (!action) return null;
  const query = new URLSearchParams(match?.[2]);
  const params: Record<string, string> = {};
  const workspace = query.get("workspace");
  const accountId = query.get("accountId");
  if (workspace && accountId && safeId.test(workspace) && safeId.test(accountId) && (action === "accounts" || action === "draft")) {
    params.workspace = workspace;
    params.accountId = accountId;
  }
  if (action === "draft") {
    const amount = query.get("amount");
    const type = query.get("type");
    const category = query.get("category");
    const panel = query.get("panel");
    if (amount && /^\d{1,12}(\.\d{0,2})?$/.test(amount)) params.amount = amount;
    if (type && transactionTypes.has(type)) params.type = type;
    if (category && categories.has(category)) params.widgetCategory = category;
    if (panel === "category" || panel === "account") params.widgetPanel = panel;
  }
  return { action, params };
}

export function launcherHref({ action, params }: LauncherRequest, workspace: string): Href {
  if (!params || (action !== "draft" && action !== "accounts")) return launcherRoutes[action];
  const { accountId, workspace: sourceWorkspace, ...rest } = params;
  const scopedAccount = sourceWorkspace === workspace && accountId ? { accountId } : {};
  return { pathname: launcherRoutes[action], params: { ...rest, ...scopedAccount } };
}
