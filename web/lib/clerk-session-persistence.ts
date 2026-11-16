export const staySignedInPreferenceKey = "clover.staging.keep-signed-in.v1";
export const rememberedSessionIdKey = "clover.staging.remembered-session-id.v1";

const clearCookie = (name: string) => {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
};

const setCookie = (name: string, value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
};

export const persistStaySignedInPreference = (staySignedIn: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(staySignedInPreferenceKey, staySignedIn ? "true" : "false");
  } catch {
    // Best effort only.
  }
};

export const readStaySignedInPreference = () => {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(staySignedInPreferenceKey) !== "false";
  } catch {
    return true;
  }
};

export const persistRememberedSessionId = (sessionId: string | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (sessionId) {
      window.localStorage.setItem(rememberedSessionIdKey, sessionId);
      setCookie(rememberedSessionIdKey, sessionId);
    } else {
      window.localStorage.removeItem(rememberedSessionIdKey);
      clearCookie(rememberedSessionIdKey);
    }
  } catch {
    // Best effort only.
  }
};

export const readRememberedSessionId = () => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(rememberedSessionIdKey) ?? "";
  } catch {
    return "";
  }
};
