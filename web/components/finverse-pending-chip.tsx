"use client";
import type { PendingBankConnection } from "../../shared/finverse-pending";

export function FinversePendingChip({ connection, busy, resumeDisabled, onResume, onCancel }: {
  connection: PendingBankConnection; busy: boolean; resumeDisabled?: boolean; onResume: () => void; onCancel: () => void;
}) {
  return <div className="finverse-pending-chip">
    <button type="button" className="finverse-pending-chip__resume" disabled={busy || resumeDisabled} onClick={onResume}>
      <img src={connection.logoUrl || "/assets/account-types/bank.png"} alt="" width={24} height={24} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = "/assets/account-types/bank.png"; }} />
      <span>Finish linking {connection.name}</span>
    </button>
    <button type="button" className="finverse-pending-chip__cancel" aria-label={`Cancel linking ${connection.name}`} title={`Cancel linking ${connection.name}`} disabled={busy} onClick={onCancel}><span aria-hidden="true">×</span></button>
  </div>;
}
