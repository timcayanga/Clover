// Print only the exported snapshot, never the current Settings screen.
export async function printSnapshot(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-10000px";
  frame.title = "Clover financial snapshot";
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve(); frame.onerror = () => reject(new Error("Unable to prepare snapshot."));
  });
  frame.srcdoc = html;
  document.body.appendChild(frame);
  try {
    await loaded;
    if (!frame.contentWindow) throw new Error("Printing is unavailable.");
    const printWindow = frame.contentWindow;
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 120000);
      printWindow.addEventListener("afterprint", () => { window.clearTimeout(timer); resolve(); }, { once: true });
      printWindow.focus(); printWindow.print();
    });
  } finally { frame.remove(); }
}
