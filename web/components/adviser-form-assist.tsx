"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { EntryFormContext } from "@/lib/adviser-entry-types";
import { entryFormSchema } from "@/lib/adviser-entry-schema";
let current: {
  workspaceId: string;
  context: EntryFormContext;
  at: number;
} | null = null;
export function readAdviserFormContext(workspaceId: string) {
  return current?.workspaceId === workspaceId &&
    Date.now() - current.at < 10 * 60 * 1000
    ? current.context
    : undefined;
}
export function clearAdviserFormContext() {
  current = null;
}
export function AdviserFormAssist({
  workspaceId,
  context,
}: {
  workspaceId: string;
  context: EntryFormContext;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const serialized = JSON.stringify(context);
  useEffect(() => {
    const parsed = entryFormSchema.safeParse(JSON.parse(serialized));
    if (parsed.success)
      current = { workspaceId, context: parsed.data, at: Date.now() };
  }, [serialized, workspaceId]);
  useEffect(() => {
    const form = ref.current?.closest("form");
    const focus = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (current?.workspaceId !== workspaceId || target.type === "password")
        return;
      const label =
        target.name ||
        target.getAttribute("aria-label") ||
        target.closest("label")?.textContent?.trim().slice(0, 80) ||
        "";
      current = {
        ...current,
        context: { ...current.context, focusedField: label.slice(0, 80) },
        at: Date.now(),
      };
    };
    form?.addEventListener("focusin", focus);
    return () => {
      form?.removeEventListener("focusin", focus);
      if (
        window.location.pathname !== "/adviser" &&
        current?.workspaceId === workspaceId
      )
        current = null;
    };
  }, [workspaceId]);
  return (
    <span ref={ref}>
      <Link href="/adviser" className="button button-secondary button-small">
        Ask Adviser about this form
      </Link>
    </span>
  );
}
