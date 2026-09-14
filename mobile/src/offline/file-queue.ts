import type { OfflineStore } from "./types";
export type QueuedFile = {
  id: string;
  workspaceId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  state: "draft" | "queued" | "sending" | "processing" | "done" | "attention";
  error?: string;
  canonicalId?: string;
  password?: string;
};
export type FileTransport = {
  status: (file: QueuedFile) => Promise<{ done: boolean; failed: boolean }>;
  upload: (
    file: QueuedFile,
    base64: string,
  ) => Promise<{ canonicalId?: string }>;
};
/** Original bytes stay encrypted until a durable server acknowledgement. */
export class FileQueue {
  private listeners = new Set<() => void>();
  private flight: Promise<void> | null = null;
  private active = true;
  constructor(
    private store: OfflineStore,
    private transport: FileTransport,
    private authorize: (workspaceId: string) => Promise<void>,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    if (this.active) for (const fn of this.listeners) fn();
  }
  async list() {
    const items = await Promise.all(
      (await this.store.keys("file:")).map((k) =>
        this.store.get<QueuedFile>(k),
      ),
    );
    return items
      .filter((v): v is QueuedFile => Boolean(v))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async add(file: QueuedFile, base64: string) {
    await this.authorize(file.workspaceId);
    const existing = await this.list();
    if (existing.filter((f) => f.state !== "done").length >= 10)
      throw new Error(
        "Sync or remove a queued file before adding another. Up to 10 files can be kept offline.",
      );
    if (file.size > 3500000 || base64.length > 4666670)
      throw new Error("Choose a file up to 3.5 MB.");
    await this.store.set("file-bytes:" + file.id, base64);
    await this.store.set("file:" + file.id, file);
    this.emit();
  }
  async bytes(file: QueuedFile) {
    await this.authorize(file.workspaceId);
    const bytes = await this.store.get<string>("file-bytes:" + file.id);
    if (!bytes)
      throw new Error("The original file is no longer stored on this device.");
    return bytes;
  }
  async enqueue(id: string, password = "") {
    const file = await this.store.get<QueuedFile>("file:" + id);
    if (!file) throw new Error("File unavailable.");
    await this.authorize(file.workspaceId);
    if (!["draft", "attention"].includes(file.state)) return;
    file.state = "queued";
    file.password = password || undefined;
    file.error = undefined;
    await this.store.set("file:" + id, file);
    this.emit();
  }
  async remove(id: string) {
    if (this.flight) throw new Error("Wait for file syncing to finish.");
    await this.store.remove("file:" + id);
    await this.store.remove("file-bytes:" + id);
    this.emit();
  }
  flush() {
    if (this.flight) return this.flight;
    this.flight = this.run().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async run() {
    for (const file of await this.list()) {
      if (!this.active) break;
      if (!["queued", "sending", "processing"].includes(file.state)) continue;
      try {
        await this.authorize(file.workspaceId);
        // A timed-out upload may already exist. Always inspect its stable ID first.
        let exists = false;
        try {
          const status = await this.transport.status(file);
          exists = true;
          file.state = status.done
            ? "done"
            : status.failed
              ? "attention"
              : "processing";
          if (status.failed)
            file.error =
              "The server import needs attention. Open the saved import to review or resume it.";
        } catch (e) {
          if ((e as { status?: number }).status !== 404) throw e;
        }
        if (!exists) {
          const bytes = await this.bytes(file);
          file.state = "sending";
          await this.store.set("file:" + file.id, file);
          this.emit();
          const result = await this.transport.upload(file, bytes);
          file.canonicalId = result.canonicalId;
          file.state = "processing";
        }
        if (file.state === "done" || file.state === "processing") {
          delete file.password;
          await this.store.set("file:" + file.id, file);
          await this.store.remove("file-bytes:" + file.id);
        } else await this.store.set("file:" + file.id, file);
      } catch (e) {
        const status = (e as { status?: number }).status;
        file.error = (e as Error).message;
        if (status && status < 500) file.state = "attention";
        await this.store.set("file:" + file.id, file);
        this.emit();
        if (!status || status >= 500) break;
      }
      this.emit();
    }
  }
  async close() {
    this.active = false;
    await this.flight;
    this.listeners.clear();
  }
}
