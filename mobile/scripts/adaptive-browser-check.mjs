// Run after EXPO_NO_DOTENV=1 EXPO_PUBLIC_LAYOUT_PREVIEW=1 npm run build:preview
// and npm run serve:preview. Fictional data only; never submit financial forms.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const bin = process.env.AGENT_BROWSER_BIN || 'agent-browser';
const output = resolve(process.env.LAYOUT_AUDIT_OUTPUT || '/tmp/clover-adaptive-audit');
mkdirSync(output, { recursive: true });
const run = (...args) => execFileSync(bin, ['--session', 'clover-layout-check', ...args], { encoding: 'utf8', maxBuffer: 5e6 });
const evaluate = expression => JSON.parse(run('eval', expression));
const sizes = [[280,653],[320,568],[390,844],[600,960],[744,1133],[820,1180],[1024,1366],[1366,1024],[540,720],[844,390]];
const routes = ['/', '/transactions', '/accounts', '/recurring', '/reports', '/investments', '/budgeting', '/goals', '/circles', '/split-bills', '/adviser', '/account', '/settings', ...['plan','account','display','profiles','region','categories','security','data','review','notifications'].map(section=>`/settings?section=${section}`), '/notifications', '/offline', '/add-transaction', '/onboarding', '/transaction/groceries', '/transaction/ride', '/import/sample'];
const results = [];
const open = route => { run('open', 'http://127.0.0.1:8127' + route); run('wait', '--fn', "document.querySelector('[role=heading]') !== null"); };
function check(name, width, height) {
  run('set', 'viewport', String(width), String(height));
  // Layout measurements and font loading must settle after a resize.
  run('eval', 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  const result = evaluate(`(()=>{
    const texts = [...document.querySelectorAll('[dir="auto"]')].filter(e=>{
      const r=e.getBoundingClientRect();
      return !e.matches('input,textarea') && r.width && r.height && r.left>=0 && r.right<=innerWidth+1 && getComputedStyle(e).textOverflow!=='ellipsis' && e.scrollWidth>e.clientWidth+3;
    });
    return { title:document.querySelector('[role=heading]')?.textContent, overflow:document.documentElement.scrollWidth>innerWidth+1,
      clipped:texts.map(e=>({text:e.textContent?.slice(0,80),width:e.clientWidth,scroll:e.scrollWidth})),
      error:/Something went wrong|Unmatched Route|Uncaught Error/.test(document.body.innerText), buttons:document.querySelectorAll('[role=button]').length };
  })()`);
  results.push({ name, width, height, ...result });
  writeFileSync(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
  assert(!result.overflow && !result.error && !result.clipped.length, `${name} at ${width}×${height}: ${JSON.stringify(result)}`);
}
const click = (role, name) => run('find', 'role', role, 'click', '--name', name);
for (const route of (process.env.LAYOUT_FLOWS_ONLY ? [] : routes)) {
  open(route);
  for (const [width,height] of sizes) check(route,width,height);
  console.log('PASS',route);
}
const flows = [
  ['/add-transaction', [['tab','Ask Clover']]],
  ['/add-transaction', [['tab','Upload']]],
  ['/add-transaction', [['tab','Sync']]],
  ['/add-transaction', [['button','Table entry']]],
  ['/add-transaction', [['button','More details']]],
  ['/accounts?add=1', []],
  ['/recurring?add=1', []],
  ['/goals', [['button','Create goal']]],
  ['/budgeting', [['button','Create Budget']]],
  ['/circles', [['button','Create Circle']]],
  ['/transactions', [['button','Filter transactions']]],
  ['/settings?section=plan', [['tab','Yearly']]],
  ['/reports', [['button','Filters']]],
  ...['Spending','Trends','Insights'].map(tab=>['/reports',[['tab',tab]]]),
  ['/investments', [['button','Filter investments']]],
  ...['Portfolio','Planner','Markets','Analysis'].map(tab=>['/investments',[['tab',tab]]]),
  ...['Planned Payments','Debt & Loans','Money Owed','Installments'].map(tab=>['/recurring',[['tab',tab]]]),
];
for (const [route, steps] of flows) {
  open(route);
  for (const [role,name] of steps) click(role,name);
  for (const [width,height] of [[320,568],[844,390],[1366,1024]]) check(`${route} ${steps.map(s=>s[1]).join(' → ')}`,width,height);
}
open('/add-transaction');
run('find','label','What was it for?','fill','Groceries at the neighbourhood supermarket');
run('find','label','Amount (PHP)','fill','1234.56');
for (const [width,height] of [[320,568],[1366,1024],[540,720]]) {
  check('Draft survives resize',width,height);
  assert.equal(evaluate('document.querySelector("[aria-label=\\"What was it for?\\"]").value'),'Groceries at the neighbourhood supermarket');
  assert.equal(evaluate('document.querySelector("[aria-label=\\"Amount (PHP)\\"]").value'),'1234.56');
}
for (const [route,name,width,height] of [['/','home-tablet',1024,1366],['/accounts','accounts-tablet',1366,1024],['/reports','reports-tablet',1024,1366],['/settings?section=plan','plans-tablet',1366,1024],['/add-transaction','entry-phone',320,568]]) {
  open(route); check(name,width,height); run('screenshot',resolve(output,`${name}.png`));
}
console.log(`PASS ${results.length} responsive views. OS keyboard, camera, StoreKit/Play Billing and hardware hinges require native-device testing.`);
run('close');
