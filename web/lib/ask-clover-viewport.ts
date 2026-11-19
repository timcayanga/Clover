/** Keep the mobile sheet in the visible viewport when a keyboard opens or pans it. */
export function bindAskCloverViewport(panel: HTMLElement, browser: Window = window) {
  const viewport = browser.visualViewport;
  let frame: number | null = null;
  const update = () => {
    frame = null;
    const height = Math.max(1, Math.min(browser.innerHeight, viewport?.height ?? browser.innerHeight));
    const bottom = Math.max(0, browser.innerHeight - height - (viewport?.offsetTop ?? 0));
    panel.style.setProperty("--ask-visible-height", `${height}px`);
    panel.style.setProperty("--ask-keyboard-inset", `${bottom}px`);
  };
  const schedule = () => {
    if (frame === null) frame = browser.requestAnimationFrame(update);
  };
  update();
  browser.addEventListener("resize", schedule);
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  return () => {
    browser.removeEventListener("resize", schedule);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    if (frame !== null) browser.cancelAnimationFrame(frame);
    panel.style.removeProperty("--ask-visible-height");
    panel.style.removeProperty("--ask-keyboard-inset");
  };
}
