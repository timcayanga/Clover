import { newTelemetryId, telemetry, type TelemetryProperties } from "../../shared/analytics";
/** JS-root/sign-in to committed Home content, never a claim about pre-JS OS launch time. */
export class StartupTiming {
  private attempt: { id: string; started: number; kind: string } | null = null;
  private awaitingHome = false;
  constructor(private emit: (event: "flow_started" | "flow_completed" | "flow_canceled" | "flow_failed", properties: TelemetryProperties) => void = telemetry, private now = () => Date.now()) {}
  start(kind: "cold" | "sign_in" | "resume" | "retry") {
    if (this.attempt) return;
    this.awaitingHome = true;
    this.attempt = { id: newTelemetryId(), started: this.now(), kind };
    this.emit("flow_started", this.fields());
  }
  private fields() {
    return { operation: "native_startup", phase: "js_to_home", operation_id: this.attempt!.id, launch_kind: this.attempt!.kind,
      timing_boundary: "first_home_content_commit", duration_ms: Math.max(0, this.now() - this.attempt!.started) };
  }
  visible() {
    if (!this.attempt) return;
    this.emit("flow_completed", { ...this.fields(), outcome: "completed" });
    this.attempt = null; this.awaitingHome = false;
  }
  failed(reason: "bootstrap" | "home") {
    if (!this.attempt) return;
    this.emit("flow_failed", { ...this.fields(), outcome: "failed", reason });
    this.attempt = null;
  }
  cancel(reason: "signed_out_entry" | "non_home_destination" | "app_background") {
    if (this.attempt) this.emit("flow_canceled", { ...this.fields(), outcome: "canceled", reason });
    this.attempt = null;
    if (reason !== "app_background") this.awaitingHome = false;
  }
  foreground() { if (this.awaitingHome && !this.attempt) this.start("resume"); }
}
export const nativeStartup = new StartupTiming();
