// Isolated browser exercise of the real React components; no Clerk/account network access.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const esbuild=require('esbuild'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../output/mobile-return');
const adapters={
  '@clerk/nextjs':`export const useUser=()=>({user:window.user});`,
  'next/link':`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
  'react-native':`import React from 'react';export const AppState={addEventListener:(_,fn)=>{window.appListener=fn;return {remove(){window.appListener=null}}}};export const StyleSheet={absoluteFill:{position:'fixed',inset:0}};export const Pressable=({children,onPress,accessibilityLabel,style})=><button aria-label={accessibilityLabel} onClick={onPress} style={Object.assign({},...(Array.isArray(style)?style:[style]))}>{children}</button>;`,
  './app-text':`import React from 'react';export const Text=({children,style})=><span style={style}>{children}</span>;`,
};
(async()=>{
fs.mkdirSync(out,{recursive:true});
const build=await esbuild.build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MobileReturnGreeting}from'./components/mobile-return-greeting';import{HomePendingSplitBills}from'./components/home-pending-split-bills';import{ReturnGreeting}from'../mobile/src/return-greeting';
window.user=null;window.native=false;window.summary={count:0,bills:[]};window.fetches=0;window.fetch=async()=>{window.fetches++;return {ok:true,json:async()=>({pending:window.summary})}};
function App(){const[v,setV]=useState(0);window.redraw=()=>setV(n=>n+1);return <><main>Latest Transactions page</main>{window.native?<ReturnGreeting firstName='Tim'/>:<MobileReturnGreeting/>}<HomePendingSplitBills key={v}/></>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',alias:{react:path.dirname(require.resolve('react')),'@':root},plugins:[{name:'isolated-adapters',setup(b){b.onResolve({filter:/.*/},args=>{if(adapters[args.path])return {path:args.path,namespace:'adapter'}});b.onLoad({filter:/.*/,namespace:'adapter'},args=>({contents:adapters[args.path],loader:'jsx',resolveDir:root}));}}]});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<style>body{font:14px sans-serif;background:#f5f8fa}.mobile-return-greeting{position:fixed;inset:0;background:#00aabd;color:white;font-size:36px;display:flex;align-items:center;justify-content:center;border:0;width:100%;height:100dvh}.dashboard-home__goal-card{padding:20px;background:white;border-radius:20px}.dashboard-home__action-row{display:flex;gap:12px;padding:16px 0;color:#202c35;text-decoration:none}.dashboard-home__action-row-copy{display:grid}.home-sensitive-amount__mask{display:none}@media(min-width:768px){.mobile-return-greeting{display:none}}</style><div id='root'></div>`}));
await page.clock.install({time:new Date('2026-11-05T10:00:00Z')});await page.clock.pauseAt(new Date('2026-11-05T10:00:00Z'));await page.goto('https://return.clover.invalid');await page.addScriptTag({content:build.outputFiles[0].text});
await page.getByText('Latest Transactions page').waitFor();assert.equal(await page.getByRole('button',{name:/Hi/}).count(),0,'No personalized greeting before authentication');
await page.evaluate(()=>{window.user={id:'qa-verified',firstName:'Tim'};window.redraw()});
await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).waitFor();await page.screenshot({path:path.join(out,'web-greeting.png')});
await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).click();assert.equal(await page.getByText('Latest Transactions page').count(),1);
await page.evaluate(()=>window.redraw());assert.equal(await page.getByRole('button',{name:/Hi/}).count(),0,'Navigation does not replay the greeting');
assert.equal(await page.getByRole('region',{name:'Pending Split Bills'}).count(),0,'No card without pending bills');
await page.evaluate(()=>{window.summary={count:2,bills:[{id:'one',title:'Lunch with friends',currency:'PHP',remaining:600},{id:'two',title:'Japan Trip',currency:'JPY',remaining:2500}]};window.redraw()});
await page.getByRole('region',{name:'Pending Split Bills'}).waitFor();assert.equal(await page.locator('a[href="/split-bill/one"]').count(),1);assert.equal(await page.locator('a[href="/split-bill/two"]').count(),1);assert.match(await page.getByRole('region').innerText(),/2 bills to settle/);
await page.screenshot({path:path.join(out,'web-pending-bills.png')});
await page.evaluate(()=>{window.summary={count:0,bills:[]};window.redraw()});await page.getByRole('region',{name:'Pending Split Bills'}).waitFor({state:'detached'});
await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>{window.user={id:'desktop-user',firstName:'Tim'};window.redraw()});assert.equal(await page.getByRole('button',{name:/Hi/}).count(),0,'Greeting is mobile-only on web');
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.native=true;window.redraw()});await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).waitFor();
await page.clock.runFor(1100);await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).waitFor({state:'detached',timeout:2500});
await page.evaluate(()=>{window.appListener('inactive');window.appListener('active')});assert.equal(await page.getByRole('button',{name:/Hi/}).count(),0,'Native menus do not trigger greeting');
await page.evaluate(()=>{const original=Date.now;let now=original();Date.now=()=>now;window.appListener('background');now+=31000;window.appListener('active');Date.now=original});await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).waitFor();await page.evaluate(()=>window.appListener('background'));await page.getByRole('button',{name:'Hi, Tim! Continue to Clover'}).waitFor({state:'detached'});await page.clock.runFor(1500);await page.evaluate(()=>window.appListener('active'));assert.equal(await page.getByRole('button',{name:/Hi/}).count(),0,'A brief background during greeting restores the page, without a suspended timer replay');assert.equal(await page.getByText('Latest Transactions page').count(),1);
assert.deepEqual(errors,[]);console.log('PASS actual React mobile greetings: authenticated entry, fast dismissal, one-second expiry, navigation/menu suppression, background return, desktop exclusion; pending/settled bills and detail links');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
