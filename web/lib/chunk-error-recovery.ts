"use client";

import { CHUNK_RECOVERY_QUERY_KEY } from "@/lib/chunk-error-bootstrap";

const CHUNK_ERROR_PATTERN =
  /Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed/i;

const RECOVERY_FLAG = "clover:chunk-error-recovered";

export function isChunkLoadErrorMessage(message: string) {
  return CHUNK_ERROR_PATTERN.test(message);
}

export function getErrorMessage(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return "";
}

export function recoverFromChunkLoadError() {
  if (typeof window === "undefined") {
    return false;
  }

  const currentBuildId = document.body.dataset.buildId ?? "unknown";
  const recoveryKey = `${RECOVERY_FLAG}:${currentBuildId}:${window.location.pathname}`;

  if (window.sessionStorage.getItem(recoveryKey) === "1") {
    return false;
  }

  window.sessionStorage.setItem(recoveryKey, "1");
  const recoveryUrl = new URL(window.location.href);
  recoveryUrl.searchParams.set(CHUNK_RECOVERY_QUERY_KEY, currentBuildId);
  window.location.replace(recoveryUrl.toString());
  return true;
}
