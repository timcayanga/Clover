"use client";
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { greetingName } from '../../shared/home-return';
const greeted = new Set<string>();
export function MobileReturnGreeting() {
  const {user}=useUser();
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    if(!user || !window.matchMedia('(max-width: 767px)').matches)return;
    let timer:ReturnType<typeof setTimeout>;
    let background:number|null=null;
    const show=()=>{setVisible(true);clearTimeout(timer);timer=setTimeout(()=>setVisible(false),1000);};
    if(!greeted.has(user.id)){greeted.add(user.id);show();}
    const change=()=>{
      if(document.visibilityState==='hidden'){background=Date.now();clearTimeout(timer);setVisible(false);}
      else if(background!==null){if(Date.now()-background>=30000)show();background=null;}
    };
    document.addEventListener('visibilitychange',change);
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',change);};
  },[user?.id]);
  if(!user||!visible)return null;
  return <button type="button" className="mobile-return-greeting" aria-label={`${greetingName(user.firstName)} Continue to Clover`} onClick={()=>setVisible(false)}>{greetingName(user.firstName)}</button>;
}
