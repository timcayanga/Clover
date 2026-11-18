import { useCallback,useEffect,useRef,type RefObject,type ComponentRef } from 'react';
import { AppState,View,useWindowDimensions } from 'react-native';
import { bankHalfVisible } from '../../shared/bank-stage-measurements';
/** Poll geometry only for a pending measurement on an active, focused screen; stop after acknowledgement/3 tries. */
export function useBankVisibleStage(node:RefObject<ComponentRef<typeof View>|null>,key:string|null,enabled:boolean,acknowledge:(visibleAt:number)=>Promise<boolean>){
 const {width,height}=useWindowDimensions();const callback=useRef(acknowledge);callback.current=acknowledge;
 const latest=useRef({enabled,key});latest.current={enabled,key};
 const state=useRef<{key:string|null;at?:number;pending:boolean;done:boolean;tries:number}>({key:null,pending:false,done:false,tries:0});
 if(state.current.key!==key)state.current={key,pending:false,done:false,tries:0};
 const check=useCallback(()=>{
  const current=state.current;if(!enabled||!key||current.done||current.pending||current.tries>=3||AppState.currentState!=='active')return;
  const target=node.current;target?.measureInWindow((x,y,w,h)=>{
   if(state.current!==current||!latest.current.enabled||latest.current.key!==key||AppState.currentState!=='active'||node.current!==target||current.pending||current.done||!bankHalfVisible({x,y,width:w,height:h},{width,height}))return;
   current.at??=performance.now();current.pending=true;current.tries++;
   void callback.current(current.at).then(done=>{current.done=done;}).catch(()=>{}).finally(()=>{current.pending=false;});
  });
 },[enabled,key,node,width,height]);
 useEffect(()=>{
  if(!enabled||!key)return;let timer:ReturnType<typeof setInterval>|undefined;
  const stop=()=>{if(timer){clearInterval(timer);timer=undefined;}};
  const start=()=>{stop();if(AppState.currentState!=='active')return;check();timer=setInterval(()=>{if(state.current.done||state.current.tries>=3)stop();else check();},1000);};
  const frame=requestAnimationFrame(start);const subscription=AppState.addEventListener('change',state=>{if(state==='active')start();else stop();});
  return()=>{cancelAnimationFrame(frame);stop();subscription.remove();};
 },[enabled,key,check]);
 return check;
}
