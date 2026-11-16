export type ClientDiagnosticEntry = {
  kind: "navigation" | "runtime_error" | "unhandled_rejection";
  message: string;
  route: string;
  occurredAt: string;
};

const MAX_ENTRIES = 24;
const MAX_MESSAGE_LENGTH = 600;
const entries: ClientDiagnosticEntry[] = [];
let listenerCount = 0;

const sanitizeMessage = (value: unknown) =>
  String(value ?? "Unknown error")
    .replace(/(?:bearer\s+)[a-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/(?:token|secret|password|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s?#]+[?#][^\s]+/gi, (url) => url.split(/[?#]/, 1)[0] ?? url)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);

const readRoute = () => {
  if (typeof window === "undefined") {
    return "";
  }
  return `${window.location.pathname}${window.location.hash}`.slice(0, 255);
};

export const recordClientDiagnostic = (
  kind: ClientDiagnosticEntry["kind"],
  message: unknown,
  route = readRoute()
) => {
  const normalizedMessage = sanitizeMessage(message);
  if (!normalizedMessage) {
    return;
  }

  const entry: ClientDiagnosticEntry = {
    kind,
    message: normalizedMessage,
    route: route.slice(0, 255),
    occurredAt: new Date().toISOString(),
  };
  const previous = entries.at(-1);
  if (
    previous?.kind === entry.kind &&
    previous.message === entry.message &&
    previous.route === entry.route
  ) {
    return;
  }

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
};

const handleWindowError = (event: ErrorEvent) => {
  let source = "";
  try {
    source = event.filename ? new URL(event.filename, window.location.origin).pathname : "";
  } catch {
    source = "";
  }
  const position = source ? ` (${source}:${event.lineno || 0}:${event.colno || 0})` : "";
  recordClientDiagnostic("runtime_error", `${event.message || event.error?.message || "Runtime error"}${position}`);
};

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  recordClientDiagnostic(
    "unhandled_rejection",
    reason instanceof Error ? `${reason.name}: ${reason.message}` : reason
  );
};

export const installClientDiagnostics = () => {
  if (typeof window === "undefined") {
    return () => {};
  }

  listenerCount += 1;
  if (listenerCount === 1) {
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
  }

  return () => {
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    }
  };
};

export const getClientDiagnostics = () => entries.slice();
