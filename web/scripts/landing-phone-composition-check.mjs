import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const binary = process.env.AGENT_BROWSER_BIN || "agent-browser";
const base = process.env.LANDING_TEST_URL || "http://127.0.0.1:8134";
const run = (...args) => execFileSync(binary, ["--session", "landing-phone-check", ...args], { encoding: "utf8", timeout: 60000 }).trim();
const evaluate = js => JSON.parse(run("eval", js));
try {
  run("open", base + "/landing-preview");
  for (const [width, height] of [[1400,725],[1920,1080],[1280,800],[1024,768],[390,844],[320,568]]) {
    run("set", "viewport", String(width), String(height));
    for (const [index, scene, phone] of [[3,"03-picture",0],[4,"04-adviser",1],[5,"05-plan",2]]) {
      const result = evaluate(`(async()=>{
        const journey=document.querySelector('[data-market]');
        window.scrollTo({top:scrollY+journey.getBoundingClientRect().top+(journey.offsetHeight-innerHeight)*${index}/7,behavior:'instant'});
        await new Promise(resolve=>setTimeout(resolve,400));
        const photo=document.querySelector('[data-scene="${scene}"] picture');
        const device=document.querySelectorAll('[data-story-visual="phone"]')[${phone}];
        return {overflow:document.documentElement.scrollWidth>innerWidth,photoRight:photo.getBoundingClientRect().right,phoneLeft:device.getBoundingClientRect().left,phoneWidth:device.getBoundingClientRect().width,opacity:getComputedStyle(device).opacity};
      })()`);
      assert.equal(result.overflow, false, `${width} ${scene}: horizontal overflow`);
      if (width > 900) {
        assert(result.phoneLeft - result.photoRight >= 12, `${width} ${scene}: photo enters phone gutter`);
        assert.equal(result.opacity, "1", `${width} ${scene}: phone must be opaque`);
      } else assert.equal(result.phoneWidth, 0, `${width} ${scene}: mobile photo must not have a phone overlay`);
    }
    console.log(`PASS ${width}×${height}: all three scenes preserve the photo/phone gutter.`);
  }
} finally { run("close"); }
