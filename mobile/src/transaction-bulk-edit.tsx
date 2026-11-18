import { useRef, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Text } from "./app-text";
import { Button, Field, Notice, useTheme } from "./ui";
import { DropdownFilter, FilterRow } from "./transaction-filters";
import { useSession } from "./session";
import type { FilterOptions } from "./transaction-filter-query";

/** Explicit edits only; unchanged fields never enter the patch. Uses the same
 * validated, audited edit endpoint as Transaction Details, scoped per Profile. */
export function TransactionBulkEdit({ ids, options, onClose, onSaved }: { ids: string[]; options: FilterOptions; onClose: () => void; onSaved: (ids: string[]) => void }) {
 const session=useSession(), {colors}=useTheme();
 const [type,setType]=useState(""),[account,setAccount]=useState(""),[category,setCategory]=useState(""),[tags,setTags]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const done=useRef(new Set<string>()), lock=useRef(false);
 const choices=(rows:{id:string;name:string}[])=>[{value:"",label:"Keep unchanged"},...rows.map(row=>({value:row.id,label:row.name}))];
 const save=async()=>{
  if(lock.current)return;
  const patch={...(type?{type}:{}),...(account?{accountId:account}:{}),...(category?{categoryId:category,categoryCorrectionScope:"transaction"}:{}),...(tags.trim()?{tags:tags.split(",").map(t=>t.trim()).filter(Boolean),tagAction:"add"}:{})};
  if(!Object.keys(patch).length)return;
  lock.current=true;setBusy(true);setError("");
  try {
   for(const id of ids){if(done.current.has(id))continue;await session.request(`transactions/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(session.profileId)}`,{method:"PATCH",body:JSON.stringify(patch)});done.current.add(id);}
   onSaved([...done.current]);
  }catch{setError(`${done.current.size} of ${ids.length} updated. Retry to continue with the remaining transactions.`);}
  finally{lock.current=false;setBusy(false);}
 };
 const close=()=>{if(!busy){if(done.current.size)onSaved([...done.current]);else onClose();}};
 return <Modal transparent animationType="slide" onRequestClose={close}><View style={{flex:1,justifyContent:"flex-end",backgroundColor:"#0006"}}><Pressable accessibilityLabel="Close edit transactions" onPress={close} style={{position:"absolute",inset:0}}/><View accessibilityViewIsModal style={{maxHeight:"85%",borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,paddingBottom:32,backgroundColor:colors.white,gap:12}}><Text style={{fontSize:20,color:colors.ink,fontFamily:"Poppins-SemiBold"}}>Edit {ids.length} transactions</Text><View pointerEvents={busy || done.current.size > 0 ? "none" : "auto"}><ScrollView keyboardShouldPersistTaps="handled" style={{flexGrow:0}}><DropdownFilter label="Type" value={type} onChange={setType} options={[{value:"",label:"Keep unchanged"},{value:"income",label:"Income"},{value:"expense",label:"Expense"},{value:"transfer",label:"Transfer"}]}/><DropdownFilter label="Account" value={account} onChange={setAccount} options={choices(options.accounts)}/><DropdownFilter label="Category" value={category} onChange={setCategory} options={choices(options.categories)}/><FilterRow label="Tags" summary={tags||"Keep unchanged"}><Field value={tags} onChangeText={setTags} placeholder="Add tags, separated by commas" editable={!busy}/></FilterRow></ScrollView></View>{error?<Notice>{error}</Notice>:null}<Button title={busy?"Saving…":"Save changes"} disabled={busy||!type&&!account&&!category&&!tags.trim()} onPress={()=>void save()}/></View></View></Modal>;
}
