// Real recovery hook + React lifecycle; simulated AppState and Clerk server.
const assert=require('node:assert/strict'),path=require('node:path');
const esbuild=require('esbuild'),{chromium}=require('playwright-core');
const root=path.resolve(__dirname,'..');
(async()=>{
 const build=await esbuild.build({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';
import{useSessionRecovery}from'../mobile/src/use-session-recovery';
window.listeners=new Set();window.pending=[];window.activations=[];window.reads=0;window.serverSessions=[];window.mounts=0;
const clerk={client:{sessions:[],lastActiveSessionId:null,isNew:()=>false,reload:()=>{window.reads++;return new Promise(resolve=>window.pending.push(()=>{clerk.client.sessions=window.serverSessions;clerk.client.lastActiveSessionId=window.serverSessions[0]?.id??null;resolve(clerk.client)}))}},setActive:async({session})=>{window.activations.push(session);window.setUser(session)}};
function Form(){useEffect(()=>{window.mounts++},[]);return <input aria-label='Sign-in draft'/>}
function App(){const[user,setUser]=useState(null);window.setUser=setUser;const recovery=useSessionRecovery(clerk,true,user);window.recover=recovery.recoverSession;window.logout=()=>recovery.duringSignOut(async()=>{clerk.client.sessions=[];clerk.client.lastActiveSessionId=null;window.serverSessions=[];setUser(null)});return <><div aria-hidden={!user&&recovery.recovering}>{user?<p>Home for {user}</p>:<><p>Opening screens</p><Form/></>}</div>{!user&&recovery.recovering?<div role='status'>Finishing sign-in</div>:null}</>}
function Host(){const[key,setKey]=useState(0);window.restart=()=>setKey(n=>n+1);return <App key={key}/>};createRoot(document.getElementById('root')).render(<Host/>);`},bundle:true,write:false,format:'iife',jsx:'automatic',alias:{react:path.dirname(require.resolve('react',{paths:[root]}))},plugins:[{name:'app-state',setup(build){build.onResolve({filter:/^react-native$/},()=>({path:'native',namespace:'fixture'}));build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const AppState={currentState:'active',addEventListener:(_,listener)=>{window.listeners.add(listener);return {remove:()=>window.listeners.delete(listener)}}};window.appState=state=>{AppState.currentState=state;for(const listener of window.listeners)listener(state)};`,loader:'js'}))}}]});
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{const page=await browser.newPage();page.setDefaultTimeout(6000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://auth.clover.invalid');await page.addScriptTag({content:build.outputFiles[0].text});
 await page.getByRole('status').waitFor();await page.waitForFunction(()=>window.pending.length===1);await page.evaluate(()=>window.pending.shift()());await page.waitForFunction(()=>!document.querySelector('[role=status]'));
 await page.getByLabel('Sign-in draft').fill('uninterrupted draft');const mounts=await page.evaluate(()=>window.mounts);
 await page.evaluate(()=>{window.appState('background');window.serverSessions=[{id:'verified-user',status:'active'}];window.appState('active')});
 await page.getByRole('status').waitFor();assert.equal(await page.getByLabel('Sign-in draft').inputValue(),'uninterrupted draft');assert.equal(await page.evaluate(()=>window.mounts),mounts,'Resume must not unmount pending sign-in');
 await page.evaluate(()=>window.pending.shift()());await page.getByText('Home for verified-user').waitFor();assert.deepEqual(await page.evaluate(()=>window.activations),['verified-user']);
 const reads=await page.evaluate(()=>window.reads);await page.evaluate(()=>{window.appState('inactive');window.appState('active')});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.reads),reads,'Signed-in resume does not create another login');
 // Process restart: existing device session is activated before opening screens become interactive.
 await page.evaluate(()=>window.restart());await page.getByRole('status').waitFor();assert.equal(await page.locator('[aria-hidden=true]').count(),1);await page.waitForFunction(()=>window.pending.length===1);await page.evaluate(()=>window.pending.shift()());await page.getByText('Home for verified-user').waitFor();
 // Sign out cannot be undone by a previously started verification.
 await page.evaluate(()=>window.logout());await page.getByLabel('Sign-in draft').waitFor();await page.evaluate(()=>{window.appState('background');window.appState('active')});await page.waitForFunction(()=>window.pending.length===1);
 const before=await page.evaluate(()=>window.activations.length);await page.evaluate(()=>window.logout());await page.evaluate(()=>{window.serverSessions=[{id:'late-response',status:'active'}];window.pending.shift()()});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>window.activations.length),before);
 assert.deepEqual(errors,[]);console.log('PASS real React resume lifecycle: background/foreground recovery, retained auth form, cold restart, signed-in resume and logout race; simulated Clerk/AppState');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
