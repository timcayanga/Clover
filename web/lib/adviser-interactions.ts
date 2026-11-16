export type AdviserInteractionKind = "card" | "prompt";

export type AdviserInteractionPayload = {
  kind: AdviserInteractionKind;
  group: string;
  itemId: string;
  label: string;
  href?: string;
  pathname?: string;
};

export const trackAdviserInteraction = (payload: AdviserInteractionPayload) => {
  if (typeof window === "undefined") {
    return;
  }

  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/adviser/interaction", blob)) {
        return;
      }
    } catch {
      // Fall through to fetch.
    }
  }

  void fetch("/api/adviser/interaction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => null);
};
