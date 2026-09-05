// Runs only against the disposable, local capture harness. Every API is mocked.
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const sharp=require("sharp");
const bin=process.env.AGENT_BROWSER_BIN||"/Users/TimCayanga1/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser";
const run=(...args)=>execFileSync(bin,["--session","captures",...args],{encoding:"utf8",maxBuffer:2e6});
const market=process.argv[2]||"ph";
const currency=market==="ph"?"PHP":"USD";
const accounts=[{id:"demo-bank",name:market==="ph"?"BPI Savings":"Chase Checking",institution:market==="ph"?"BPI":"Chase",accountNumber:"00001234",type:"bank",currency,source:"manual",balance:"84250"},{id:"demo-wallet",name:market==="ph"?"GCash":"PayPal",institution:market==="ph"?"GCash":"PayPal",type:"wallet",currency,source:"manual",balance:"4250"},{id:"demo-invest",name:"Long-term portfolio",institution:market==="ph"?"GoTrade":"Fidelity",type:"investment",investmentSubtype:"stocks",currency,balance:"120000",source:"manual",investmentUnits:"100",investmentAverageCost:"1000"}];
const body={workspaces:[{id:"landing-demo",name:"Personal",type:"personal"}],accounts,transactions:[],categories:[],accountRules:[],statementCheckpoints:[],investmentSnapshots:[],notifications:[],unreadCount:0,user:{id:"demo",firstName:"Alex",planTier:"pro",defaultCurrency:currency,onboardingCompletedAt:"2026-09-01"},planTier:"pro",defaultCurrency:currency,rates:{PHP:1,USD:1},base:currency,preferences:{currency},imports:[]};
accounts.forEach(account=>{account.workspaceId="landing-demo";});
run("network","unroute");
run("network","route","**/api/**","--body",JSON.stringify(body));
run("set","viewport","402","778");
for(const page of process.argv.slice(3).length?process.argv.slice(3):["accounts","recurring","reports","adviser","investments","budget","goal","circles","split"]){
 run("open",`http://localhost:3012/capture-local?page=${page}&market=${market}`);
 run("wait","--fn","document.querySelector('.app-shell') !== null || document.querySelector('.clover-shell') !== null || document.querySelector('main') !== null");
 if(page==="adviser"){
  run("eval",`sessionStorage.setItem('clover-adviser-chat-session-v1',JSON.stringify({messages:[{role:'user',content:'Can I afford a trip next year?'},{role:'assistant',content:'Based on your sample spending, start with a monthly travel amount of ${market==="ph"?"₱3,000":"$300"}. Keep your recurring bills and emergency savings covered first. We can turn that into an editable savings goal.'}]})); location.reload()`);
 }
 run("wait","--fn","document.fonts.status === 'loaded'");
 run("wait","--fn","document.querySelector('main') && !document.body.innerText.includes('Loading your')");
 if(run("get","text","body").includes("Something Went Wrong")) throw new Error(`Capture failed: ${page}`);
 run("eval","document.querySelector('nextjs-portal')?.remove()");
 run("screenshot",`/tmp/clover-${page}-${market}.png`);
 await sharp(`/tmp/clover-${page}-${market}.png`).webp({quality:92}).toFile(`../assets/landing-screens/${page}-${market}.webp`);
 console.log(page,market,run("get","text","body").slice(0,250));
}
