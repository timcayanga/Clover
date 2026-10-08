// Actual native Home component with DOM adapters and synthetic responses.
// Exercises React focus/render behavior without accessing any user account.
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const { chromium } = require('playwright-core');
const root = path.resolve(__dirname, '..');
const react = path.dirname(require.resolve('react', { paths: [root] }));
const adapters = {
  'react-native': `import React from 'react'; export const Platform={OS:'web'};export const View=({children,accessibilityLabel})=><div aria-label={accessibilityLabel}>{children}</div>;export const ScrollView=View;export const Pressable=({children,onPress,accessibilityLabel})=><button aria-label={accessibilityLabel} onClick={onPress}>{children}</button>;`,
  'expo-router': `import React from 'react';export const router={navigate(){}};const nav={setOptions(){}};export const useNavigation=()=>nav;export const useFocusEffect=cb=>React.useEffect(()=>window.focused?cb():undefined,[cb,window.focused]);`,
  'expo-secure-store': `export const getItemAsync=async()=>null;export const setItemAsync=async()=>{};`,
  'expo-linear-gradient': `import React from 'react';export const LinearGradient=({children})=><div>{children}</div>;`,
  'adaptive-modal': `export const Modal=()=>null;`,
  'adaptive': `import React from 'react';export const AdaptiveGrid=({children})=><div>{children}</div>;`,
  'app-text': `import React from 'react';export const Text=({children})=><span>{children}</span>;`,
  'home-adviser': `export const HomeAdviser=()=>null;`,
  'home-chart': `export const HomeChart=()=>null;`,
  'home-quick-access': `export const HomeQuickAccess=()=>null;`,
  'session': `export const useSession=()=>window.session;`,
  'api': `export class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}window.TestApiError=ApiError;`,
  'ui': `import React from 'react';const theme={colors:{},styles:{}};export const useTheme=()=>theme;export const money=(amount,code)=>code+' '+amount;export const Screen=({children})=><main>{children}</main>;export const Body=({children})=><p>{children}</p>;export const Card=Body;export const Heading=Body;export const Notice=({children})=><aside role='alert'>{children}</aside>;export const Button=({title,onPress})=><button onClick={onPress}>{title}</button>;export const Icon=()=>null;export const AppHeader=()=>null;`,
};
(async () => {
  const build = await esbuild.build({
    stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Home from '../mobile/app/(tabs)/index';import{PageCache}from'../mobile/src/page-cache';
window.now=new Date(2026,9,8,12).getTime();window.cache=new PageCache(()=>window.now);window.focused=true;window.pending=[];
window.value=(balance,currency='PHP')=>({currency,balance,month:{income:0,expense:0},previousMonth:{income:0,expense:0},weekly:{income:0,expense:0,days:[]},monthly:{income:0,expense:0,days:[]},upcoming:[]});
window.homePath='home?workspaceId=p&currency=PHP&section=overview';window.cache.seed(window.homePath,window.value(1200),window.now);
window.session={profileId:'p',data:{defaultCurrency:'PHP'},demo:false,rows:[],cached:path=>window.cache.home(path),request:path=>window.cache.read(path,()=>new Promise((resolve,reject)=>window.pending.push({path,resolve,reject})))};
function App(){const[n,setN]=useState(0);window.redraw=()=>setN(n=>n+1);return <Home/>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', alias: { react },
    plugins: [{ name: 'native-dom-adapters', setup(build) {
      build.onResolve({filter: /.*/}, args => {
        const key = adapters[args.path] ? args.path : args.path.match(/\/src\/([^/]+)$/)?.[1];
        if (key && adapters[key]) return {path: key, namespace:'adapter'};
      });
      build.onLoad({filter:/.*/,namespace:'adapter'}, args => ({contents:adapters[args.path],loader:'jsx',resolveDir:root}));
    }}],
  });
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    page.setDefaultTimeout(7000);
    const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('React error:',e.message)});
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    await page.goto('https://home.clover.invalid');await page.addScriptTag({content:build.outputFiles[0].text});
    await page.getByText('PHP 1200',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Loading balance').count(),0);
    await page.waitForFunction(()=>window.pending.length===1);
    await page.evaluate(()=>window.pending.shift().resolve(window.value(1500)));
    await page.getByText('PHP 1500',{exact:true}).waitFor();
    await page.evaluate(()=>{window.focused=false;window.redraw()});await page.waitForTimeout(30);
    await page.evaluate(()=>{window.now+=6*60_000;window.focused=true;window.redraw()});
    await page.waitForFunction(()=>window.pending.length===1);
    await page.waitForTimeout(2100); // Reproduce a two-second server delay.
    assert.equal(await page.getByLabel('Loading balance').count(),0);
    assert.equal(await page.getByText('PHP 1500',{exact:true}).count(),1);
    await page.evaluate(()=>window.pending.shift().reject(Error('Network interrupted')));
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByText('PHP 1500',{exact:true}).count(),1);
    await page.evaluate(()=>{window.focused=false;window.redraw()});await page.waitForTimeout(30);
    await page.evaluate(()=>{window.cache.clear();window.focused=true;window.redraw()});
    await page.getByLabel('Loading balance').waitFor({state:'attached'});assert.equal(await page.getByText('PHP 1500',{exact:true}).count(),0);
    await page.evaluate(()=>window.pending.shift().resolve(window.value(900)));
    await page.getByText('PHP 900',{exact:true}).waitFor();
    // A different Profile must not paint the prior Profile while loading.
    await page.evaluate(()=>{window.session={...window.session,profileId:'other'};window.redraw()});
    await page.getByLabel('Loading balance').waitFor({state:'attached'});assert.equal(await page.getByText('PHP 900',{exact:true}).count(),0);
    await page.waitForFunction(()=>window.pending.length===1);
    await page.evaluate(()=>window.pending.shift().resolve(window.value(200)));
    await page.getByText('PHP 200',{exact:true}).waitFor();
    // An authorization failure must hide cached balances.
    await page.evaluate(()=>{window.focused=false;window.redraw()});await page.waitForTimeout(30);
    await page.evaluate(()=>{window.focused=true;window.redraw()});await page.waitForFunction(()=>window.pending.length===1);
    await page.evaluate(()=>{window.cache.clear();window.pending.shift().reject(new window.TestApiError('Access expired',403))});
    await page.getByLabel('Loading balance').waitFor({state:'attached'});assert.equal(await page.getByText('PHP 200',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS actual Home React render: immediate cached revisit during 2.1s refresh, refresh failure, mutation invalidation, Profile switch and revoked access (DOM adapters, not device latency)');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
