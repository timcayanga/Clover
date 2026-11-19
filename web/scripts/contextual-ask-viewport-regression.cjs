const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsFixture = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/ask-clover-viewport.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:exportsFixture});
const {bindAskCloverViewport} = exportsFixture;
function events() {
  const listeners = new Map();
  return {listeners, addEventListener:(name,fn)=>listeners.set(name,fn), removeEventListener:(name,fn)=>{assert.equal(listeners.get(name),fn);listeners.delete(name)}, fire:name=>listeners.get(name)?.()};
}
for (const hasVisualViewport of [true,false]) {
  const values = new Map(), frames = new Map(); let next = 0;
  const panel = {style:{setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k)}};
  const viewport = Object.assign(events(),{height:852,offsetTop:0});
  const browser = Object.assign(events(),{innerHeight:852,visualViewport:hasVisualViewport?viewport:null,requestAnimationFrame:fn=>{frames.set(++next,fn);return next},cancelAnimationFrame:id=>frames.delete(id)});
  const flush=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn()}};
  const unbind = bindAskCloverViewport(panel,browser);
  assert.equal(values.get('--ask-visible-height'),'852px');
  assert.equal(values.get('--ask-keyboard-inset'),'0px');
  if (hasVisualViewport) {
    viewport.height=510;viewport.fire('resize');viewport.fire('scroll');
    assert.equal(frames.size,1,'Resize and panning coalesce into one frame');flush();
    assert.equal(values.get('--ask-visible-height'),'510px');assert.equal(values.get('--ask-keyboard-inset'),'342px');
    viewport.offsetTop=42;viewport.fire('scroll');flush();assert.equal(values.get('--ask-keyboard-inset'),'300px');
    viewport.height=852;viewport.offsetTop=0;viewport.fire('resize');flush();assert.equal(values.get('--ask-keyboard-inset'),'0px');
  } else {
    browser.innerHeight=510;browser.fire('resize');flush();assert.equal(values.get('--ask-visible-height'),'510px');assert.equal(values.get('--ask-keyboard-inset'),'0px');
  }
  browser.fire('resize');assert.equal(frames.size,1);unbind();
  assert.equal(frames.size,0);assert.equal(values.size,0);assert.equal(browser.listeners.size,0);assert.equal(viewport.listeners.size,0);
}
assert.match(fs.readFileSync(path.join(__dirname,'../components/contextual-ask-clover.tsx'),'utf8'),/if \(isOpen && panelRef.current\) return bindAskCloverViewport\(panelRef.current\)/);
const entry = fs.readFileSync(path.join(__dirname,'../components/dashboard-top-actions.tsx'),'utf8');
assert.match(entry,/if \(entryTab === "ask" && rootRef.current\) return bindAskCloverViewport\(rootRef.current\)/);
assert.match(entry,/data-entry-method=\{entryTab\}/);
console.log('PASS actual sheet viewport binding: keyboard open/close, pan, resize fallback, frame coalescing and complete close cleanup.');
