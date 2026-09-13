// Map only known Clover routes. Unsupported details retain their exact web URL.
export function notificationDestination(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\"))
    return null;
  let url: URL;
  try {
    url = new URL(href, "https://clover.ph");
  } catch {
    return null;
  }
  if (url.origin !== "https://clover.ph") return null;
  const path = url.pathname.replace(/\/$/, "") || "/";
  const routes: Record<string, string> = {
    "/": "/(tabs)/index",
    "/dashboard": "/(tabs)/index",
    "/home": "/(tabs)/index",
    "/transactions": "/(tabs)/transactions",
    "/accounts": "/(tabs)/accounts",
    "/recurring": "/(tabs)/recurring",
    "/review": "/(tabs)/transactions?review=pending_review",
    "/budgeting": "/budgeting",
    "/budgets": "/budgeting",
    "/goals": "/goals",
    "/reports": "/reports",
    "/investments": "/investments",
    "/circles": "/circles",
    "/split-bill": "/split-bills",
    "/notifications": "/notifications",
  };
  if (path === "/settings") {
    const section = url.searchParams.get("section");
    if (section === "plan") return "/settings?section=plan";
    return [
      "account",
      "profiles",
      "display",
      "region",
      "categories",
      "security",
      "data",
      "review",
      "notifications",
    ].includes(section ?? "")
      ? `/settings?section=${section}`
      : "/settings";
  }
  // Don't discard tokens or unknown query options, which may identify a workflow
  // unavailable in native (for example accepting a Circle invitation).
  if (url.search) return null;
  if (routes[path]) return routes[path];
  const detail = path.match(
    /^\/(transactions|imports|import|split-bill)\/([a-zA-Z0-9_-]+)$/,
  );
  if (!detail) return null;
  const [, kind, id] = detail;
  return kind === "transactions"
    ? `/transaction/${id}`
    : kind === "split-bill"
      ? `/split-bills?billId=${id}`
      : `/import/${id}`;
}
