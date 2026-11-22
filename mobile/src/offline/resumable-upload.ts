import { telemetry } from "../../../shared/analytics";
import { normalizeReceiptCaptureLocation } from "../../../shared/receipt-capture-location";
import {
  NATIVE_UPLOAD_PART_SIZE,
  nativeUploadPartBytes,
  isUploadPdf,
} from "../../../shared/native-upload";
import { readUploadPart, type QueuedFile, type UploadControl, type UploadSource } from "./file-queue";
import { normalizeDeviceTextEvidence, type DeviceTextEvidence } from "../../../shared/device-text-evidence";
type Request = <T>(path: string, options?: RequestInit) => Promise<T>;
type ReadDeviceText = (file: QueuedFile, source: UploadSource) => Promise<DeviceTextEvidence | undefined>;

export const DEVICE_OCR_FINALIZE_WAIT_MS = 300;

/** Wait only at finalization, with a small grace period for an in-flight read. */
export function boundedDeviceText(
  work: Promise<DeviceTextEvidence | undefined>,
  timeoutMs = DEVICE_OCR_FINALIZE_WAIT_MS,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return Promise.resolve(undefined);
  return new Promise<DeviceTextEvidence | undefined>(resolve => {
    const finish = (value?: DeviceTextEvidence) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish();
    const timer = setTimeout(onAbort, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    work.then(value => finish(normalizeDeviceTextEvidence(value) ?? undefined), onAbort);
  });
}
export async function uploadInParts(
  request: Request,
  file: QueuedFile,
  source: UploadSource,
  control: UploadControl,
  readDeviceText?: ReadDeviceText,
) {
  if (control.signal.aborted) throw new Error("Upload paused.");
  // Preparation and recognition share the transfer window. Observe failures
  // immediately because a part request can fail before finalization is reached.
  const cachedText = normalizeDeviceTextEvidence(file.deviceText);
  const prepared = control.preparedDeviceText;
  const fullRead = cachedText?.complete ? undefined : prepared?.full ?? (readDeviceText
    ? Promise.resolve().then(() => control.signal.aborted ? undefined : readDeviceText(file, source)).catch(() => undefined)
    : undefined);
  let latestFull: DeviceTextEvidence | undefined;
  if (fullRead) {
    void fullRead.then(value => { latestFull = normalizeDeviceTextEvidence(value) ?? undefined; }, () => {});
  }
  const reading = fullRead && prepared?.partial
    ? Promise.race([fullRead, prepared.partial]).catch(() => undefined)
    : fullRead;
  const startedAt = file.uploadTransfer?.startedAt ?? Date.now();
  const attemptNumber = file.uploadTransfer?.attempts ?? 1;
  const transferStarted = performance.now();
  const path = `uploads/${file.id}`;
  const query = `?workspaceId=${encodeURIComponent(file.workspaceId)}`;
  const previouslyDispatched = new Set(file.uploadTransfer?.dispatchedParts);
  let evidenceHandoff: "none" | "partial" | "complete" = "none";
  let stage = "start";
  let outcome = "failed";
  let partsSkipped = 0, bytesSkipped = 0;
  let partsDispatched = 0, partsResent = 0;
  let sourceBytesDispatched = 0, requestBodyBytesDispatched = 0, sourceBytesAcknowledged = 0, sourceBytesResent = 0;
  try {
    const state = await request<{ parts: number[]; state: string; activeFinalization?: boolean; canonicalImportFileId?: string }>(
      `${path}/start${query}`,
      {
        method: "POST",
        signal: control.signal,
        body: JSON.stringify({
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
        }),
      },
    );
    const completed = new Set(state.parts.filter(index => nativeUploadPartBytes(file.size, index) > 0));
    partsSkipped = completed.size;
    bytesSkipped = [...completed].reduce((sum, index) => sum + nativeUploadPartBytes(file.size, index), 0);
    if (state.state === "done") {
      outcome = "already_received";
      return { canonicalId: state.canonicalImportFileId ?? file.id };
    }
    if (state.activeFinalization) {
      outcome = "finalizing";
      throw Object.assign(new Error("Clover is still receiving this file. Check again shortly."), {
        status: 503, data: { code: "NATIVE_UPLOAD_FINALIZING" },
      });
    }
    stage = "parts";
    let sent = bytesSkipped;
    await control.progress(sent, false);
    for (
      let index = 0;
      index < Math.ceil(file.size / NATIVE_UPLOAD_PART_SIZE);
      index++
    ) {
      if (control.signal.aborted) throw new Error("Upload paused.");
      if (completed.has(index)) continue;
      const part = await readUploadPart(source, file.size, index);
      if (control.signal.aborted) throw new Error("Upload paused.");
      const body = JSON.stringify({ index, base64: part });
      await control.markPartDispatched?.(index);
      if (control.signal.aborted) throw new Error("Upload paused.");
      const size = nativeUploadPartBytes(file.size, index);
      partsDispatched++;
      sourceBytesDispatched += size;
      requestBodyBytesDispatched += body.length; // The envelope and Base64 alphabet are ASCII.
      const resend = previouslyDispatched.has(index);
      if (resend) {
        partsResent++;
        sourceBytesResent += size;
      }
      await request(`${path}/part${query}`, {
        method: "POST", signal: control.signal, body,
        ...(attemptNumber > 1 ? {
          headers: { "x-clover-upload-attempt": String(attemptNumber), "x-clover-upload-resend": resend ? "1" : "0" },
        } : {}),
      });
      sourceBytesAcknowledged += size;
      sent += size;
      await control.progress(sent, false);
    }
    if (control.signal.aborted) throw new Error("Upload paused.");
    const pdfTiming = isUploadPdf(file.name, file.mimeType) && control.savePdfTiming
      ? { startedAt, transferMs: Math.round(performance.now() - transferStarted), resumed: completed.size > 0 || attemptNumber > 1 } : null;
    if (pdfTiming) await control.savePdfTiming?.(pdfTiming);
    await control.progress(file.size, true);
    const firstAvailable = cachedText ?? (reading
      ? await boundedDeviceText(reading, DEVICE_OCR_FINALIZE_WAIT_MS, control.signal) : undefined);
    if (control.signal.aborted) throw new Error("Upload paused.");
    // A partial result can arrive first while the photo is still uploading.
    const deviceText = latestFull?.complete ? latestFull : firstAvailable;
    evidenceHandoff = deviceText ? deviceText.complete ? "complete" : "partial" : "none";
    if (deviceText && deviceText !== cachedText) control.saveDeviceText?.(deviceText);
    // Finalization must be reconciled with server status if its response is lost;
    // it is intentionally not abortable by a transport pause button.
    stage = "complete";
    const finalizeStarted = performance.now();
    const response = await request<{ canonicalImportFileId?: string }>(
      `${path}/complete${query}`,
      {
        method: "POST",
        body: JSON.stringify({
          ...(file.cameraPhoto ? { cameraPhoto: true } : {}),
          ...(file.password ? { password: file.password } : {}),
          ...(file.importMode ? { importMode: file.importMode } : {}),
          ...(deviceText ? { deviceText } : {}),
          ...(normalizeReceiptCaptureLocation(file.receiptCaptureLocation) ? { receiptCaptureLocation: normalizeReceiptCaptureLocation(file.receiptCaptureLocation) } : {}),
        }),
      },
    );
    if (pdfTiming) await control.savePdfTiming?.({
      ...pdfTiming, finalizeRequestMs: Math.round(performance.now() - finalizeStarted),
    });
    outcome = "completed";
    return { canonicalId: response.canonicalImportFileId };
  } catch (error) {
    if (control.signal.aborted) outcome = "canceled";
    else if (stage === "complete" && (error as { status?: number }).status === 409) outcome = "finalizing";
    throw error;
  } finally {
    telemetry("native_upload_transfer_attempt", {
      import_file_id: file.id,
      attempt_number: attemptNumber,
      retry: attemptNumber > 1,
      duration_ms: Math.round(performance.now() - transferStarted),
      outcome,
      last_stage: stage,
      device_ocr_handoff: evidenceHandoff,
      parts_skipped: partsSkipped,
      source_bytes_skipped: bytesSkipped,
      parts_dispatched: partsDispatched,
      parts_resent: partsResent,
      source_bytes_resent: sourceBytesResent,
      source_bytes_dispatched: sourceBytesDispatched,
      source_bytes_acknowledged: sourceBytesAcknowledged,
      part_request_body_bytes_dispatched: requestBodyBytesDispatched,
    });
  }

}
