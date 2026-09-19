import { parseAdviserChart, type AdviserChart } from "./adviser-chart";
// Applications inject their own React hooks. Keep the shared contract independent
// of either application's React installation (including type-only imports).
type StateUpdate<T> = T | ((previous: T) => T);
type HistoryHooks = {
  useState<T>(initial: T | (() => T)): [T, (update: StateUpdate<T>) => void];
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
};
export type SavedChatMessage = { role: "user" | "assistant"; content: string; visualization?:AdviserChart };
export type SavedConversation = {id:string;title:string;updatedAt:string;revision:number;messages?:SavedChatMessage[]};
const serializeMessages=(messages:SavedChatMessage[])=>JSON.stringify(messages.map(({role,content,visualization})=>({role,content,...(parseAdviserChart(visualization)?{visualization:parseAdviserChart(visualization)}:{})})));
type HistoryRequest = <T>(path:string, body?:unknown) => Promise<T>;
export function createAdviserHistoryHook({useEffect,useRef,useState}: HistoryHooks) {
return function useAdviserHistory(scope:string, enabled:boolean, request:HistoryRequest, createId:()=>string) {
  const [conversations,setConversations] = useState<SavedConversation[]>([]);
  const [active,setActive] = useState<SavedConversation|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [firstName,setFirstName] = useState("");
  const locked=useRef(false);
  const generation = useRef(0), revision = useRef(0), currentId = useRef(""), saved = useRef("");
  const requestRef=useRef(request); requestRef.current=request;
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const version=++generation.current;
    locked.current=false;setConversations([]);setActive(null);setError("");setFirstName("");revision.current=0;currentId.current="";saved.current="";
    if(!enabled||!scope){setBusy(false);return;}
    setBusy(true);
    void requestRef.current<{conversations:SavedConversation[];firstName?:string}>(`adviser/conversations?workspaceId=${encodeURIComponent(scope)}`)
      .then(data=>{if(version===generation.current){setConversations(data.conversations);setFirstName(data.firstName||"");}})
      .catch(()=>{if(version===generation.current)setError("Chat history is unavailable. Retry to load your chats.");})
      .finally(()=>{if(version===generation.current)setBusy(false);});
    return ()=>{generation.current++;};
  },[scope,enabled,reload]);
  const fresh=()=>{ if(busy||locked.current)return; currentId.current=createId();revision.current=0;saved.current="";setActive({id:currentId.current,title:"New chat",updatedAt:new Date().toISOString(),revision:0,messages:[]});setError(""); };
  const open=async(id:string)=>{
    if(busy||locked.current||!enabled)return;
    const version=generation.current;locked.current=true;setBusy(true);setError("");
    try{
      const data=await requestRef.current<{conversation:SavedConversation}>(`adviser/conversations?workspaceId=${encodeURIComponent(scope)}&id=${encodeURIComponent(id)}`);
      if(version!==generation.current)return;
      currentId.current=id;revision.current=data.conversation.revision;saved.current=serializeMessages(data.conversation.messages??[]);
      setActive(data.conversation);
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:"Unable to open chat.");}
    finally{if(version===generation.current){locked.current=false;setBusy(false);}}
  };
  const save=async(messages:SavedChatMessage[])=>{
    if(!enabled||busy||locked.current||messages.length<2||messages.at(-1)?.role!=="assistant")return;
    const snapshot=serializeMessages(messages);
    if(snapshot===saved.current)return;
    const version=generation.current;currentId.current ||= createId();const id=currentId.current;
    locked.current=true;setBusy(true);setError("");
    try{
      const data=await requestRef.current<{revision:number}>(`adviser/conversations?workspaceId=${encodeURIComponent(scope)}`,{id,revision:revision.current,messages:JSON.parse(snapshot)});
      if(version!==generation.current)return;
      revision.current=data.revision;saved.current=snapshot;
      setConversations(items=>[{id,title:messages[0].content.slice(0,80),updatedAt:new Date().toISOString(),revision:data.revision},...items.filter(item=>item.id!==id)].slice(0,50));
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:"Unable to save chat history.");}
    finally{if(version===generation.current){locked.current=false;setBusy(false);}}
  };
  return {conversations,active,busy,error,firstName,fresh,open,save,retry:()=>setReload(value=>value+1)};
}

}
