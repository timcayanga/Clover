import { prisma } from "@/lib/prisma";

export type ImportUserControl = "running" | "paused" | "cancelled";
export class ImportUserControlError extends Error {
  constructor(public readonly control: Exclude<ImportUserControl, "running">) {
    super(control === "paused" ? "Import paused" : "Import cancelled");
    this.name = "ImportUserControlError";
  }
}

// Control lives outside processingPhase: progress updates must never erase a
// user's pause/cancel. Scope the indexed audit lookup to its owning workspace.
export async function getImportUserControl(importId: string, workspaceId?: string): Promise<ImportUserControl> {
  const workspace = workspaceId ?? (await prisma.importFile.findUnique({ where: { id: importId }, select: { workspaceId: true } }))?.workspaceId;
  if (!workspace) return "running";
  const event = await prisma.auditLog.findFirst({
    where: { workspaceId: workspace, entityId: importId, action: "import.user_control" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true },
  });
  const metadata = event?.metadata as { control?: unknown } | null;
  return metadata?.control === "paused" || metadata?.control === "cancelled" ? metadata.control : "running";
}

/** Call at safe boundaries and before saving financial records. Never delete confirmed data. */
export async function requireImportMayContinue(importId: string, workspaceId?: string) {
  const control = await getImportUserControl(importId, workspaceId);
  if (control === "running") return;
  await prisma.importFile.updateMany({
    where: { id: importId, confirmedTransactionsCount: 0, transactions: { none: {} } },
    data: { status: control === "cancelled" ? "failed" : "processing", processingPhase: control,
      processingMessage: control === "paused" ? "Import paused" : "Import cancelled" },
  });
  throw new ImportUserControlError(control);
}

export async function setImportUserControl(importId: string, actorUserId: string, action: "pause" | "resume" | "cancel") {
  return prisma.$transaction(async tx => {
    // Serialize conflicting controls, and check actual saved rows as well as counters.
    await tx.$queryRaw`SELECT "id" FROM "ImportFile" WHERE "id" = ${importId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: importId }, include: { _count: { select: { transactions: true } } } });
    if (!file) throw new Error("Import not found");
    if (file.confirmedTransactionsCount > 0 || file._count.transactions > 0 || file.status === "done") {
      throw new Error("This import is already saved. Your saved records have not been changed.");
    }
    const previous = await tx.auditLog.findFirst({ where: { workspaceId: file.workspaceId, entityId: importId, action: "import.user_control" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { metadata: true } });
    const prior = (previous?.metadata as { control?: string } | null)?.control;
    if (prior === "cancelled" && action !== "cancel") throw new Error("This import was cancelled. Choose the file again to start a new import.");
    const control: ImportUserControl = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "running";
    if (prior !== control) await tx.auditLog.create({ data: { workspaceId: file.workspaceId, actorUserId, action: "import.user_control", entity: "ImportFile", entityId: importId, metadata: { control } } });
    const restart = action === "resume" && file.processingPhase === "paused";
    await tx.importFile.update({ where: { id: importId }, data: {
      status: action === "cancel" && file.processingPhase === "cancelled" ? "failed" : "processing",
      processingPhase: action === "pause" ? file.processingPhase === "paused" ? "paused" : "pause_requested" : action === "cancel" ? file.processingPhase === "cancelled" ? "cancelled" : "cancel_requested" : restart ? "queued_retry" : file.processingPhase,
      processingMessage: action === "pause" ? "Pausing import" : action === "cancel" ? "Cancelling import" : "Reading file",
    } });
    return { control, restart, workspaceId: file.workspaceId };
  });
}
