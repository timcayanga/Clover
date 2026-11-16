-- Supports bounded lookups for import ownership, pause/cancel and processing
-- claims. Additive only: source evidence and financial records are unchanged.
CREATE INDEX IF NOT EXISTS "AuditLog_import_operation_idx"
ON "AuditLog" ("workspaceId", "entityId", "action", "createdAt", "id");
