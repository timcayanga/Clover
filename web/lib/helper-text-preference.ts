export const HELPER_TEXT_STORAGE_KEY = "clover.settings-helper-text";

export function readStoredHelperTextPreference() {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = window.localStorage.getItem(HELPER_TEXT_STORAGE_KEY);
  if (stored === null) {
    return true;
  }

  return stored !== "hidden";
}

export function applyHelperTextPreference(visible: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (visible) {
    document.documentElement.dataset.helperText = "visible";
    document.documentElement.style.removeProperty("--helper-text-display");
    return;
  }

  document.documentElement.dataset.helperText = "hidden";
}
