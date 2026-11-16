/** Host migration is enabled only after the internal domain is deployed and tested. */
export function getInternalOrigin(value = process.env.CLOVER_INTERNAL_ORIGIN) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "team.clover.ph" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function internalRouteDecision(
  hostname: string,
  pathname: string,
  enabled: boolean,
) {
  const internal = hostname === "team.clover.ph";
  const customer = hostname === "clover.ph" || hostname === "www.clover.ph";
  const adminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const teamPage = pathname === "/team" || pathname.startsWith("/team/");
  const officePage = pathname === "/office" || pathname.startsWith("/office/");
  if (internal && pathname === "/") return "office";
  if (internal && pathname === "/continue") return "office";
  if (enabled && customer && (adminPage || teamPage || officePage))
    return "redirect";
  if (
    enabled &&
    customer &&
    (pathname === "/api/admin" || pathname.startsWith("/api/admin/"))
  )
    return "reject-api";
  return "continue";
}
