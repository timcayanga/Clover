import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
const browser=process.env.AGENT_BROWSER_BIN;
const run=(...args)=>execFileSync(browser,["--session","polish",...args],{encoding:"utf8",timeout:60000}).trim();
const read=js=>JSON.parse(JSON.parse(run("eval",js)));
for(const [w,h] of [[1440,900],[1024,768],[1440,600],[390,844],[320,568]]){
 run("set","viewport",String(w),String(h));run("open",process.env.LANDING_TEST_URL||"http://localhost:3012/");
 run("wait","[data-chapter]");
 if(w>900){
  for(const outside of ['header a[aria-label="Clover home"]','h1']){
   run("find","role","button","click","--name","Features");
   run("wait","#preview-features-menu");
   run("eval",`document.querySelector(${JSON.stringify(outside)}).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))`);
   run("wait","--fn",'!document.querySelector("#preview-features-menu")');
  }
 }
 const styles=[];
 for(let i=0;i<9;i++){
  run("eval",'window.scrollTo({top:(document.querySelector("[data-chapter]").offsetHeight-innerHeight)*'+i+'/8,behavior:"instant"})');
  run("wait","--fn",'document.querySelector("nav[aria-label=\\"Landing page chapters\\"] b").textContent.trim()==="'+(i+1)+' / 9"');
  const result=read('JSON.stringify((()=>{const e=document.querySelector("[data-landing-copy][data-active=true]"),t=e.querySelector("h1"),p=e.querySelector("p");return {font:getComputedStyle(t).fontSize,family:getComputedStyle(t).fontFamily,body:p?getComputedStyle(p).fontSize:null,box:t.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth,path:!!document.querySelector("[class*=world]>svg")}})())');
  assert.equal(result.overflow,false);assert.equal(result.path,false);
  assert.ok(result.box.top>=64,"Title behind header "+w+" "+i);
  assert.ok(result.box.bottom<=h,"Title outside viewport "+w+" "+i);
  if(w>900){
   assert.ok(result.box.x<=w*.1,"Copy not left-aligned");
   const alignment=read('JSON.stringify((()=>{const e=document.querySelector("[data-landing-copy][data-active=true]"),box=e.getBoundingClientRect(),parent=e.offsetParent.getBoundingClientRect();return {center:box.top+box.height/2,target:parent.top+parent.height/2}})())');
   assert.ok(Math.abs(alignment.center-alignment.target)<2,"Copy not vertically centered: "+w+" chapter "+i+" "+JSON.stringify(alignment));
  }
  styles.push(result);
  if(i===1||i===7) {
   const samples=[];
   for(const offset of [-.3,0,.3]){
    run("eval",'window.scrollTo({top:(document.querySelector("[data-chapter]").offsetHeight-innerHeight)*'+(i+offset)+'/8,behavior:"instant"})');
    run("wait","--fn",'Math.abs(Number(document.querySelector("[data-chapter]").style.getPropertyValue("--journey-progress"))-'+((i+offset)/8)+')<.001');
    samples.push(read('JSON.stringify([...document.querySelectorAll("[data-scene]")].map(e=>({opacity:e.style.opacity,transform:e.style.transform})))'));
   }
   assert.deepEqual(samples[0],samples[1],"Background changed entering table");
   assert.deepEqual(samples[1],samples[2],"Background changed leaving table");
  }
  if(w!==320&&(i===1||i===7||i===8))run("screenshot","/tmp/polish-"+w+"-"+i+".png");
 }
 assert.equal(new Set(styles.map(s=>s.font)).size,1,"Inconsistent title sizes");
 assert.equal(new Set(styles.filter(s=>s.body).map(s=>s.body)).size,1,"Inconsistent body sizes");
 console.log("PASS main typography, layout and table hold: "+w+"x"+h);
}
