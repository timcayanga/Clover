const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../components/clerk-auth-screen.tsx'),'utf8');
const code=ts.transpileModule(source+'\nexport { ClerkAuthScreenInner };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function scenario(status){
 const states=[],calls=[];let index=0;const exports={};
 const signIn={create:async()=>({status,supportedSecondFactors:[{strategy:'email_code',emailAddressId:'verified-email-id'}]}),prepareSecondFactor:async p=>calls.push(['prepare',p]),attemptSecondFactor:async p=>{calls.push(['verify',p]);return {status:'complete',createdSessionId:'verified-session'}}};
 vm.runInNewContext(code,{exports,window:{},navigator:{userAgent:''},require:name=>{
  if(name==='react')return {useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v]},useMemo:f=>f(),useEffect(){}};
  if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  if(name==='next/navigation')return {useRouter:()=>({replace:p=>calls.push(['route',p])})};
  if(name==='@clerk/nextjs')return {useAuth:()=>({isLoaded:true,isSignedIn:false}),useSignIn:()=>({isLoaded:true,signIn,setActive:async p=>calls.push(['active',p])}),useSignUp:()=>({isLoaded:true,signUp:{}})};
  if(name==='../../shared/auth-failure')return {needsSignInVerification:s=>['needs_client_trust','needs_second_factor'].includes(s)};
  if(name==='@/components/use-social-providers')return {useSocialProviders:()=>[]};
  if(name==='@/lib/clerk-session-persistence')return {persistRememberedSessionId(){},persistStaySignedInPreference(){},readStaySignedInPreference:()=>true};
  return {};
 }});
 const render=()=>{index=0;const nodes=[];const walk=n=>{if(Array.isArray(n))return n.forEach(walk);if(!n||typeof n!=='object')return;nodes.push(n);walk(n.props?.children)};walk(exports.ClerkAuthScreenInner({mode:'sign-in',completeRedirectUrl:'/continue'}));return nodes};
 let nodes=render();nodes.find(n=>n.type==='input'&&n.props.type==='email').props.onChange({target:{value:'fixture@example.test'}});
 nodes=render();nodes.find(n=>n.props.id==='clover-auth-password').props.onChange({target:{value:'fixture-password'}});
 await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0][0],'prepare');assert.equal(calls[0][1].strategy,'email_code');
 nodes=render();const input=nodes.find(n=>n.type==='input'&&n.props.autoComplete==='one-time-code');assert(input,'Device trust must show an actionable code input');
 input.props.onChange({target:{value:'123456'}});
 await render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.deepEqual(calls.map(c=>c[0]),['prepare','verify','active']);assert.equal(calls[2][1].session,'verified-session');
}
(async()=>{await scenario('needs_client_trust');await scenario('needs_second_factor');console.log('PASS actual web sign-in form: Device Trust and MFA prepare code, show verification and activate only after successful verification')})().catch(e=>{console.error(e);process.exitCode=1});
