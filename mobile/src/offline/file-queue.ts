import { telemetry } from "../../../shared/analytics";
import { NATIVE_UPLOAD_MAX_SIZE, uploadSizeProblem } from "../../../shared/native-upload";
import type { OfflineStore } from "./types";
import type { DeviceTextEvidence } from "../../../shared/device-text-evidence";
export type QueuedFile = {
  id: string;
  workspaceId: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
  state: "draft" | "queued" | "sending" | "paused" | "finalizing" | "processing" | "done" | "attention";
  sentBytes?: number;
  originalRetained?: boolean;
  error?: string;
  canonicalId?: string;
  password?: string;
  importMode?: "receipt" | "statement" | "portfolio" | "account_detail";
  progress?: number;
  message?: string;
  processingPhase?: string;
  canResume?: boolean;
  serverPaused?: boolean;
  needsPassword?: boolean;
  deviceText?: DeviceTextEvidence;
};
export type UploadControl = {
  signal: AbortSignal;
  progress: (sentBytes: number, finalizing: boolean) => Promise<void>;
  saveDeviceText?: (evidence: DeviceTextEvidence) => Promise<void>;
};
export type FileTransport = {
  unlock?: (file: QueuedFile, password: string) => Promise<{ canonicalId?: string }>;
  cancel?: (file:QueuedFile)=>Promise<void>;
  control?: (file: QueuedFile, action: "pause" | "resume" | "cancel") => Promise<void>;
  status: (file: QueuedFile) => Promise<{ done: boolean; failed: boolean; processingPhase?: string; paused?: boolean; cancelled?: boolean; progress?: number; message?: string; canResume?: boolean; needsPassword?: boolean }>;
  upload: (
    file: QueuedFile,
    base64: string,
    control: UploadControl,
  ) => Promise<{ canonicalId?: string }>;
};
/** Original bytes stay encrypted until a durable server acknowledgement. */
export class FileQueue {
  private listeners = new Set<() => void>();
  private flight: Promise<void> | null = null;
  private flushAgain = false;
  private active = true;
  private controls = new Map<string, "paused" | "cancelled">();
  private current: {file:QueuedFile;controller:AbortController;finished:Promise<void>} | null = null;
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
    const sizeProblem = uploadSizeProblem(file.name, file.mimeType, file.size);
    if (sizeProblem) throw new Error(sizeProblem);
    const existing = await this.list();
    if(existing.some(item=>item.id===file.id))throw new Error("This file is already queued.");
    if (existing.filter((f) => f.state !== "done").length >= 10)
      throw new Error(
        "Sync or remove a queued file before adding another. Up to 10 files can be kept offline.",
      );
    if (!Number.isInteger(file.size) || file.size <= 0 || file.size > NATIVE_UPLOAD_MAX_SIZE || base64.length !== Math.ceil(file.size/3)*4)
      throw new Error("Choose a valid file up to 25 MB.");
    if(existing.filter(f=>f.state!=="done"&&f.state!=="processing").reduce((sum,f)=>sum+f.size,0)+file.size>50*1024*1024) throw new Error("Finish or remove queued files first. Up to 50 MB can be kept offline.");
    await this.store.set("file-bytes:" + file.id, base64);
    await this.store.set("file:" + file.id, {...file,originalRetained:true});
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
    if (!["draft", "attention", "paused"].includes(file.state)) return;
    if (file.serverPaused) {
      if (!this.transport.control) throw new Error("Resume this import when connected.");
      await this.transport.control(file, "resume");
      file.serverPaused = false;
    }
    this.controls.delete(id);
    telemetry("offline_action_queued", { action: "file_upload" });
    file.state = "queued";
    file.password = password || file.password;
    file.error = undefined;
    await this.store.set("file:" + id, file);
    this.emit();
  }
  async pause(id:string) {
    const file = await this.store.get<QueuedFile>("file:" + id);
    if (!file || file.state === "done") return;
    await this.authorize(file.workspaceId);
    const received = file.originalRetained === false || ["finalizing", "processing"].includes(file.state);
    if (received) {
      if (!this.transport.control) throw new Error("Pause is unavailable for this saved import.");
      await this.transport.control(file, "pause");
      this.controls.set(id, "paused");
      file.serverPaused = true;
    } else if (this.current?.file.id === id) {
      this.current.controller.abort();
      await this.current.finished;
    }
    file.state = "paused"; file.error = undefined;
    await this.store.set("file:" + id, file); this.emit();
  }
  async cancel(id:string) {
    const file = await this.store.get<QueuedFile>("file:" + id);
    if (!file) return;
    await this.authorize(file.workspaceId);
    const received = file.serverPaused || file.originalRetained === false || ["finalizing", "processing"].includes(file.state);
    if (received) {
      if (!this.transport.control) throw new Error("Cancel is unavailable for this saved import.");
      await this.transport.control(file, "cancel");
      this.controls.set(id, "cancelled");
      await this.store.remove("file:" + id);
      await this.store.remove("file-bytes:" + id);
      this.emit();
    } else {
      await this.pause(id);
      await this.transport.cancel?.(file);
      await this.remove(id);
    }
    telemetry("input_canceled", { input_method: "file_upload", phase: received ? "processing" : "queued" });
  }
  async remove(id: string) {
    if (this.current?.file.id===id) throw new Error("Pause this file before removing it.");
    await this.store.remove("file:" + id);
    await this.store.remove("file-bytes:" + id);
    this.emit();
  }
  flush() {
    if (this.flight) { this.flushAgain = true; return this.flight; }
    this.flight = (async () => {
      do { this.flushAgain = false; await this.run(); } while (this.active && this.flushAgain);
    })().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  private async run() {
    for (const item of await this.list()) {
      if (!this.active) break;
      const file=await this.store.get<QueuedFile>("file:"+item.id);
      if(!file)continue;
      if (!["queued", "sending", "finalizing", "processing"].includes(file.state)) continue;
      const controller=new AbortController();
      let finish!:()=>void;
      const finished=new Promise<void>(resolve=>{finish=resolve;});
      this.current={file,controller,finished};
      try {
        await this.authorize(file.workspaceId);
        // A timed-out upload may already exist. Always inspect its stable ID first.
        let exists = false;
        try {
          const status = await this.transport.status(file);
          exists = true;
          file.progress = Math.max(file.progress ?? 0, status.progress ?? 0);
          file.message = status.message;
          file.processingPhase = status.processingPhase;
          file.canResume = status.canResume;
          file.needsPassword = status.needsPassword && !status.done;
          file.error = undefined;
          if (status.cancelled) {
            await this.store.remove("file:" + file.id);
            await this.store.remove("file-bytes:" + file.id);
            continue;
          }
          file.serverPaused = status.paused;
          file.state = status.paused ? "paused" : status.done
            ? "done"
            : status.failed
              ? "attention"
              : "processing";
          if (status.needsPassword && !status.done) {
            file.state = "attention";
            if (file.password && this.transport.unlock) {
              const password = file.password;
              delete file.password;
              file.state = "finalizing";
              file.message = "Unlocking and reading your statement…";
              await this.store.set("file:" + file.id, file);
              this.emit();
              const result = await this.transport.unlock(file, password);
              file.canonicalId = result.canonicalId ?? file.canonicalId;
              file.needsPassword = false;
              file.state = "processing";
            } else file.error = status.message || "Enter the statement password to continue.";
          } else if (status.failed) {
            file.error = status.message || "This file needs review. Open it to check the details.";
          }
        } catch (e) {
          if (exists || (e as { status?: number }).status !== 404) throw e;
        }
        if (!exists && (file.originalRetained === false || file.canonicalId)) {
          throw Object.assign(new Error("The saved import could not be found. Please check your import history."), { status: 404 });
        }
        if (!exists) {
          const bytes = await this.bytes(file);
          file.state = "sending";
          await this.store.set("file:" + file.id, file);
          this.emit();
          if(controller.signal.aborted)throw new Error("Upload paused.");
          const result = await this.transport.upload(file, bytes, {signal:controller.signal,saveDeviceText:async(evidence)=>{
            file.deviceText=evidence;
            await this.store.set("file:"+file.id,file);
          },progress:async(sentBytes,finalizing)=>{
            file.sentBytes=sentBytes;file.state=finalizing?"finalizing":"sending";
            await this.store.set("file:"+file.id,file);this.emit();
          }});
          file.canonicalId = result.canonicalId;
          file.state = "processing";
        }
        const control = this.controls.get(file.id);
        if (control === "cancelled") continue;
        if (control === "paused") { file.state = "paused"; file.serverPaused = true; }
        if (file.state === "done" || file.state === "processing") {
          delete file.password;
          file.originalRetained=false;
          await this.store.set("file:" + file.id, file);
          await this.store.remove("file-bytes:" + file.id);
        } else await this.store.set("file:" + file.id, file);
      } catch (e) {
        if (this.controls.get(file.id) === "cancelled") continue;
        if (this.controls.get(file.id) === "paused") { file.state = "paused"; file.serverPaused = true; file.error = undefined; await this.store.set("file:" + file.id, file); continue; }
        if(controller.signal.aborted && file.state!=="finalizing"){
          file.state="paused";file.error=undefined;
          await this.store.set("file:"+file.id,file);this.emit();continue;
        }
        const status = (e as { status?: number }).status;
        file.error = (e as Error).message;
        if ((e as { data?: { code?: string } }).data?.code === "IMPORT_PASSWORD_REQUIRED" ||
            (status === 422 && /password/i.test(file.error))) {
          file.needsPassword = true;
          delete file.password;
        }
        if (status && status < 500) file.state = "attention";
        await this.store.set("file:" + file.id, file);
        this.emit();
        if (!status || status >= 500) break;
      } finally {this.current=null;finish();}
      this.emit();
    }
  }
  async close() {
    this.active = false;
    if(this.current?.file.state!=="finalizing")this.current?.controller.abort();
    await this.flight;
    this.listeners.clear();
  }
}
