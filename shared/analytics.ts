/** Privacy-safe, dependency-free contract shared by web, native and tests. */
export const TELEMETRY_EVENTS = ["billing_restored","screen_viewed", "screen_engagement", "flow_started", "flow_completed", "flow_failed", "flow_canceled", "data_load_started", "data_load_completed", "data_load_failed", "data_load_canceled", "data_ready", "page_render_completed", "page_render_slow", "form_opened", "form_closed", "input_started", "input_completed", "input_failed", "input_canceled", "offline_action_queued", "offline_sync_started", "offline_sync_completed", "offline_sync_failed", "offline_sync_conflict", "offline_action_discarded", "ui_interaction"] as const;
export type TelemetryEvent = typeof TELEMETRY_EVENTS[number];
export type TelemetryProperties = Record<string, string | number | boolean | null | undefined>;
export type TelemetrySink = (event: TelemetryEvent, properties: TelemetryProperties) => void;
let sink: TelemetrySink | undefined;
let context: TelemetryProperties = {};
let headerProvider = () => ({} as Record<string, string>);
const pending: Array<[TelemetryEvent, TelemetryProperties]> = [];
export function clearPendingTelemetry() { pending.length = 0; }
export function setTelemetryContext(next: TelemetryProperties) { context = { ...context, ...next }; }
export function setTelemetryHeaderProvider(next: () => Record<string,string>) { headerProvider = next; }
export function getTelemetryHeaders() { try { return headerProvider(); } catch { return {}; } }
export function setTelemetrySink(next: TelemetrySink) { sink = next; for (const [event, properties] of pending.splice(0)) { try { sink(event, properties); } catch {} } }
export function telemetry(event: TelemetryEvent, properties: TelemetryProperties = {}) {
  try { const payload = { ...context, ...properties }; if (sink) sink(event, payload); else { pending.push([event, payload]); if (pending.length > 100) pending.shift(); } } catch { /* Never block a product action. */ }
}
export const newTelemetryId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export function beginTelemetry(kind: "flow" | "data_load" | "input", properties: TelemetryProperties) {
  const started = Date.now();
  const operation_id = properties.operation_id ?? newTelemetryId();
  telemetry(`${kind}_started`, { ...properties, operation_id });
  let finished = false;
  return (outcome: "completed" | "failed" | "canceled", extra: TelemetryProperties = {}) => {
    if (finished) return;
    finished = true;
    const event = `${kind}_${outcome}` as TelemetryEvent;
    telemetry(event, { ...properties, ...extra, operation_id, outcome, duration_ms: Math.max(0, Date.now() - started) });
  };
}
// Route components are allowlisted; identifiers, tokens, search strings and filenames never leave the client.
export const routeSegments = "switch-to-clover access account account-balances account-card-gallery accounts actions add add-transaction admin adviser alerts allowance analysis analytics api appearance approvals archive ask attachment attachments audit auth bank batch billing blank bootstrap budget budget-plans budgeting budgets bug-reports bulk-delete callback camera campaigns cancel categories category category-rules chat checkout circle circle-invitations circles clerk client-events commitments complete completion config confirm connect connections contact-us content content-drafts continue conversations cron dashboard data data-qa delete delete-account details dismiss edit entries error-logs errors events export export-csv features feedback file files financial-focus finverse forgot-password fx-rate goal goal-settings goals group-invite groups guides health help history home identity import import-enrichment import-recovery import-retries imports inquiries insights install institution institutions integrations interaction investment investment-dividends investment-holdings investment-positions investment-purchases investments invitations invite join landing-preview link load logs lunchflow manual manual-transfer market-history market-news me members merchant-rules merchants merge messages microphone missions mobile more new notes notification notifications offers offline onboarding operations options paddle part password passwords payment-profile payment-requests paypal people personal-goals photos plan portal positions preferences preview pricing primary privacy-policy process profile profiles progress purchases qa qr readiness receipt reconcile recurring recurring-patterns recurring-suggestions referral-checkout referrals regional report reports request reset-password resolution resources restore resume revenuecat review revise rules run sample-corpus search security settings share sign-in sign-up split-bill split-bill-groups split-bill-payment-accounts split-bill-payment-profiles split-bill-people split-bill-receipts split-bill-requests split-bills sso-callback staging-access start statement-checkpoints status store summary support sync tags terms-of-service together-options trades transaction transaction-category-suggestions transaction-name-suggestions transactions transfer-settlements upload uploads usage users v1 verify-email webhook webhooks welcome wipe-data work-queue workspaces".split(" ");
const segments = new Set(routeSegments);
export function safeRoute(path: string) {
  return "/" + path.split(/[?#]/)[0].split("/").filter(Boolean).filter(s => !/^\(.+\)$/.test(s)).map(s => segments.has(s) ? s : ":id").join("/");
}
export function requestTelemetry(path: string, method = "GET") {
  const route = safeRoute(path.replace(/^\/?api\/mobile\/v1\//, ""));
  // Avoid poll/chunk amplification; the surrounding operation has its own event.
  if (/\/(status|part)$/.test(route) || /\/(analytics|health)(\/|$)/.test(route)) return null;
  return { operation: `${method.toUpperCase()} ${route}`, phase: "request", method: method.toUpperCase(), resource: route.split("/").filter(s => s && s !== "api")[0] ?? "root" };
}
export function browserContext(userAgent: string, width?: number, touchPoints = 0) {
  const tablet = /iPad|Tablet/i.test(userAgent) || /Macintosh/i.test(userAgent) && touchPoints > 1;
  const mobile = tablet || /Mobi|Android|iPhone/i.test(userAgent);
  const os = /iPhone|iPad/i.test(userAgent) || tablet && /Macintosh/.test(userAgent) ? "iOS" : /Android/i.test(userAgent) ? "Android" : /Windows/i.test(userAgent) ? "Windows" : /Mac/i.test(userAgent) ? "macOS" : /Linux/i.test(userAgent) ? "Linux" : "unknown";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox|FxiOS/.test(userAgent) ? "Firefox" : /Chrome|CriOS/.test(userAgent) ? "Chrome" : /Safari/.test(userAgent) ? "Safari" : "unknown";
  return { platform: mobile ? "mobile_web" : "desktop_web", device_type: tablet ? "tablet" : mobile ? "mobile" : "desktop", os, browser, ...(width ? { viewport_width: width } : {}) };
}

export async function trackOperation<T>(operation: string, work: () => Promise<T>, properties: TelemetryProperties = {}): Promise<T> {
  const finish = beginTelemetry("flow", { operation, phase: "operation", ...properties });
  try { const result = await work(); finish("completed"); return result; }
  catch (error) { const canceled = Boolean(error && typeof error === "object" && "userCancelled" in error && error.userCancelled === true); finish(canceled ? "canceled" : "failed", { reason: canceled ? "user_canceled" : "operation_failed" }); throw error; }
}

const actions = new Set(["save", "save changes", "create", "add", "cancel", "close", "delete", "confirm", "continue", "next", "back", "retry", "upload", "choose files", "manual", "ask clover", "review", "search", "filters", "edit", "export", "sign in", "sign up", "sign out", "restore purchases"]);
export function safeAction(label: string | null | undefined) {
  const text = label?.trim().toLowerCase();
  return text && actions.has(text) ? text.replaceAll(" ", "_") : "other";
}
