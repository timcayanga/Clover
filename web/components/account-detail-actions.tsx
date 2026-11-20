"use client";
import type { ReactNode } from "react";

export function AccountDetailActions({ canReplace, canMerge, disabled=false, replacing=false, asset=false, onReplace, onMerge, onDelete, children }: {
  canReplace: boolean; canMerge: boolean; disabled?: boolean; replacing?: boolean; asset?: boolean;
  onReplace: ()=>void; onMerge: ()=>void; onDelete: ()=>void; children?: ReactNode;
}) {
  return <div className="accounts-detail__action-stack">
    <div className="accounts-detail__action-row">
      {canReplace?<button type="button" className="button button-secondary button-small" disabled={disabled||replacing} onClick={onReplace}>Replace Card</button>:null}
      <button type="button" className="button button-secondary button-small" disabled={disabled||replacing||!canMerge} onClick={onMerge}>{asset?"Merge Asset":"Merge Account"}</button>
    </div>
    {children}
    <div className="accounts-detail__delete-row"><button type="button" className="button button-danger button-small accounts-drawer__delete" disabled={disabled||replacing} onClick={onDelete}>{asset?"Delete Asset":"Delete Account"}</button></div>
  </div>;
}
