"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { stepWalletSpring, walletCardLayout, walletGeometry } from "../../shared/account-wallet";

export function AccountWallet({ children, label }: { children: ReactNode; label: string }) {
  const inset = walletGeometry.stitchInset;
  const seamSize = `calc(100% - ${inset * 2}px)`;
  return <div className="accounts-mobile-list accounts-mobile-list--mobile accounts-wallet" aria-label={label}>
    <div className="accounts-wallet__inset">{children}</div>
    <svg aria-hidden="true" className="accounts-wallet__stitch" width="100%" height="100%">
      <rect className="accounts-wallet__holes" x={inset} y={inset + .35} width={seamSize} height={seamSize} rx={walletGeometry.stitchRadius} />
      <rect className="accounts-wallet__thread" x={inset} y={inset} width={seamSize} height={seamSize} rx={walletGeometry.stitchRadius} />
    </svg>
  </div>;
}

export function AccountWalletPocket({ children, expanded, label, foreground, onToggle }: {
  children: ReactNode; expanded: boolean; label: string; foreground: string; onToggle: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);
  const motion = useRef({ position: expanded ? 1 : 0, velocity: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const target = expanded ? 1 : 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, last = 0, width = node.clientWidth;
    const draw = () => {
      const p = motion.current.position;
      const layout = walletCardLayout(width, p);
      const values: Record<string, string> = {
        "--pocket-height": `${layout.height}px`, "--card-width": `${layout.cardWidth}px`, "--card-height": `${layout.cardHeight}px`,
        "--card-x": `${layout.x}px`, "--card-y": `${layout.y}px`, "--card-scale": String(layout.scale),
        "--card-icon": `${22 + 10 * p}px`, "--card-name-size": `${13 + 3 * p}px`, "--card-name-left": `${42 + 10 * p}px`,
        "--card-number-y": `${35 + 28 * p}px`, "--card-number-size": `${10 + p}px`,
        "--card-amount-y": `${33 + (layout.cardHeight - 85) * p}px`, "--card-amount-size": `${15 + 10 * p}px`,
        "--sleeve-shadow": String(.23 * (1 - p) ** 3), "--card-shadow": `0 ${4 * p}px ${5 * p}px rgb(0 0 0 / ${.15 * p})`,
      };
      Object.entries(values).forEach(([key, value]) => node.style.setProperty(key, value));
    };
    const tick = (time: number) => {
      motion.current = stepWalletSpring(motion.current.position, motion.current.velocity, target, last ? (time - last) / 1000 : 1 / 60);
      last = time; draw();
      if (motion.current.position !== target || motion.current.velocity !== 0) frame = requestAnimationFrame(tick);
    };
    const snap = () => { cancelAnimationFrame(frame); motion.current = { position: target, velocity: 0 }; draw(); };
    const preferencesChanged = () => { if (reduce.matches) snap(); };
    const visibilityChanged = () => { if (document.hidden) snap(); };
    const observer = new ResizeObserver(() => { const next = node.clientWidth; if (next !== width) { width = next; draw(); } });
    observer.observe(node); draw();
    if (reduce.matches || document.hidden) snap(); else frame = requestAnimationFrame(tick);
    reduce.addEventListener("change", preferencesChanged); document.addEventListener("visibilitychange", visibilityChanged);
    if (expanded && document.activeElement === toggleRef.current) collapseRef.current?.focus({ preventScroll: true });
    if (!expanded && document.activeElement === collapseRef.current) toggleRef.current?.focus({ preventScroll: true });
    return () => { cancelAnimationFrame(frame); observer.disconnect(); reduce.removeEventListener("change", preferencesChanged); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [expanded]);
  return <div ref={ref} className={`accounts-mobile-list-item wallet-pocket${expanded ? " is-expanded" : ""}`} style={{ color: foreground }}>
    <div className="wallet-pocket__card" inert={!expanded} aria-hidden={!expanded}>{children}</div>
    <button ref={toggleRef} className="accounts-mobile-list-row wallet-pocket__toggle" type="button" aria-label={`Show ${label} card`} aria-expanded={expanded} aria-hidden={expanded} tabIndex={expanded ? -1 : 0} onClick={onToggle} />
    <button ref={collapseRef} className="wallet-pocket__collapse" type="button" aria-label={`Hide ${label} card`} aria-expanded={expanded} aria-hidden={!expanded} tabIndex={expanded ? 0 : -1} onClick={onToggle}><span aria-hidden="true">⌃</span></button>
    <span className="wallet-pocket__chevron" aria-hidden="true">⌄</span>
    <span className="wallet-pocket__sleeve" aria-hidden="true" />
  </div>;
}
