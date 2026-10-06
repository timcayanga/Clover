import { useEffect, useRef, useState } from "react";
import { Linking, Modal, ScrollView, View } from "react-native";
import { AI_CONSENT_VERSION, AI_CONSENT_TITLE, AI_CONSENT_DESCRIPTION, AI_CONSENT_ALTERNATIVE } from "../../shared/ai-consent";
import { Body, Button, Heading, Notice, useTheme } from "./ui";
type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;
export function useCloudAiConsent(transport: Transport) {
  const { colors } = useTheme();
  const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const resolve=useRef<((allowed:boolean)=>void)|null>(null);
  const pending=useRef<Promise<boolean>|null>(null);
  useEffect(()=>()=>{resolve.current?.(false);resolve.current=null;},[]);
  const ensure=async()=>{
    if(pending.current) return pending.current;
    pending.current=(async()=>{
      const status=await transport<{allowed:boolean}>("settings/ai-consent");
      if(status.allowed)return true;
      return new Promise<boolean>(done=>{resolve.current=done;setError("");setVisible(true);});
    })().finally(()=>{pending.current=null;});
    return pending.current;
  };
  const finish=(allowed:boolean)=>{setVisible(false);resolve.current?.(allowed);resolve.current=null;};
  const prompt=<Modal visible={visible} transparent animationType="fade" onRequestClose={()=>{if(!busy)finish(false);}}><View style={{flex:1,justifyContent:"center",padding:24,backgroundColor:"#07343d88"}}><ScrollView style={{width:"100%",maxWidth:560,alignSelf:"center",maxHeight:"85%",backgroundColor:colors.white,borderRadius:24}} contentContainerStyle={{padding:24,gap:16}} accessibilityViewIsModal><Heading>{AI_CONSENT_TITLE}</Heading><Body>{AI_CONSENT_DESCRIPTION}</Body><Body>{AI_CONSENT_ALTERNATIVE}</Body><Button secondary title="Privacy Policy" onPress={()=>void Linking.openURL("https://clover.ph/privacy-policy")}/>{error?<Notice>{error}</Notice>:null}<Button title={busy?"Saving…":"Allow AI processing"} disabled={busy} onPress={()=>{setBusy(true);void transport("settings/ai-consent",{method:"POST",body:JSON.stringify({allow:true,version:AI_CONSENT_VERSION})}).then(()=>finish(true)).catch(()=>setError("Unable to save permission. Please retry.")).finally(()=>setBusy(false));}}/><Button secondary title="Not now" disabled={busy} onPress={()=>finish(false)}/></ScrollView></View></Modal>;
  return {ensure,prompt};
}
