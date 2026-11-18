import { bankHalfVisible } from '../../shared/bank-stage-measurements';
/** Acknowledge visible pixels, never merely a response, state update or background render. */
export function observeBankVisibility(node:HTMLElement,acknowledge:()=>Promise<boolean>){
 let disposed=false,done=false,pending=false,tries=0;let retry:ReturnType<typeof setTimeout>|undefined;
 const check=()=>{
  const r=node.getBoundingClientRect();
  if(disposed||done||pending||tries>=3||!node.isConnected||document.visibilityState!=='visible'||!bankHalfVisible({x:r.left,y:r.top,width:r.width,height:r.height},{width:window.innerWidth,height:window.innerHeight}))return;
  pending=true;tries++;void acknowledge().then(ok=>{done=ok;}).catch(()=>{}).finally(()=>{pending=false;if(!done&&!disposed&&tries<3)retry=setTimeout(check,1000);});
 };
 const frame=requestAnimationFrame(check);
 const observer=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(check,{threshold:.5}):null;
 observer?.observe(node);document.addEventListener('visibilitychange',check);document.addEventListener('scroll',check,true);window.addEventListener('resize',check);
 return()=>{disposed=true;cancelAnimationFrame(frame);if(retry)clearTimeout(retry);observer?.disconnect();document.removeEventListener('visibilitychange',check);document.removeEventListener('scroll',check,true);window.removeEventListener('resize',check);};
}
