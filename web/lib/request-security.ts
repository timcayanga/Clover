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
  const requestOrigin = parseOrigin(request.url);
  const originHeader = parseOrigin(request.headers.get("origin"));
  const refererHeader = parseOrigin(request.headers.get("referer"));
  const candidateOrigin = originHeader || refererHeader;

  if (!requestOrigin || !candidateOrigin || candidateOrigin !== requestOrigin) {
    throw new Error("Untrusted request origin.");
  }
};

export const assertContentLengthWithin = (request: Request, maxBytes: number) => {
  const contentLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error("Request body is too large.");
  }
};
