import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let identity, loaded=true, phase='hidden', effects=[], listener, delay;
const exports={};
const react={useState:()=>[phase,value=>phase=value],useRef:()=>({current:undefined}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
const deps={react,'react/jsx-runtime':{jsx:()=>null},'react-dom':{createPortal:()=>null},'@clerk/nextjs':{useUser:()=>({user:identity,isLoaded:loaded})},'../../shared/home-return':{greetingName:()=>''}};
const document={body:{},visibilityState:'visible',addEventListener:(event,fn)=>listener=fn,removeEventListener(){}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../components/mobile-return-greeting.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:key=>deps[key],window:{matchMedia:query=>({matches:query.includes('max-width')})},document,setTimeout:(fn,ms)=>{delay=ms;return 1;},clearTimeout(){}});
function render(user,isLoaded=true){identity=user;loaded=isLoaded;effects=[];exports.MobileReturnGreeting();return effects[0]();}
const user={id:'greeting-qa',firstName:'QA'};
let cleanup=render(user);assert.equal(phase,'entering');assert(delay>=1500);
document.visibilityState='hidden';listener();assert.equal(phase,'hidden');document.visibilityState='visible';listener();assert.equal(phase,'hidden');cleanup();
render(undefined,false);render(user,true);assert.equal(phase,'hidden','Loading Clerk on route remount must not replay greeting');
render(null,true);render(user,true);assert.equal(phase,'entering','A real logout/sign-in can greet again');
console.log('PASS mobile web greeting: cold sign-in, readable interval, warm resume, transient Clerk loading and subsequent real sign-in');
