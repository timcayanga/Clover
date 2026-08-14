"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { MOBILE_LAYOUT_MEDIA_QUERY } from "@/lib/responsive-layout";

const ACTION_WIDTH = 82;
const OPEN_THRESHOLD = 38;
const DIRECTION_THRESHOLD = 7;

type GestureState = {
  active: boolean;
  horizontal: boolean | null;
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
};

type MobileSwipeDeleteProps = {
  children: ReactNode;
  deleteLabel: string;
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

const createIdleGesture = (): GestureState => ({
  active: false,
  horizontal: null,
  pointerId: -1,
  startX: 0,
  startY: 0,
  startOffset: 0,
});

export function MobileSwipeDelete({
  children,
  deleteLabel,
  onDelete,
  disabled = false,
  className = "",
}: MobileSwipeDeleteProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<GestureState>(createIdleGesture());
  const suppressClickRef = useRef(false);
  const offsetRef = useRef(0);
  const [offset, setOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isMobileLayout = () =>
    typeof window !== "undefined" &&
    window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches;

  const updateOffset = (nextOffset: number) => {
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const close = () => {
    updateOffset(0);
    setIsDragging(false);
  };

  useEffect(() => {
    if (offset === 0) return;

    const handleOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [offset]);

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      disabled ||
      isDeleting ||
      event.pointerType !== "touch" ||
      !isMobileLayout()
    )
      return;
    gestureRef.current = {
      active: true,
      horizontal: null,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.horizontal === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < DIRECTION_THRESHOLD)
        return;
      gesture.horizontal = Math.abs(deltaX) > Math.abs(deltaY);
      if (!gesture.horizontal) {
        gesture.active = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        return;
      }
      setIsDragging(true);
    }

    if (!gesture.horizontal) return;
    event.preventDefault();
    updateOffset(
      Math.max(-ACTION_WIDTH, Math.min(0, gesture.startOffset + deltaX)),
    );
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;

    const movedHorizontally = gesture.horizontal === true;
    gestureRef.current = createIdleGesture();
    setIsDragging(false);
    if (!movedHorizontally) return;

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    updateOffset(offsetRef.current <= -OPEN_THRESHOLD ? -ACTION_WIDTH : 0);
  };

  const cancelGesture = () => {
    gestureRef.current = createIdleGesture();
    close();
  };

  const handleDelete = async () => {
    if (disabled || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      close();
    }
  };

  const contentStyle = {
    "--mobile-swipe-offset": `${offset}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`mobile-swipe-delete${offset < 0 ? " is-open" : ""}${isDragging ? " is-dragging" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        className="mobile-swipe-delete__action"
        type="button"
        aria-label={deleteLabel}
        tabIndex={offset < 0 ? 0 : -1}
        disabled={disabled || isDeleting}
        onClick={() => void handleDelete()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="m6 7 1 14h10l1-14" />
          <path d="M10 11v6M14 11v6" />
        </svg>
        <span>{isDeleting ? "Deleting" : "Delete"}</span>
      </button>
      <div
        className="mobile-swipe-delete__content"
        style={contentStyle}
        onPointerDown={beginGesture}
        onPointerMove={moveGesture}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onClickCapture={(event) => {
          if (!suppressClickRef.current && offset === 0) return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
      >
        {children}
      </div>
    </div>
  );
}
