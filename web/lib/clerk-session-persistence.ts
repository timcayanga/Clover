export const staySignedInPreferenceKey = "clover.staging.keep-signed-in.v1";
export const rememberedSessionIdKey = "clover.staging.remembered-session-id.v1";

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
    } else {
      window.localStorage.removeItem(rememberedSessionIdKey);
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
