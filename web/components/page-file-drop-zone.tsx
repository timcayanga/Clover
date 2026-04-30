"use client";

import { useEffect, useState } from "react";

type PageFileDropZoneProps = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  onFilesDropped: (files: File[]) => void;
};

const isFileDrag = (event: DragEvent) => {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("Files");
};

export function PageFileDropZone({
  enabled = true,
  title = "Drop files anywhere",
  subtitle = "Clover will pick them up and start importing right away.",
  onFilesDropped,
}: PageFileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setDragging(false);
      return;
    }

    let dragDepth = 0;

    const handleDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      dragDepth += 1;
      setDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      setDragging(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setDragging(false);
      }
      event.preventDefault();
    };

    const handleDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) {
        return;
      }

      event.preventDefault();
      dragDepth = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) {
        onFilesDropped(files);
      }
    };

    const capture = true;

    document.addEventListener("dragenter", handleDragEnter, capture);
    document.addEventListener("dragover", handleDragOver, capture);
    document.addEventListener("dragleave", handleDragLeave, capture);
    document.addEventListener("drop", handleDrop, capture);
    window.addEventListener("dragenter", handleDragEnter, capture);
    window.addEventListener("dragover", handleDragOver, capture);
    window.addEventListener("dragleave", handleDragLeave, capture);
    window.addEventListener("drop", handleDrop, capture);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter, capture);
      document.removeEventListener("dragover", handleDragOver, capture);
      document.removeEventListener("dragleave", handleDragLeave, capture);
      document.removeEventListener("drop", handleDrop, capture);
      window.removeEventListener("dragenter", handleDragEnter, capture);
      window.removeEventListener("dragover", handleDragOver, capture);
      window.removeEventListener("dragleave", handleDragLeave, capture);
      window.removeEventListener("drop", handleDrop, capture);
    };
  }, [enabled, onFilesDropped]);

  if (!enabled || !dragging) {
    return null;
  }

  return (
    <div className="page-file-drop-zone" aria-hidden="true">
      <div className="page-file-drop-zone__frame" />
      <div className="page-file-drop-zone__corner page-file-drop-zone__corner--tl" />
      <div className="page-file-drop-zone__corner page-file-drop-zone__corner--tr" />
      <div className="page-file-drop-zone__corner page-file-drop-zone__corner--bl" />
      <div className="page-file-drop-zone__corner page-file-drop-zone__corner--br" />
      <div className="page-file-drop-zone__content">
        <p className="page-file-drop-zone__eyebrow">Import files</p>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </div>
  );
}
