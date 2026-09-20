import { telemetry } from "../../../shared/analytics";
import { NATIVE_UPLOAD_MAX_SIZE } from "../../../shared/native-upload";
import type { OfflineStore } from "./types";
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
};
export type UploadControl = {signal:AbortSignal;progress:(sentBytes:number,finalizing:boolean)=>Promise<void>};
export type FileTransport = {
  cancel?: (file:QueuedFile)=>Promise<void>;
  status: (file: QueuedFile) => Promise<{ done: boolean; failed: boolean }>;
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
  private active = true;
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
    telemetry("offline_action_queued", { action: "file_upload" });
    file.state = "queued";
    file.password = password || file.password;
    file.error = undefined;
    await this.store.set("file:" + id, file);
    this.emit();
  }
  async pause(id:string) {
    const current=this.current;
    if(current?.file.id===id) {
      if(current.file.state==="finalizing"||current.file.state==="processing")throw new Error("Clover is already reading this file. Check its status.");
      current.controller.abort();
      await current.finished;
    }
    const file=await this.store.get<QueuedFile>("file:"+id);
    if(!file)return;
    await this.authorize(file.workspaceId);
    if(["queued","sending","draft","attention","paused"].includes(file.state)){
      file.state="paused";file.error=undefined;
      await this.store.set("file:"+id,file);this.emit();
    }
  }
  async cancel(id:string) {
    await this.pause(id);
    const file=await this.store.get<QueuedFile>("file:"+id);
    if(!file)return;
    if(file.state!=="paused")throw new Error("Clover has already received this file. Open the saved import.");
    await this.transport.cancel?.(file);
    await this.remove(id);
    telemetry("input_canceled", { input_method: "file_upload", phase: "queued" });
  }
  async remove(id: string) {
    if (this.current?.file.id===id) throw new Error("Pause this file before removing it.");
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
          if(controller.signal.aborted)throw new Error("Upload paused.");
          const result = await this.transport.upload(file, bytes, {signal:controller.signal,progress:async(sentBytes,finalizing)=>{
            file.sentBytes=sentBytes;file.state=finalizing?"finalizing":"sending";
            await this.store.set("file:"+file.id,file);this.emit();
          }});
          file.canonicalId = result.canonicalId;
          file.state = "processing";
        }
        if (file.state === "done" || file.state === "processing") {
          delete file.password;
          file.originalRetained=false;
          await this.store.set("file:" + file.id, file);
          await this.store.remove("file-bytes:" + file.id);
        } else await this.store.set("file:" + file.id, file);
      } catch (e) {
        if(controller.signal.aborted && file.state!=="finalizing"){
          file.state="paused";file.error=undefined;
          await this.store.set("file:"+file.id,file);this.emit();continue;
        }
        const status = (e as { status?: number }).status;
        file.error = (e as Error).message;
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
