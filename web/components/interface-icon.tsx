import type { CSSProperties } from "react";

export const INTERFACE_ICON_NAMES = ["details", "upload", "download", "undo", "redo", "edit", "delete", "close", "cancel", "pause", "resume", "retry", "date"] as const;
export type InterfaceIconName = typeof INTERFACE_ICON_NAMES[number];

// Mask the exported Figma mark so existing primary, destructive and disabled
// controls retain their semantic foreground color.
export function InterfaceIcon({ name, size = 20, className = "" }: { name: InterfaceIconName; size?: number; className?: string }) {
  const url = `url("/figma-icons/interface/${name}.svg")`;
  return <span aria-hidden="true" className={`interface-icon ${className}`} style={{ width: size, height: size, maskImage: url, WebkitMaskImage: url } as CSSProperties} />;
}
