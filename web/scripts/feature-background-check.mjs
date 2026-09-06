import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const binary = process.env.AGENT_BROWSER_BIN || "agent-browser";
const base = process.env.FEATURE_TEST_URL || "http://localhost:8134";
const run = (...args) => execFileSync(binary, ["--session", "feature-background-check", ...args], { encoding: "utf8", timeout: 60000 }).trim();
const evaluate = js => JSON.parse(run("eval", js));
try {
  for (const [width,height] of [[1400,725],[1920,1080],[1024,768],[390,844],[320,568]]) {
    run("set", "viewport", String(width), String(height));
    for (const slug of ["manage-money","understand-your-money","plan-ahead","manage-money-together","security","pro"]) {
      run("open", `${base}/features/${slug}`);
      run("wait", "[data-feature-background]");
      // Include positions between chapter stops: paused scrolling must not
      // leave two translucent scenes or a scaled duplicate underneath.
      for (const progress of [0,.7,.88,1]) {
        const state = evaluate(`(async()=>{
          const root=document.querySelector('[data-feature-story]');
          scrollTo({top:scrollY+root.getBoundingClientRect().top+(root.offsetHeight-innerHeight)*${progress},behavior:'instant'});
          await Promise.all([...root.querySelectorAll('[data-feature-scene] img')].map(i=>i.decode().catch(()=>{})));
          await new Promise(r=>setTimeout(r,350));
          const bg=root.querySelector('[data-feature-background]');
          const pictures=[...root.querySelectorAll('[data-feature-scene]')];
          return {opacity:pictures.map(p=>getComputedStyle(p).opacity),loaded:pictures.every(p=>p.querySelector('img').naturalWidth>0),backdrop:getComputedStyle(bg.parentElement).backgroundImage,transform:getComputedStyle(bg).transform,overflow:document.documentElement.scrollWidth>innerWidth,error:!!document.querySelector('[data-nextjs-dialog]')};
        })()`);
        assert.deepEqual(state.opacity.slice().sort(), ["0","1"], `${slug} ${width} ${progress}: ghosting`);
        assert.equal(state.backdrop,"none", `${slug}: duplicate backdrop`);
        assert.equal(state.transform,"none", `${slug}: moving background`);
        assert.equal(state.loaded,true, `${slug}: missing asset`);
        assert.equal(state.overflow,false, `${slug}: overflow`);
        assert.equal(state.error,false, `${slug}: error overlay`);
      }
    }
    console.log(`PASS ${width}×${height}: six pages, four scroll positions, one settled photo.`);
  }
} finally { run("close"); }
