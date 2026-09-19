"use client";
import { useRef, useState } from "react";

export function UploadSourceButtons({
  onFiles,
  onCamera,
  onLibrary,
}: {
  onFiles: () => void;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const [cameraHelp, setCameraHelp] = useState(false);
  return (
    <>
      {cameraHelp ? (
        <p role="status">
          If your camera does not open, allow camera access in your browser or
          device settings. You can also choose a file or enter the transaction
          manually.
        </p>
      ) : null}
    <div className="organize-upload-choices">
      {(
        [
          ["files", "Choose files", onFiles],
          ["camera", "Take photo", onCamera],
          ["library", "Photo library", onLibrary],
        ] as const
      ).map(([key, label, onClick]) => (
        <button
          key={key}
          className={`button button-secondary organize-upload-choice--${key}`}
          type="button"
          onClick={() => {
            setCameraHelp(key === "camera");
            onClick();
          }}
        >
          <img
            src={`/assets/organize/upload-${key}.svg`}
            alt=""
            width="56"
            height="56"
          />
          {label}
        </button>
      ))}
    </div>
    </>
  );
}
export function UploadSourcePicker({
  onSelect,
}: {
  onSelect: (files: File[]) => void;
}) {
  const files = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    library = useRef<HTMLInputElement>(null);
  const selected = (input: HTMLInputElement) => {
    const batch = Array.from(input.files ?? []);
    input.value = "";
    if (batch.length) onSelect(batch);
  };
  return (
    <>
      <input
        ref={files}
        className="hidden-file-input"
        hidden
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.csv,.heic"
        onChange={(e) => selected(e.currentTarget)}
      />
      <input
        ref={camera}
        className="hidden-file-input"
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => selected(e.currentTarget)}
      />
      <input
        ref={library}
        className="hidden-file-input"
        hidden
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => selected(e.currentTarget)}
      />
      <UploadSourceButtons
        onFiles={() => files.current?.click()}
        onCamera={() => camera.current?.click()}
        onLibrary={() => library.current?.click()}
      />
    </>
  );
}
export function UploadSecurityCopy() {
  return (
    <div className="accounts-import-footer-copy">
      <p>
        Your files are protected with encrypted connections and restricted
        access. Clover never sells your data.
      </p>
      <p>Password-protected PDFs supported.</p>
    </div>
  );
}
