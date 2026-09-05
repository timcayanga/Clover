import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base=process.env.FEATURE_TEST_URL ?? "http://localhost:3012";
const browser=process.env.AGENT_BROWSER_BIN;
const run=(...args)=>execFileSync(browser || "npx", [...(browser?[]:["--no-install","agent-browser"]),"--session","feature-matrix",...args],{encoding:"utf8",timeout:60000}).trim();
const evaluate=(js)=>JSON.parse(JSON.parse(run("eval",js)));
const slugs=["manage-money","understand-your-money","plan-ahead","manage-money-together","security","pro"];
for(const [width,height] of [[1440,900],[390,844],[320,568],[1024,768],[1440,600],[820,1180]]){
 run("set","viewport",String(width),String(height));
 for(const slug of slugs){
  run("open",base+"/features/"+slug);
  run("wait","[data-feature-story]");
  run("wait","--fn","[...document.images].every(image=>!image.getClientRects().length||image.complete)");
  const chapters=evaluate('JSON.stringify([...document.querySelectorAll("nav[aria-label=\\"Feature story chapters\\"] button")].map(b=>b.getAttribute("aria-label")))');
  assert.equal(chapters.length,5);
  for(let i=0;i<5;i++){
   run("eval",'window.scrollTo({top:(document.querySelector("[data-feature-story]").offsetHeight-innerHeight)*'+i+'/4,behavior:"instant"})');
   run("wait","--fn",'document.querySelector("nav[aria-label=\\"Feature story chapters\\"] small").textContent==="'+(i+1)+'/5"');
   const result=evaluate('JSON.stringify({heading:document.querySelector("h1").textContent,overflow:document.documentElement.scrollWidth>innerWidth,broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),text:document.querySelector("h1").getBoundingClientRect().toJSON(),support:document.querySelector("[data-visual]")?getComputedStyle(document.querySelector("[data-visual]")).display:null})');
   assert.equal(result.overflow,false,slug+" "+width+" chapter "+i+": horizontal overflow");
   assert.equal(result.broken.length,0,slug+": broken images "+result.broken);
   assert.ok(result.text.top>=64,slug+" "+width+" chapter "+i+": title behind header");
   assert.ok(result.text.bottom<=height,slug+" "+width+" chapter "+i+": title outside viewport");
   if(width<=900&&result.support)assert.equal(result.support,"none");
   const overlay=evaluate('JSON.stringify((()=>{const e=document.querySelector("[data-visual]");return {labels:!!document.querySelector("[data-eyebrow],[data-products]"),kind:e?.dataset.visual,box:e?.getBoundingClientRect().toJSON(),capture:e?.querySelector("img")?.getAttribute("src")}})())');
   assert.equal(overlay.labels,false,"Redundant feature labels remain");
   if(overlay.kind){
    assert.equal(overlay.kind,"transactions","Unverified marketing screen");
    assert.match(overlay.capture,/landing-screens\/transactions-(ph|global)\.webp/);
    if(width>900){
     assert.ok(overlay.box.left>=width*.8,"Phone leaves the clear right-hand area");
     assert.ok(overlay.box.right<=width*.96,"Phone collides with page edge");
     assert.ok(overlay.box.top>=80,"Phone reaches header");
    }
   }
   if((width===1440||width===390)&&(i===0||i===4||slug==="pro"&&i===3||slug==="understand-your-money"&&i===2))run("screenshot","/tmp/feature-"+slug+"-"+width+"-"+i+".png");
  }
  console.log("PASS "+slug+" "+width+"x"+height+": all five chapters");
 }
}
console.log("Feature story responsive browser matrix passed.");
