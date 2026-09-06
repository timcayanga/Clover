"use client";
import { KnowledgeError } from "@/components/knowledge-error";
export default function GuidesError({ reset }: { reset: () => void }) {
  return <KnowledgeError active="guide" reset={reset} />;
}
