// Run after capture-feature-screens in its isolated, API-mocked browser session.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const bin = process.env.AGENT_BROWSER_BIN || "/Users/TimCayanga1/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser";
const run = (...args) => execFileSync(bin, ["--session", "captures", ...args], { encoding: "utf8" });
for (const width of [320, 402, 768, 1100, 1440]) {
  for (const page of ["transactions", "split", "recurring", "goal", "circles", "investments"]) {
    run("set", "viewport", String(width), "900", "1");
    run("open", `http://localhost:3012/capture-local?page=${page}&market=global`);
    run("wait", "--fn", "document.querySelector('.content > .topbar, .content > .shell-compact-bar') !== null");
    const result = JSON.parse(run("eval", `(() => {
      const visible = e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden';
      const actions = [...document.querySelectorAll('.content > :is(.topbar,.shell-compact-bar) :is(.adviser-header-link,.contextual-ask-clover__trigger)')].filter(visible);
      const summary = document.querySelector('.split-bill-pulse');
      const add = document.querySelector('[aria-label="Add split bill"]');
      return { actions: actions.map(e => ({width:e.getBoundingClientRect().width,border:getComputedStyle(e).borderTopWidth,background:getComputedStyle(e).backgroundColor})), summaryVisible: summary ? visible(summary) : null, add: add && {width:add.getBoundingClientRect().width,radius:getComputedStyle(add).borderRadius,fill:getComputedStyle(add).backgroundImage,icon:getComputedStyle(add.querySelector('svg')).color}, error:!!document.querySelector('[data-nextjs-dialog]') };
    })()`));
    assert.equal(result.error, false, `${page}: no error overlay`);
    // Circles and Split Bills expose Adviser in the mobile header only.
    const expectedActions = width > 1100 && ["split", "circles"].includes(page) ? 0 : 1;
    assert.equal(result.actions.length, expectedActions, `${page} at ${width}: no duplicate header Adviser`);
    for (const action of result.actions) {
      assert.equal(action.width, width <= 1100 ? 44 : 52, `${page}: matches Transactions size`);
      assert.equal(action.border, "0px");
      assert.equal(action.background, "rgba(0, 0, 0, 0)");
    }
    if (page === "split") {
      assert.equal(result.summaryVisible, width > 1100);
      if (width <= 1100) {
        assert.equal(result.add.width, 36);
        assert.equal(result.add.radius, "50%");
        assert.match(result.add.fill, /linear-gradient/);
        assert.equal(result.add.icon, "rgb(255, 255, 255)");
      }
    }
    if (page === "investments" && width <= 1100) {
      run("find", "role", "button", "click", "--name", "Select investment currency");
      run("find", "role", "option", "click", "--name", "All Currencies Show every currency");
      assert.equal(JSON.parse(run("eval", "document.querySelector('.currency-selector__all-icon').getBoundingClientRect().width")), 20);
    }
    console.log(`${page} ${width}px passed`);
  }
}
