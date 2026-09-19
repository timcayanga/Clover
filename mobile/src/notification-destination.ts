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
  const detailQuery:Record<string,[string,string]>={"/budgeting":["budget","/budgeting?budgetId="],"/goals":["goal","/goals?goalId="],"/circles":["circle","/circles?circleId="]};
  const query=detailQuery[path];
  if(query&&url.searchParams.size===1){const id=url.searchParams.get(query[0]);if(id&&/^[a-zA-Z0-9_-]+$/.test(id))return query[1]+encodeURIComponent(id);}
  if (url.search) return null;
  const nativeDetail=path.match(/^\/(accounts|budgeting|budgets|goals|circles)\/([a-zA-Z0-9_-]+)$/);
  if(nativeDetail){const [,kind,id]=nativeDetail;return kind==="accounts"?`/(tabs)/accounts?accountId=${id}`:kind==="goals"?`/goals?goalId=${id}`:kind==="circles"?`/circles?circleId=${id}`:`/budgeting?budgetId=${id}`;}
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
