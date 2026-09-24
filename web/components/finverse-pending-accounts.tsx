"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./add-entry-methods.css";
export function FinversePendingAccounts({workspaceId}:{workspaceId:string}) {
  const router=useRouter();
  const [pending,setPending]=useState<{id:string;name:string}[]>([]);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>{void fetch(`/api/integrations/finverse/connections?workspaceId=${encodeURIComponent(workspaceId)}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{if(!controller.signal.aborted)setPending(data.pending);}).catch(()=>{});};
    setPending([]);refresh();window.addEventListener("finverse-updated",refresh);
    return()=>{controller.abort();window.removeEventListener("finverse-updated",refresh);};
  },[workspaceId]);
  if(!pending.length)return null;
  return <div className="finverse-pending" aria-label="Bank accounts need selection">{pending.map(connection=><button key={connection.id} className="button button-secondary" type="button" onClick={()=>router.push(`/accounts?finverse=connected&finverseConnection=${encodeURIComponent(connection.id)}&finverseWorkspace=${encodeURIComponent(workspaceId)}`)}><span aria-hidden="true">⊕</span>Select accounts · {connection.name}<span aria-label="Action needed">!</span></button>)}</div>;
}
