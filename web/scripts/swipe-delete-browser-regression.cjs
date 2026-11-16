// Real React + CSS, synthetic rows and network only. No Clover user data is touched.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
(async()=>{
 const built=await esbuild.build({stdin:{contents:`import React,{useState} from 'react'; import{createRoot}from'react-dom/client';import{MobileSwipeDelete}from'./components/mobile-swipe-delete';function App(){const[rows,setRows]=useState(['Transaction','Account','Investment','Recurring','Split bill']);return <main>{rows.map(name=><MobileSwipeDelete key={name} deleteLabel={'Delete '+name} confirmationMessage={'Delete '+name+'? This cannot be undone.'} onDelete={async()=>{const response=await fetch('/api/delete/'+encodeURIComponent(name),{method:'DELETE'});if(!response.ok)throw new Error('Connection interrupted. Please retry.');setRows(rows=>rows.filter(row=>row!==name));}}><button className="fixture-row" onClick={()=>window.opened=(window.opened||0)+1}>{name}<span>₱1,200.00</span></button></MobileSwipeDelete>)}<p id="end">End of list</p></main>}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',tsconfig:path.join(root,'tsconfig.json')});
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_BROWSER_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=0,fail=true;
 await page.route('**/*',route=>{if(route.request().url().includes('/api/delete/')){requests++;return route.fulfill({status:fail?500:200,body:'{}',contentType:'application/json'});}return route.fulfill({body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>',contentType:'text/html'});});
 await page.goto('https://swipe.clover.invalid');await page.addStyleTag({content:fs.readFileSync(path.join(root,'app/globals.css'),'utf8')+'\n:root{--surface:white;--border:#ccd;}body{margin:0;background:#f5f7f8;}main{padding:12px;}button.fixture-row{width:100%;min-height:76px;display:flex;justify-content:space-between;padding:16px;background:white;color:#182b35;border:0;border-bottom:1px solid #ccd;font:inherit;}#end{margin-top:1200px;}'});await page.addScriptTag({content:built.outputFiles[0].text});await page.locator('.fixture-row').first().waitFor();
 const cdp=await context.newCDPSession(page);
 async function swipe(index,dx,dy=0){const box=await page.locator('.fixture-row').nth(index).boundingBox();const x=box.x+box.width*.75,y=box.y+box.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let step=1;step<=6;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*step/6,y:y+dy*step/6}]});}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(210);}
 await swipe(0,-100);assert.equal(requests,0);assert.equal(await page.evaluate(()=>window.opened||0),0);
 await page.getByRole('button',{name:'Delete Transaction',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(requests,0);
 await swipe(0,-100);await page.getByRole('button',{name:'Delete Transaction',exact:true}).click();await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(requests,1);assert.equal(await page.locator('.fixture-row').count(),5);
 const dir=process.env.QA_ARTIFACT_DIR||'/tmp/clover-swipe-delete';fs.mkdirSync(dir,{recursive:true});
 for(const width of [320,390,768,1024]){await page.setViewportSize({width,height:844});await page.screenshot({path:path.join(dir,`confirmation-${width}.png`)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`No overflow at ${width}`);}
 fail=false;await page.getByRole('button',{name:'Confirm deletion',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.fixture-row').length===4);assert.equal(requests,2);
 // Vertical scrolling must leave the row closed.
 await page.setViewportSize({width:390,height:844});await swipe(1,0,-100);assert.equal(await page.locator('.mobile-swipe-delete.is-open').count(),0);await page.evaluate(()=>scrollTo(0,0));
 // Keyboard-only users can reach the same action without a swipe.
 await page.getByRole('button',{name:'Delete Account',exact:true}).focus();await page.waitForTimeout(210);assert.equal(await page.locator('.mobile-swipe-delete.is-open').count(),1);
 await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-swipe-delete.is-open').count(),0);
 await page.setViewportSize({width:1280,height:844});assert.equal(await page.getByRole('button',{name:'Delete Account',exact:true}).isVisible(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,requests,remainingRows:4,widths:[320,390,768,1024,1280],screenshots:dir,scope:'Actual React component, real touch gestures and CSS; synthetic API'}));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
