import { useEffect, useState } from "react";
import { AI_CONSENT_VERSION } from "../../shared/ai-consent";
import { useSession } from "./session";
import { useCloudAiConsent } from "./ai-consent";
import { Body, Button, Notice } from "./ui";
export function AiConsentSettings() {
 const session=useSession(), consent=useCloudAiConsent(session.request);
 const [allowed,setAllowed]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{let active=true; if(session.demo){setAllowed(false);return;} void session.request<{allowed:boolean}>("settings/ai-consent").then(r=>{if(active)setAllowed(r.allowed);}).catch(()=>{if(active)setError("Unable to load AI permission.");});return ()=>{active=false;};},[session.request,session.demo]);
 return <><Body>Cloud AI processing · {allowed===null?"Loading…":allowed?"Allowed · OpenAI":"Permission not granted"}</Body><Body>You control whether Clover sends files, questions and relevant financial records to OpenAI. Manual entry and bank connections remain available.</Body><Button secondary title={allowed?"Withdraw permission":"Review AI permission"} disabled={busy||allowed===null||session.demo} onPress={()=>{setBusy(true);setError("");void (async()=>{try {if(allowed){await session.request("settings/ai-consent",{method:"POST",body:JSON.stringify({allow:false,version:AI_CONSENT_VERSION})});setAllowed(false);}else setAllowed(await consent.ensure());}catch{setError("Unable to save AI permission. Please retry.");}finally{setBusy(false);}})();}}/>{error?<Notice>{error}</Notice>:null}{consent.prompt}</>;
}
