import type { Transaction } from "../types";
import { importPresentationTimings, type importPollTimings } from "../../../shared/import-commit-timing";
import { receiptReviewReason, reportFirstReceiptOutcome, reportReceiptReviewPrompt, type FirstReceiptScan, type FirstReceiptOutcome, type ReceiptOutcomeReason } from "../../../shared/receipt-first-attempt";
import type { ReceiptDraftMissingField } from "../../../shared/receipt-draft";
import type { ReceiptCaptureLocation } from "../../../shared/receipt-capture-location";
import { newTelemetryId, telemetry } from "../../../shared/analytics";
import { NATIVE_UPLOAD_MAX_SIZE, NATIVE_UPLOAD_PART_SIZE, nativeUploadPartBytes, nativeUploadRejection, uploadSizeProblem } from "../../../shared/native-upload";
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
  uploadTransfer?: { attempts: number; startedAt: number; dispatchedParts: number[] };
  originalRetained?: boolean;
  chunkedSource?: boolean;
  error?: string;
  progressNoticeSeen?: boolean;
  canonicalId?: string;
  receiptTransactionId?: string;
  pdfVisibilityTarget?: { attemptId: string; transactionId: string };
  pdfVisibilityReadyAt?: number;
  commitNotice?: { noticedAt: number; polling: ReturnType<typeof importPollTimings> };
  pdfTiming?: { startedAt: number; transferMs: number; finalizeRequestMs?: number; resumed: boolean };
  receiptTiming?: { id: string; startedAt: number; outcome?: string };
  password?: string;
  importMode?: "receipt" | "statement" | "portfolio" | "account_detail";
  progress?: number;
  message?: string;
  processingPhase?: string;
  canResume?: boolean;
  serverPaused?: boolean;
  needsPassword?: boolean;
  deviceText?: DeviceTextEvidence;
  receiptCaptureLocation?: ReceiptCaptureLocation;
  cameraPhoto?: boolean;
  firstReceiptScan?: FirstReceiptScan;
};
export type DeviceTextPreparation = { full: Promise<DeviceTextEvidence | undefined>; partial?: Promise<DeviceTextEvidence | undefined> };
export type UploadControl = {
  signal: AbortSignal;
  progress: (sentBytes: number, finalizing: boolean) => Promise<void>;
  markPartDispatched?: (index: number) => Promise<void>;
  savePdfTiming?: (timing: NonNullable<QueuedFile["pdfTiming"]>) => Promise<void>;
  preparedDeviceText?: DeviceTextPreparation;
  saveDeviceText?: (evidence: DeviceTextEvidence) => void;
};
export type UploadPartReader = (index: number) => Promise<string>;
export type UploadSource = string | UploadPartReader;

export async function readUploadPart(source: UploadSource, size: number, index: number) {
  const length = nativeUploadPartBytes(size, index);
  if (!length) throw new Error("Invalid upload part.");
  const start = (index * NATIVE_UPLOAD_PART_SIZE / 3) * 4;
  const encodedLength = Math.ceil(length / 3) * 4;
  const part = typeof source === "string" ? source.slice(start, start + encodedLength) : await source(index);
  const padding = part.endsWith("==") ? 2 : part.endsWith("=") ? 1 : 0;
  if (part.length !== encodedLength || encodedLength * 3 / 4 - padding !== length)
    throw new Error("This file could not be read completely. Please choose it again or retake the photo.");
  return part;
}

