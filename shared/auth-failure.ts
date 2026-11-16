const providerReasons = {
  session_exists: "session_exists",
  already_signed_in: "session_exists",
  session_already_exists: "session_exists",
  form_password_incorrect: "credentials",
  form_password_or_identifier_incorrect: "credentials",
  form_identifier_not_found: "credentials",
  form_param_format_invalid: "credentials",
  form_password_length_too_short: "credentials",
  form_param_value_invalid: "authentication_error",
  form_param_missing: "authentication_error",
  form_password_pwned: "password_reset_required",
  form_password_compromised: "password_reset_required",
  form_code_incorrect: "verification",
  verification_expired: "verification",
  verification_failed: "verification",
  verification_strategy_invalid: "verification",
  verification_code_too_many_attempts: "rate_limited",
  verification_code_too_many_requests: "rate_limited",
  too_many_requests: "rate_limited",
  user_locked: "rate_limited",
  strategy_for_user_invalid: "method_unavailable",
  strategy_for_instance_invalid: "method_unavailable",
  external_account_not_found: "method_unavailable",
  network_error: "network",
  ERR_REQUEST_CANCELED: "user_canceled",
  ERR_CANCELED: "user_canceled",
  ERR_USER_CANCELLED: "user_canceled",
} as const;

type ProviderCode = keyof typeof providerReasons;

/** Never send raw provider messages, identifiers, credentials or URLs to analytics. */
export function authFailure(error: unknown) {
  const problem = error as { status?: unknown; code?: unknown; name?: unknown; errors?: { code?: unknown }[] } | null;
  const code = (Array.isArray(problem?.errors) ? problem.errors[0]?.code : undefined) ?? problem?.code;
  const providerCode = typeof code === "string" && Object.prototype.hasOwnProperty.call(providerReasons, code)
    ? code as ProviderCode
    : undefined;
  const status = typeof problem?.status === "number" && Number.isInteger(problem.status) && problem.status >= 400 && problem.status <= 599 ? problem.status : 0;
  const reason = status === 429 ? "rate_limited"
    : status >= 500 ? "provider_unavailable"
    : providerCode ? providerReasons[providerCode]
    : problem?.name === "ClerkOfflineError" || problem?.name === "TypeError" ? "network"
    : "authentication_error";
  return { reason, status, provider_code: providerCode ?? (typeof code === "string" && code ? "other" : "unavailable") };
}

export function needsSignInVerification(status: string | null | undefined) {
  return status === "needs_second_factor" || status === "needs_client_trust";
}
