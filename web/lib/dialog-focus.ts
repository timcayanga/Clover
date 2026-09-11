const selector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]';

export function containDialogFocus(dialog: HTMLElement, initial?: HTMLElement | null, fallback?: HTMLElement | null) {
  const previous = document.activeElement;
  const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector))
    .flatMap(element => {
      // Portaled pickers belong to the dialog through their trigger's aria-controls.
      const controlled = element.getAttribute("aria-expanded") === "true"
        ? document.getElementById(element.getAttribute("aria-controls") ?? "")
        : null;
      return controlled && !dialog.contains(controlled)
        ? [element, ...controlled.querySelectorAll<HTMLElement>(selector)]
        : [element];
    })
    .filter(element => element.getClientRects().length > 0 && !element.closest('[inert], [hidden]'));
  (initial ?? controls()[0] ?? dialog).focus();
  const trap = (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const elements = controls(), first = elements[0], last = elements.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    const index = elements.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    if (index < 0) {
      (event.shiftKey ? last : first).focus();
    } else {
      // Explicit traversal keeps an owned portal beside its trigger in Tab order.
      elements[(index + (event.shiftKey ? -1 : 1) + elements.length) % elements.length].focus();
    }
  };
  document.addEventListener("keydown", trap);
  return () => {
    document.removeEventListener("keydown", trap);
    if (previous instanceof HTMLElement && previous.isConnected && previous !== document.body) previous.focus();
    else if (fallback?.isConnected) fallback.focus();
  };
}
