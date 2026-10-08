"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { walletGeometry } from "../../shared/account-wallet";

export function AccountWallet({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 342, height: 87 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setSize({ width: node.offsetWidth, height: node.offsetHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const inset = walletGeometry.stitchInset;
  return <div ref={ref} className="accounts-mobile-list accounts-mobile-list--mobile accounts-wallet" aria-label={label}>
    {children}
    <svg aria-hidden="true" className="accounts-wallet__stitch" width="100%" height="100%" viewBox={`0 0 ${size.width} ${size.height}`}>
      <rect className="accounts-wallet__holes" x={inset} y={inset + .35} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={walletGeometry.stitchRadius} />
      <rect className="accounts-wallet__thread" x={inset} y={inset} width={Math.max(0, size.width - inset * 2)} height={Math.max(0, size.height - inset * 2)} rx={walletGeometry.stitchRadius} />
    </svg>
  </div>;
}
