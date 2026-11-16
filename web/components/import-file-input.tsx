"use client";

import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal, flushSync } from "react-dom";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onFiles: (files: File[]) => void;
};

// Keep the first acknowledgement local to the input. Mounting the transaction
// import surface can otherwise block its first paint on slower mobile devices.
export const ImportFileInput = forwardRef<HTMLInputElement, Props>(function ImportFileInput({ onFiles, ...props }, ref) {
  const [preparing, setPreparing] = useState(false);
  const frame = useRef<number | null>(null);
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  return <>
    <input {...props} ref={ref} disabled={props.disabled || preparing} onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      if (!files.length) return;
      flushSync(() => setPreparing(true));
      // The second frame allows the acknowledgement to paint before mounting
      // the larger modal. File preparation and upload still run exactly once.
      frame.current = requestAnimationFrame(() => {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          try { onFiles(files); } finally { setPreparing(false); }
        });
      });
    }} />
    {preparing && createPortal(
      <div className="import-upload-dock" role="status" aria-live="polite" data-import-preparing>
        <div className="import-upload-dock__inner glass">Preparing upload…</div>
      </div>, document.body
    )}
  </>;
});
