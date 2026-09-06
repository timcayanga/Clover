import { getMobileRequestContext } from "@/lib/mobile-request-context";

const parseOrigin = (value: string | null) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
};

export const getRequestClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();
  if (firstForwarded) {
    return firstForwarded;
  }

  return request.headers.get("x-real-ip")?.trim() ?? "unknown";
};

export const assertTrustedRequestOrigin = (request: Request) => {
  // Native clients have no browser Origin. This exemption requires the exact
  // Request authenticated by the mobile boundary, not a spoofable header.
  if (getMobileRequestContext()?.request === request) return;
  const requestOrigin = parseOrigin(request.url);
  const originHeader = parseOrigin(request.headers.get("origin"));
  const refererHeader = parseOrigin(request.headers.get("referer"));
  const candidateOrigin = originHeader || refererHeader;
  const isEquivalentLoopbackOrigin = (() => {
    if (!requestOrigin || !candidateOrigin) {
      return false;
    }

    try {
      const requestUrl = new URL(requestOrigin);
      const candidateUrl = new URL(candidateOrigin);
      const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
      return (
        loopbackHosts.has(requestUrl.hostname) &&
        loopbackHosts.has(candidateUrl.hostname) &&
        requestUrl.protocol === candidateUrl.protocol &&
        requestUrl.port === candidateUrl.port
      );
    } catch {
      return false;
    }
  })();

  if (!requestOrigin || !candidateOrigin || (candidateOrigin !== requestOrigin && !isEquivalentLoopbackOrigin)) {
    throw new Error("Untrusted request origin.");
  }
};

export const assertContentLengthWithin = (request: Request, maxBytes: number) => {
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Request body is too large.");
  }
};
