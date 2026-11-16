export type FirstUseActivation = {
  state: "start" | "result" | "hidden";
  workspaceId: string;
  transaction?: { id: string; name: string; amount: string; currency: string; date: string; type: string; category: string | null; needsReview: boolean };
};

/** Activation requires usable persisted information, not signup, starter Cash or a zero-value draft. */
export function activationState(hasTransaction: boolean, firstCreatedAt: Date | null, acknowledged: boolean, now = new Date()): FirstUseActivation["state"] {
  if (!hasTransaction) return "start";
  if (acknowledged || !firstCreatedAt || firstCreatedAt > now || now.getTime() - firstCreatedAt.getTime() > 7 * 86400000) return "hidden";
  return "result";
}
