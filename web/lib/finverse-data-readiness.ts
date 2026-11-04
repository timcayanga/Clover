type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const success = new Set(["SUCCESS", "WARNING"]);
const terminal = new Set(["SUCCESS", "WARNING", "ERROR", "NOT_SUPPORTED", "NOT_AVAILABLE", "TEMPORARILY_UNAVAILABLE_FOR_INSTITUTION"]);
/** Finverse /login_identity product_status is authoritative. DATA_AVAILABLE alone is not completion. */
export function finverseDataReadiness(value: unknown) {
  const identity = object(value), products = object(identity.product_status);
  const status = String(identity.status ?? "UNKNOWN");
  const hasProducts = Object.keys(products).length > 0;
  const productStatus = (name: string) => String(object(products[name]).status ?? "UNKNOWN");
  const accounts = productStatus("accounts");
  const transactions = ["online_transactions", "historical_transactions"].filter(name => name in products).map(productStatus);
  const complete = status === "DATA_RETRIEVAL_COMPLETE" || status === "DATA_RETRIEVAL_PARTIALLY_SUCCESSFUL";
  const sessionComplete = identity.session_status === "COMPLETED";
  const accountsReady = hasProducts ? success.has(accounts) : complete;
  // A missing product is not proof of an empty result while retrieval is running.
  const transactionsReady = hasProducts
    ? transactions.length > 0 ? transactions.every(s => terminal.has(s)) && !transactions.every(s => ["ERROR", "TEMPORARILY_UNAVAILABLE_FOR_INSTITUTION"].includes(s)) : sessionComplete && accountsReady
    : complete;
  const failed = ["UNLINKED", "UNLINK_SUCCEEDED", "UNLINK_FAILED"].includes(status) ||
    (hasProducts ? terminal.has(accounts) && !success.has(accounts) || transactions.length > 0 && transactions.every(s => ["ERROR", "TEMPORARILY_UNAVAILABLE_FOR_INSTITUTION"].includes(s)) : status === "ERROR");
  const partial = (status === "DATA_RETRIEVAL_PARTIALLY_SUCCESSFUL" || status === "ERROR") || accounts === "WARNING" || transactions.some(s => ["WARNING", "ERROR", "TEMPORARILY_UNAVAILABLE_FOR_INSTITUTION"].includes(s));
  return { accountsReady, transactionsReady, ready: accountsReady && transactionsReady && !failed, failed, partial, providerStatus: status };
}
