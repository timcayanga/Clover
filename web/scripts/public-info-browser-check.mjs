import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const binary = process.env.AGENT_BROWSER_BIN || "agent-browser";
const base = process.env.PUBLIC_INFO_TEST_URL || "http://localhost:8134";
const run = (...args) => execFileSync(binary, ["--session", "public-info-regression", ...args], { encoding: "utf8", timeout: 60000 }).trim();
const evaluate = js => JSON.parse(run("eval", js));
try {
  for (const [width,height] of [[1440,900],[1920,1080],[768,1024],[390,844],[320,568]]) {
    run("set","viewport",String(width),String(height));
    for (const path of ["contact-us","privacy-policy","terms-of-service"]) {
      run("open", `${base}/${path}`);
      run("wait", "#public-info-main h1");
      const state=evaluate(`({overflow:document.documentElement.scrollWidth>innerWidth,headings:document.querySelectorAll('h1').length,error:!!document.querySelector('[data-nextjs-dialog]'),footer:!!document.querySelector('footer'),brokenAnchors:[...document.querySelectorAll('main a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1))).length,font:parseFloat(getComputedStyle(document.querySelector('main p')).fontSize)})`);
      assert.equal(state.overflow,false,`${path} ${width}: overflow`);
      assert.equal(state.headings,1);
      assert.equal(state.error,false);
      assert.equal(state.footer,true);
      assert.equal(state.brokenAnchors,0);
      assert(state.font>=12.8);
      // Text-only zoom: retain full content and prevent horizontal scrolling.
      const zoom=evaluate(`(()=>{document.documentElement.style.fontSize='200%';const overflow=document.documentElement.scrollWidth>innerWidth;document.documentElement.style.fontSize='';return overflow})()`);
      assert.equal(zoom,false,`${path} ${width}: text zoom overflow`);
    }
    console.log(`PASS ${width}×${height}: contact, privacy, terms, and 200% text size.`);
  }
  run("open",`${base}/contact-us`);
  // Stub only the contact request. No inquiry is stored and no email is sent.
  evaluate(`(()=>{const original=window.fetch;window.__contactRequests=[];window.__contactFail=true;window.fetch=async(url,options)=>{if(url==='/api/contact-us'){window.__contactRequests.push(JSON.parse(options.body));return new Response(JSON.stringify(window.__contactFail?{error:'Test delivery unavailable'}:{ok:true}),{status:window.__contactFail?400:200,headers:{'Content-Type':'application/json'}})}return original(url,options)};return true})()`);
  run("type",'input[autocomplete="name"]',"Sample Tester");
  run("type",'input[type="email"]',"sample@example.com");
  run("type","textarea","Testing the contact form without sending a real inquiry.");
  run("click",'button[type="submit"]');
  run("wait",'[role="alert"]');
  assert.equal(evaluate("document.querySelector('textarea').value"),"Testing the contact form without sending a real inquiry.");
  evaluate("window.__contactFail=false");
  run("click",'button[type="submit"]');
  run("wait",'form [role="status"]');
  assert.equal(evaluate("document.querySelector('textarea').value"),"");
  assert.equal(evaluate("window.__contactRequests.length"),2);
  assert(evaluate("document.querySelector('form [role=\"status\"]').textContent.includes('received')"));
  console.log("PASS contact request payload, failure preservation, retry, and success reset (mock transport).");
} finally { run("close"); }
