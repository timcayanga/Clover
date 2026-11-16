const FINALIZING_NOTICE_DISMISSALS_KEY = "clover.finalizing-notice-dismissals.v1";

const readDismissals = () => {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(FINALIZING_NOTICE_DISMISSALS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []);
  } catch {
    return new Set<string>();
  }
};

export const buildFinalizingNoticeDismissalKey = (params: {
  workspaceId?: string | null;
  accountId?: string | null;
  importFileIds?: string[];
  transactionIds?: string[];
}) => {
  const workspacePart = params.workspaceId?.trim() || "workspace";
  const accountPart = params.accountId?.trim() || "all-accounts";
  const importSignature = Array.from(new Set(params.importFileIds?.filter(Boolean) ?? [])).sort();
  const transactionSignature = Array.from(new Set(params.transactionIds?.filter(Boolean) ?? [])).sort();
  const detailSignature =
    importSignature.length > 0
      ? `imports:${importSignature.join(",")}`
      : `transactions:${transactionSignature.length}:${transactionSignature.slice(0, 24).join(",")}`;

  return `${workspacePart}:${accountPart}:${detailSignature}`;
};

export const isFinalizingNoticeDismissed = (dismissalKey: string | null | undefined) => {
  if (!dismissalKey) {
    return false;
  }

  return readDismissals().has(dismissalKey);
};

export const dismissFinalizingNotice = (dismissalKey: string | null | undefined) => {
  if (!dismissalKey || typeof window === "undefined") {
    return;
  }

  const dismissals = readDismissals();
  dismissals.add(dismissalKey);
  window.localStorage.setItem(FINALIZING_NOTICE_DISMISSALS_KEY, JSON.stringify(Array.from(dismissals)));
};
