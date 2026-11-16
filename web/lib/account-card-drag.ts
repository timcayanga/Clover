export const ACCOUNT_CARD_DRAG_MIME = "application/x-clover-account-id";

export const hasActiveAccountCardDrag = (
  activeAccountId: string | null,
  transferTypes: readonly string[]
) =>
  Boolean(
    activeAccountId ||
      transferTypes.includes(ACCOUNT_CARD_DRAG_MIME) ||
      transferTypes.includes("text/plain")
  );

export const readDraggedAccountId = (
  getData: (type: string) => string,
  fallbackAccountId: string | null
) =>
  getData(ACCOUNT_CARD_DRAG_MIME).trim() ||
  getData("text/plain").trim() ||
  fallbackAccountId ||
  "";