export type FileTransport = {
  unlock?: (file: QueuedFile, password: string) => Promise<{ canonicalId?: string }>;
  cancel?: (file:QueuedFile)=>Promise<void>;
  control?: (file: QueuedFile, action: "pause" | "resume" | "cancel") => Promise<void>;
  status: (file: QueuedFile) => Promise<{ done: boolean; failed: boolean; commitNotice?: QueuedFile["commitNotice"]; receiptTransactionId?: string; receiptTransaction?: Transaction; pdfVisibilityTarget?: QueuedFile["pdfVisibilityTarget"]; processingPhase?: string; paused?: boolean; cancelled?: boolean; progress?: number; message?: string; canResume?: boolean; needsPassword?: boolean }>;
  upload: (
    file: QueuedFile,
    source: UploadSource,
    control: UploadControl,
  ) => Promise<{ canonicalId?: string }>;
};
/** Original bytes stay encrypted until a durable server acknowledgement. */
export class FileQueue {
  private listeners = new Set<() => void>();
  private readonly preparations = new Map<string, DeviceTextPreparation>();
  private retaining: Promise<void> = Promise.resolve();
  private flight: Promise<void> | null = null;
  private flushAgain = false;
  private active = true;
  private readonly reportedTimings = new Map<string, string>();
  private controls = new Map<string, "paused" | "cancelled">();
  private current: {file:QueuedFile;controller:AbortController;finished:Promise<void>} | null = null;
  private committedReceipts = new Map<string, Transaction>();
  getCommittedReceipts(workspaceId: string) {
    return [...this.committedReceipts.values()].filter(row => row.workspaceId === workspaceId);
  }
  acknowledgeCommittedReceipts(rows: readonly Transaction[]) {
    for (const row of rows) {
      const key = JSON.stringify([row.workspaceId, row.id]);
      if (this.committedReceipts.get(key) === row) this.committedReceipts.delete(key);
    }
  }
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
    await Promise.all(items.map(async file => {
      if (file?.receiptTiming && !file.receiptTiming.outcome) {
        file.receiptTiming.outcome = this.reportedTimings.get(file.receiptTiming.id)
          ?? await this.store.get<string>("receipt-outcome:" + file.receiptTiming.id)
          ?? undefined;
      }
    }));
    return items
      .filter((v): v is QueuedFile => Boolean(v))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  add(file: QueuedFile, source: UploadSource, preparation?: DeviceTextPreparation) {
    const prepared = preparation && {
      full: preparation.full.catch(() => undefined),
      partial: preparation.partial?.catch(() => undefined),
    };
    const work = this.retaining.then(async () => {
      await this.retain(file, source);
      if (prepared) this.preparations.set(file.id, prepared);
    });
    this.retaining = work.catch(() => undefined);
    return work;
  }
  private async retain(file: QueuedFile, source: UploadSource) {
    if (!this.active) throw new Error("Secure file storage is closed.");
    await this.authorize(file.workspaceId);
    const sizeProblem = uploadSizeProblem(file.name, file.mimeType, file.size);
    if (sizeProblem) throw new Error(sizeProblem);
    const existing = await this.list();
    if(existing.some(item=>item.id===file.id))throw new Error("This file is already queued.");
    if (existing.filter((f) => f.state !== "done").length >= 10)
      throw new Error(
        "Sync or remove a queued file before adding another. Up to 10 files can be kept offline.",
      );
    if (!Number.isInteger(file.size) || file.size <= 0 || file.size > NATIVE_UPLOAD_MAX_SIZE || (typeof source === "string" && source.length !== Math.ceil(file.size / 3) * 4))
      throw new Error("This file could not be read completely. Please choose it again or retake the photo.");
    if(existing.filter(f=>f.state!=="done"&&f.state!=="processing").reduce((sum,f)=>sum+f.size,0)+file.size>50*1024*1024) throw new Error("Finish or remove queued files first. Up to 50 MB can be kept offline.");
    const chunkedSource = typeof source !== "string";
    try {
      if (chunkedSource) {
        for (let index = 0; index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE); index++) {
          const part = await readUploadPart(source, file.size, index);
          if (!this.active) throw new Error("Secure file storage is closed.");
          await this.store.set(`file-bytes:${file.id}:part:${index}`, part);
        }
      } else {
        await this.store.set("file-bytes:" + file.id, source);
      }
      if (!this.active) throw new Error("Secure file storage is closed.");
      await this.store.set("file:" + file.id, { ...file, originalRetained: true, chunkedSource });
    } catch (error) {
      await this.clearSource(file.id).catch(() => undefined);
      throw error;
    }
    this.emit();
  }
  pruneUnreferencedSources() {
    const work = this.retaining.then(async () => {
      const retained = new Set((await this.list()).filter(file => file.originalRetained !== false).map(file => file.id));
      for (const key of await this.store.keys("file-bytes:")) {
        const id = key.slice("file-bytes:".length).split(":part:")[0];
        if (!retained.has(id)) await this.store.remove(key);
      }
    });
    this.retaining = work.catch(() => undefined);
    return work;
  }
  private async clearSource(id: string) {
    this.preparations.delete(id);
    for (const key of await this.store.keys(`file-bytes:${id}:part:`)) await this.store.remove(key);
    await this.store.remove("file-bytes:" + id);
  }
  async source(file: QueuedFile): Promise<UploadSource> {
    await this.authorize(file.workspaceId);
    const key = "file-bytes:" + file.id;
    if (file.chunkedSource && file.originalRetained !== false) return async index => {
      const part = await this.store.get<string>(`${key}:part:${index}`);
      if (!part) throw new Error("The original file is no longer stored on this device.");
      return part;
    };
    const bytes = await this.store.get<string>(key);
    if (!bytes) throw new Error("The original file is no longer stored on this device.");
    return bytes;
  }
  async bytes(file: QueuedFile) {
    const saved = await this.store.get<QueuedFile>("file:" + file.id);
    const source = await this.source(saved ?? file);
    if (typeof source === "string") return source;
    const parts: string[] = [];
    for (let index = 0; index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE); index++)
      parts.push(await readUploadPart(source, file.size, index));
    return parts.join("");
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
    if ((file.importMode === "receipt" || (!file.importMode && /^image\//i.test(file.mimeType))) &&
        (!file.receiptTiming || ["failed", "not_seen_24h"].includes(await this.store.get<string>("receipt-outcome:" + file.receiptTiming.id) ?? ""))) {
      file.receiptTiming = { id: newTelemetryId(), startedAt: Date.now() };
      telemetry("receipt_upload_outcome", { operation_id: file.receiptTiming.id, outcome: "started" });
    }
    file.state = "queued";
    file.password = password || file.password;
    file.error = undefined;
    file.progressNoticeSeen = false;
    await this.store.set("file:" + id, file);
    this.emit();
  }
  async acknowledgeProgress(id: string) {
    const file = await this.store.get<QueuedFile>("file:" + id);
    if (!file || !["attention", "done"].includes(file.state)) return;
    await this.authorize(file.workspaceId);
    await this.store.set("file:" + id, { ...file, progressNoticeSeen: true });
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
  private async finishFirstReceiptScan(file: QueuedFile, outcome: FirstReceiptOutcome, observedAt = Date.now(), reason?: ReceiptOutcomeReason) {
    const scan = file.firstReceiptScan;
    if (!scan) return;
    const key = "first-receipt:" + scan.id;
    if (this.reportedTimings.has(key)) return;
    this.reportedTimings.set(key, outcome);
    try {
      if (await this.store.get<string>(key)) return;
      await this.store.set(key, outcome);
      reportFirstReceiptOutcome(scan, outcome, observedAt, reason, file.canonicalId ?? file.id);
    } catch {
      this.reportedTimings.delete(key);
    }
  }
  async observeReceiptReviewPrompt(workspaceId: string, importId: string, fields: readonly ReceiptDraftMissingField[], observedAt = Date.now()) {
    const file = (await this.list()).find(item => item.workspaceId === workspaceId && (item.canonicalId ?? item.id) === importId);
    const scan = file?.firstReceiptScan;
    if (!scan) return;
    const key = "receipt-prompt:" + scan.id;
    if (this.reportedTimings.has(key)) return;
    this.reportedTimings.set(key, "shown");
    try {
      if (await this.store.get<boolean>(key)) return;
      await this.store.set(key, true);
      reportReceiptReviewPrompt(scan, fields, observedAt);
    } catch {
      this.reportedTimings.delete(key);
    }
  }
  async observeFirstReceiptRows(workspaceId: string, rows: readonly { id: string; importFileId?: string | null }[], observedAt = Date.now()) {
    for (const file of await this.list()) {
      if (!file.firstReceiptScan || file.workspaceId !== workspaceId || file.state !== "done") continue;
      if (rows.some(row => row.id === file.receiptTransactionId || row.importFileId === (file.canonicalId ?? file.id))) {
        await this.finishFirstReceiptScan(file, "visible", observedAt);
      }
    }
  }
  private async finishReceiptTiming(file: QueuedFile, outcome: "visible" | "failed" | "canceled" | "not_seen_24h", reason?: ReceiptOutcomeReason) {
    if (outcome !== "visible") await this.finishFirstReceiptScan(file, outcome, undefined, reason);
    const timing = file.receiptTiming;
    if (!timing || timing.outcome || this.reportedTimings.has(timing.id)) return;
    this.reportedTimings.set(timing.id, outcome);
    try {
      await this.store.set("receipt-outcome:" + timing.id, outcome);
    } catch (error) {
      this.reportedTimings.delete(timing.id);
      throw error;
    }
    telemetry("receipt_upload_outcome", {
      operation_id: timing.id, outcome,
      duration_ms: Math.max(0, Date.now() - timing.startedAt),
      timing_boundary: "upload_queued_to_outcome",
    });
  }
  async observeCommittedRows(workspaceId: string, rows: readonly { id: string; importFileId?: string | null }[], observedAt: number) {
    for (const file of await this.list()) {
      const notice = file.commitNotice;
      const importId = file.canonicalId ?? file.id;
      if (file.workspaceId !== workspaceId || !notice || !rows.some(row =>
        row.importFileId === importId || row.id === file.receiptTransactionId || row.id === file.pdfVisibilityTarget?.transactionId)) continue;
      const key = `import-visible:${workspaceId}:${importId}`;
      if (this.reportedTimings.has(key)) continue;
      this.reportedTimings.set(key, "visible");
      try {
        if (await this.store.get<boolean>(key)) continue;
        await this.store.set(key, true);
        telemetry("import_first_row_visible", {
          import_file_id: importId,
          commit_notice_source: "poll",
          ...notice.polling,
          ...importPresentationTimings(observedAt, notice.noticedAt),
        });
      } catch (error) {
        this.reportedTimings.delete(key);
        throw error;
      }
    }
  }
  async observePdfRows(workspaceId: string, rows: readonly { id: string; importFileId?: string | null }[], observedAt = Date.now()) {
    for (const file of await this.list()) {
      const target = file.pdfVisibilityTarget;
      const timing = file.pdfTiming;
      if (file.workspaceId !== workspaceId || !target || !timing || !rows.some(row =>
        row.id === target.transactionId || row.importFileId === (file.canonicalId ?? file.id))) continue;
      const key = "pdf-visible:" + target.attemptId;
      if (this.reportedTimings.has(key)) continue;
      this.reportedTimings.set(key, "visible");
      try {
        if (await this.store.get<boolean>(key)) continue;
        await this.store.set(key, true);
        telemetry("pdf_import_first_row_visible", {
          attempt_id: target.attemptId, import_file_id: file.canonicalId ?? file.id,
          upload_transfer_ms: timing.transferMs, finalize_request_ms: timing.finalizeRequestMs,
          upload_to_first_visible_row_ms: Math.max(0, observedAt - timing.startedAt),
          ui_delay_ms: file.pdfVisibilityReadyAt !== undefined && observedAt >= file.pdfVisibilityReadyAt
            ? observedAt - file.pdfVisibilityReadyAt : undefined,
          ui_delay_boundary: "availability_response_to_visible_row",
          row_visible_before_availability_response: file.pdfVisibilityReadyAt !== undefined && observedAt < file.pdfVisibilityReadyAt,
          resumed_transfer: timing.resumed,
        });
      } catch (error) {
        this.reportedTimings.delete(key);
        throw error;
      }
    }
  }
  async observeReceiptRows(workspaceId: string, ids: readonly string[]) {
    for (const file of await this.list()) {
      if (file.workspaceId !== workspaceId || file.state !== "done" || !file.receiptTransactionId ||
          !ids.includes(file.receiptTransactionId)) continue;
      await this.finishReceiptTiming(file, "visible");
    }
  }
  async receiptConfirmed(workspaceId: string, importId: string, transactionId: string) {
    const file = (await this.list()).find(item => item.workspaceId === workspaceId &&
      (item.canonicalId ?? item.id) === importId && item.state === "attention");
    if (!file) return;
    file.receiptTransactionId = transactionId;
    file.state = "done";
    file.error = undefined;
    file.originalRetained = false;
    await this.store.set("file:" + file.id, file);
    await this.clearSource(file.id);
    this.emit();
  }
  async reportUnseenReceipts() {
    for (const file of await this.list()) {
      if (file.firstReceiptScan && Date.now() - file.firstReceiptScan.acceptedAt >= 86_400_000)
        await this.finishFirstReceiptScan(file, "not_seen_24h");
      if (file.receiptTiming && Date.now() - file.receiptTiming.startedAt >= 86_400_000)
        await this.finishReceiptTiming(file, "not_seen_24h");
    }
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
      await this.finishReceiptTiming(file, "canceled");
      await this.store.remove("file:" + id);
      await this.clearSource(id);
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
    const file = await this.store.get<QueuedFile>("file:" + id);
    if (file) await this.finishReceiptTiming(file, "canceled");
    await this.store.remove("file:" + id);
    await this.clearSource(id);
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
        const unlock = async (password: string) => {
          delete file.password;
          file.state = "finalizing";
          file.message = "Unlocking and reading your statement…";
          await this.store.set("file:" + file.id, file);
          this.emit();
          const result = await this.transport.unlock!(file, password);
          file.canonicalId = result.canonicalId ?? file.canonicalId;
          file.needsPassword = false;
          file.state = "processing";
        };
        // A password challenge confirms the server already has the parts.
        // A deliberate unlock can go straight to that same upload ID.
        let exists = false;
        let recoveredFromStatus = false;
        if (file.needsPassword && file.password && this.transport.unlock) {
          await unlock(file.password);
          exists = true;
        } else {
          // Reconcile a lost acknowledgement before sending bytes.
          try {
            const status = await this.transport.status(file);
            exists = true;
            file.progress = Math.max(file.progress ?? 0, status.progress ?? 0);
            file.message = status.message;
            file.processingPhase = status.processingPhase;
            if (status.pdfVisibilityTarget && status.pdfVisibilityTarget.attemptId !== file.pdfVisibilityTarget?.attemptId) {
              file.pdfVisibilityTarget = status.pdfVisibilityTarget;
              file.pdfVisibilityReadyAt = Date.now();
            }
            file.receiptTransactionId = status.receiptTransactionId ?? file.receiptTransactionId;
            const committed = status.receiptTransaction;
            if (status.done && committed?.workspaceId === file.workspaceId && committed.id === file.receiptTransactionId) {
              if (this.committedReceipts.size >= 32) {
                const oldest = this.committedReceipts.keys().next().value;
                if (oldest) this.committedReceipts.delete(oldest);
              }
              this.committedReceipts.set(JSON.stringify([committed.workspaceId, committed.id]), committed);
            }
            if (!file.commitNotice && status.commitNotice) {
              file.commitNotice = status.commitNotice;
              telemetry("import_commit_observed", {
                import_file_id: file.canonicalId ?? file.id,
                commit_notice_source: "poll",
                ...status.commitNotice.polling,
              });
            }
            file.canResume = status.canResume;
            file.needsPassword = status.needsPassword && !status.done;
            file.error = undefined;
            if (status.cancelled) {
              await this.finishReceiptTiming(file, "canceled");
              await this.store.remove("file:" + file.id);
              await this.clearSource(file.id);
              continue;
            }
            file.serverPaused = status.paused;
            file.state = status.paused ? "paused" : status.done
              ? "done"
              : status.failed
                ? "attention"
                : "processing";
            recoveredFromStatus = Boolean(file.uploadTransfer?.attempts && file.originalRetained !== false &&
              (file.state === "done" || file.state === "processing") && !file.needsPassword);
            if (status.needsPassword && !status.done) {
              file.state = "attention";
              if (file.password && this.transport.unlock) {
                await unlock(file.password);
              } else file.error = status.message || "Enter the statement password to continue.";
            } else if (status.failed) {
              file.error = status.message || "This file needs review. Open it to check the details.";
            }
          } catch (e) {
            if (exists || (e as { status?: number }).status !== 404) throw e;
          }
        }
        if (!exists && (file.originalRetained === false || file.canonicalId)) {
          throw Object.assign(new Error("The saved import could not be found. Please check your import history."), { status: 404 });
        }
        if (!exists) {
          const source = await this.source(file);
          file.state = "sending";
          const transfer = {
            attempts: (file.uploadTransfer?.attempts ?? 0) + 1,
            startedAt: file.uploadTransfer?.startedAt ?? file.pdfTiming?.startedAt ?? Date.now(),
            dispatchedParts: file.uploadTransfer?.dispatchedParts ?? [],
          };
          file.uploadTransfer = transfer;
          await this.store.set("file:" + file.id, file);
          this.emit();
          if(controller.signal.aborted)throw new Error("Upload paused.");
          const result = await this.transport.upload(file, source, {
            signal: controller.signal,
            preparedDeviceText: this.preparations.get(file.id),
            markPartDispatched: async index => {
              if (transfer.dispatchedParts.includes(index)) return;
              // Persist intent before starting the HTTP request so an app
              // restart can still distinguish a resend from a new part.
              transfer.dispatchedParts.push(index);
              await this.store.set("file:" + file.id, file);
            },
            savePdfTiming: async timing => {
              file.pdfTiming = timing;
              await this.store.set("file:" + file.id, file);
            },
            saveDeviceText: evidence => {
              // The following progress update persists the evidence with the queue state.
              file.deviceText = evidence;
            },
            progress: async (sentBytes, finalizing) => {
              file.sentBytes = sentBytes;
              file.state = finalizing ? "finalizing" : "sending";
              await this.store.set("file:" + file.id, file);
              this.emit();
            },
          });
          file.canonicalId = result.canonicalId;
          file.state = "processing";
          // Check a timed import immediately after acceptance.
          if (file.receiptTiming || file.pdfTiming) this.flushAgain = true;
        }
        const control = this.controls.get(file.id);
        if (control === "cancelled") continue;
        if (control === "paused") { file.state = "paused"; file.serverPaused = true; }
        if (file.state === "done" || file.state === "processing") {
          delete file.password;
          file.originalRetained=false;
          await this.store.set("file:" + file.id, file);
          await this.clearSource(file.id);
          if (recoveredFromStatus) telemetry("native_upload_transfer_attempt", {
            import_file_id: file.id,
            attempt_number: file.uploadTransfer!.attempts + 1,
            retry: true,
            outcome: "already_received",
            last_stage: "status",
            parts_skipped: Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE),
            source_bytes_skipped: file.size,
            parts_dispatched: 0,
            parts_resent: 0,
            source_bytes_resent: 0,
            source_bytes_dispatched: 0,
            source_bytes_acknowledged: 0,
            part_request_body_bytes_dispatched: 0,
          });
        } else await this.store.set("file:" + file.id, file);
        if (file.state === "attention") {
          const review = receiptReviewReason(file.processingPhase, file.needsPassword);
          if (review) await this.finishFirstReceiptScan(file, "review_required", undefined, review);
          else await this.finishReceiptTiming(file, "failed", file.processingPhase === "non_financial" || file.processingPhase === "non_financial_file" ? "non_financial_file" : "processing_failed");
        }
      } catch (e) {
        if (this.controls.get(file.id) === "cancelled") continue;
        if (this.controls.get(file.id) === "paused") { file.state = "paused"; file.serverPaused = true; file.error = undefined; await this.store.set("file:" + file.id, file); continue; }
        if(controller.signal.aborted && file.state!=="finalizing"){
          file.state="paused";file.error=undefined;
          await this.store.set("file:"+file.id,file);this.emit();continue;
        }
        const status = (e as { status?: number }).status;
        file.error = (e as Error).message;
        const rejection = nativeUploadRejection((e as { data?: { code?: unknown } }).data?.code);
        if (rejection === "password_required" || (status === 422 && rejection === "unclassified" && /password/i.test(file.error))) {
          file.needsPassword = true;
          file.processingPhase = "password_required";
          delete file.password;
        } else if (rejection !== "unclassified") {
          file.processingPhase = rejection === "visual_repair_needed" ? "repair_needed" : rejection;
          file.needsPassword = false;
          delete file.password;
        }
        const finalizationInFlight = (status === 409 && file.state === "finalizing") ||
          (e as { data?: { code?: string } }).data?.code === "NATIVE_UPLOAD_FINALIZING";
        if (finalizationInFlight) file.state = "finalizing";
        else if (status && status < 500) file.state = "attention";
        await this.store.set("file:" + file.id, file);
        this.emit();
        if (file.state === "attention") {
          const review = receiptReviewReason(file.processingPhase, file.needsPassword);
          if (review) await this.finishFirstReceiptScan(file, "review_required", undefined, review);
          else await this.finishReceiptTiming(file, "failed", rejection === "non_financial_file" || rejection === "visual_repair_needed" ? rejection : "upload_rejected");
        }
        if (!status || status >= 500 || finalizationInFlight) break;
      } finally {this.current=null;finish();}
      this.emit();
    }
  }
  async close() {
    this.active = false;
    if(this.current?.file.state!=="finalizing")this.current?.controller.abort();
    await Promise.all([this.flight, this.retaining]);
    this.preparations.clear();
    this.committedReceipts.clear();
    this.listeners.clear();
  }
}
