import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const browser = process.env.AGENT_BROWSER_BIN;
const base = process.env.LANDING_TEST_URL || "http://localhost:3012";
const run = (...args) => execFileSync(browser, ["--session", "final-cta", ...args], { encoding: "utf8", timeout: 60000 }).trim();
const read = js => JSON.parse(JSON.parse(run("eval", js)));
const routes = ["/", "/landing-preview", ...["manage-money", "understand-your-money", "plan-ahead", "manage-money-together", "security", "pro"].map(slug => `/features/${slug}`)];

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    run("set", "viewport", String(width), String(height));
    for (const route of routes) {
      run("open", base + route);
      run("wait", "[data-chapter], [data-feature-story]");
      // Verify arrival at the CTA and reversal back into the story.
      for (const final of [false, true, false, true]) {
        run("eval", `window.scrollTo({top:${final ? "document.documentElement.scrollHeight" : "0"},behavior:"instant"})`);
        run("wait", "--fn", `(()=>{const nav=document.querySelector('nav[aria-label$="chapters"]');const buttons=[...nav.querySelectorAll('button')];return buttons[${final ? "buttons.length-1" : "0"}].getAttribute('aria-current')==='step'})()`);
        const hint = read('JSON.stringify([...document.querySelectorAll("button, [class*=scrollHint]")].some(e=>/Keep scrolling/i.test(e.textContent)))');
        assert.equal(hint, !final, `${route} ${width}: incorrect final CTA scroll hint`);
      }
      assert.equal(read('JSON.stringify(!!document.querySelector("[data-nextjs-dialog]"))'), false);
      const footer=read('JSON.stringify((()=>{const f=document.querySelector("footer[aria-label=\\"Clover site footer\\"]");return {count:document.querySelectorAll("footer").length,links:[...f.querySelectorAll("a")].map(a=>a.getAttribute("href")),bottom:f.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth}})())');
      assert.equal(footer.count,1);
      assert.equal(footer.overflow,false);
      assert.ok(footer.bottom<=height+2,"Footer must be reachable after the final CTA");
      for(const target of ["/","/features/manage-money","/features/understand-your-money","/features/plan-ahead","/features/manage-money-together","/features/security","/features/pro","/help","/contact","/privacy-policy","/terms-of-service"]) assert.ok(footer.links.includes(target),"Missing footer link: "+target);
      if (route === "/") run("screenshot", `/tmp/clover-final-cta-${width}.png`);
      console.log(`PASS ${route} ${width}×${height}: hint hides at final CTA and returns earlier`);
    }
  }
} finally {
  run("close");
}
