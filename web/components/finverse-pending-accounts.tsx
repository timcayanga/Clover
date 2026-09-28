"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyInAppNotificationsChanged } from "@/lib/in-app-notifications";
import { CANCEL_BANK_LINK_MESSAGE, type PendingBankConnection } from "../../shared/finverse-pending";
import { FinversePendingChip } from "./finverse-pending-chip";
import "./add-entry-methods.css";
export function FinversePendingAccounts({workspaceId}:{workspaceId:string}) {
  const router=useRouter();
  const [pending,setPending]=useState<PendingBankConnection[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const cancelling=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>{void fetch(`/api/integrations/finverse/connections?view=picker&workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{if(!controller.signal.aborted)setPending(data.pending);}).catch(()=>{});};
    setPending([]);setMessage("");refresh();window.addEventListener("finverse-updated",refresh);
    return()=>{controller.abort();window.removeEventListener("finverse-updated",refresh);};
  },[workspaceId]);
  async function cancel(connection: PendingBankConnection) {
    if(cancelling.current || !window.confirm(CANCEL_BANK_LINK_MESSAGE))return;
    cancelling.current=true;setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/integrations/finverse/unlink",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspaceId,connectionId:connection.id})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"Unable to cancel linking. Please try again.");
      setPending(current=>current.filter(item=>item.id!==connection.id));setMessage(data.message);
      window.dispatchEvent(new Event("finverse-updated"));notifyInAppNotificationsChanged();
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to cancel linking.");}
    finally{cancelling.current=false;setBusy(false);}
  }
  if(!pending.length&&!message)return null;
  return <><div className="finverse-pending" aria-label="Bank accounts need selection">{pending.map(connection=><FinversePendingChip key={connection.id} connection={connection} busy={busy} onResume={()=>router.push(`/accounts?finverse=connected&finverseConnection=${encodeURIComponent(connection.id)}&finverseWorkspace=${encodeURIComponent(workspaceId)}`)} onCancel={()=>void cancel(connection)}/>)}</div>{message?<p role="status">{message}</p>:null}</>;
}
