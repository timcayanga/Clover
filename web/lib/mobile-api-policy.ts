export function mobileOperation(method: string, segments: string[]) {
  const path = segments.join("/");
  if (
    method === "GET" &&
    ["bootstrap", "transactions", "accounts", "imports"].includes(path)
  )
    return path;
  if (
    segments.length === 2 &&
    segments[0] === "transactions" &&
    ["GET", "PATCH"].includes(method)
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
