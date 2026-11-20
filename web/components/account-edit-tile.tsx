"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function AccountEditTile({ children, editing, onEdit, onDelete, name }: {
  children: ReactNode; editing: boolean; onEdit: () => void; onDelete?: () => void; name: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef({x:0,y:0});
  const held = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return <div className={editing ? "account-edit-tile is-editing" : "account-edit-tile"}>
    <div onPointerDown={e => {
      cancel(); held.current = false;
      if (editing || !e.isPrimary || e.button !== 0) return;
      start.current = {x:e.clientX,y:e.clientY};
      timer.current = setTimeout(() => { held.current = true; onEdit(); }, 500);
    }} onPointerMove={e => {
      if (Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>8) cancel();
    }} onPointerCancel={cancel} onPointerLeave={cancel} onPointerUp={cancel}
      onContextMenu={e => e.preventDefault()}
      onClickCapture={e => { if (held.current || (editing && onDelete)) { e.preventDefault(); e.stopPropagation(); held.current = false; } }}>
      {children}
    </div>
    {editing && onDelete && <button type="button" className="account-edit-remove" aria-label={`Delete ${name}`} onClick={onDelete}>−</button>}
  </div>;
}
