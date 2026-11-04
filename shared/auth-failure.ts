/** Never send raw provider messages, identifiers, credentials or URLs to analytics. */
export function authFailure(error: unknown) {
  const problem = error as { status?: number; code?: string; name?: string; errors?: {code?: string}[] } | null;
  const code = problem?.errors?.[0]?.code ?? problem?.code ?? "";
  const status = typeof problem?.status === "number" && problem.status >= 400 && problem.status <= 599 ? problem.status : 0;
  const reason = code === "ERR_REQUEST_CANCELED" || code === "ERR_CANCELED" || code === "ERR_USER_CANCELLED" ? "user_canceled"
    : ["session_exists", "already_signed_in", "session_already_exists"].includes(code) ? "session_exists"
    : ["form_password_incorrect", "form_identifier_not_found", "form_param_format_invalid", "form_password_length_too_short"].includes(code) ? "credentials"
    : /too_many|rate_limit/.test(code) || status === 429 ? "rate_limited"
    : /verification|code_incorrect|code_expired/.test(code) ? "verification"
    : code === "network_error" || problem?.name === "ClerkOfflineError" || problem?.name === "TypeError" ? "network"
    : status >= 500 ? "provider_unavailable" : "authentication_error";
  return { reason, status };
}

export function needsSignInVerification(status: string | null | undefined) {
  return status === "needs_second_factor" || status === "needs_client_trust";
}
