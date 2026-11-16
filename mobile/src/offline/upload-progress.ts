import type { QueuedFile } from "./file-queue";
/** A transferred source is not a completed import. Only durable completion earns 100%. */
export function uploadProgress(file: Pick<QueuedFile, "state" | "progress" | "sentBytes" | "size">) {
  if (file.state === "done") return 100;
  const transferred = file.size > 0 ? Math.round((file.sentBytes ?? 0) / file.size * 40) : 0;
  const server = Number.isFinite(file.progress) ? file.progress! : 0;
  return Math.min(95, Math.max(0, server, transferred,
    file.state === "processing" || file.state === "finalizing" ? 45 : 0));
}
