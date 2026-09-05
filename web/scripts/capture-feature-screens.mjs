// Runs only against the disposable, local capture harness. Every API is mocked.
import {execFileSync} from "node:child_process";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(import.meta.url);
const sharp=require("sharp");
const bin=process.env.AGENT_BROWSER_BIN||"/Users/TimCayanga1/.npm/_npx/6de2aa2fded2970c/node_modules/.bin/agent-browser";
const run=(...args)=>execFileSync(bin,["--session","captures",...args],{encoding:"utf8",maxBuffer:2e6});
const market=process.argv[2]||"ph";
const currency=market==="ph"?"PHP":"USD";
const fixture=JSON.parse(readFileSync(new URL("./landing-transactions-fixture.json",import.meta.url),"utf8"));
const accounts=[{id:"demo-bank",name:market==="ph"?"BPI Savings":"Chase Checking",institution:market==="ph"?"BPI":"Chase",accountNumber:"00001234",type:"bank",currency,source:"manual",balance:"84250"},{id:"demo-wallet",name:market==="ph"?"GCash":"PayPal",institution:market==="ph"?"GCash":"PayPal",type:"wallet",currency,source:"manual",balance:"4250"},{id:"demo-invest",name:"Long-term portfolio",institution:market==="ph"?"GoTrade":"Fidelity",type:"investment",investmentSubtype:"stocks",currency,balance:"120000",source:"manual",investmentUnits:"100",investmentAverageCost:"1000"}];
const body={workspaces:[{id:"landing-demo",name:"Personal",type:"personal"}],accounts,transactions:[],categories:[],accountRules:[],statementCheckpoints:[],investmentSnapshots:[],notifications:[],unreadCount:0,user:{id:"demo",firstName:"Alex",planTier:"pro",defaultCurrency:currency,onboardingCompletedAt:"2026-09-01"},planTier:"pro",defaultCurrency:currency,rates:{PHP:1,USD:1},base:currency,preferences:{currency},imports:[]};
accounts.forEach(account=>{account.workspaceId="landing-demo";});
body.categories=fixture.categories;
body.transactions=fixture.rows.map(([date,name,amount,categoryId,accountId],i)=>({id:`demo-transaction-${i}`,workspaceId:"landing-demo",date,description:name,rawDescription:name,merchant:name,title:name,amount:String(market==="ph"?Number(amount):Number(amount)/10),currency,categoryId,accountId,type:categoryId==="salary"?"income":"expense",status:"confirmed",confidence:1,reviewStatus:"confirmed",source:"upload",account:accounts.find(a=>a.id===accountId),category:fixture.categories.find(c=>c.id===categoryId)}));
if(market==="global") body.transactions.forEach((t,i)=>{t.title=t.description=t.rawDescription=t.merchant=["Whole Foods","Uber","National Grid","Starbucks","Salary","Chipotle","AT&T","Uniqlo"][i];t.amount=String([84.20,22,192,5.75,4800,14.50,65,49.90][i]);});
body.transactions.forEach(t=>Object.assign(t,{merchantRaw:t.merchant,merchantClean:t.merchant,accountName:t.account.name,institution:t.account.institution,categoryName:t.category.name,isTransfer:false,isExcluded:false,parserConfidence:1,categoryConfidence:1}));
run("network","unroute");
run("network","route","**/api/**","--body",JSON.stringify(body));
run("set","viewport","402","778","3");
for(const page of process.argv.slice(3).length?process.argv.slice(3):["transactions","accounts","recurring","reports","adviser","investments","budget","goal","circles","split"]){
 run("open",`http://localhost:3012/capture-local?page=${page}&market=${market}`);
 run("wait","--fn","document.querySelector('.app-shell') !== null || document.querySelector('.clover-shell') !== null || document.querySelector('main') !== null");
 if(page==="adviser"){
  run("eval",`sessionStorage.setItem('clover-adviser-chat-session-v1',JSON.stringify({messages:[{role:'user',content:'Can I afford a trip next year?'},{role:'assistant',content:'Based on your sample spending, start with a monthly travel amount of ${market==="ph"?"₱3,000":"$300"}. Keep your recurring bills and emergency savings covered first. We can turn that into an editable savings goal.'}]})); location.reload()`);
 }
 run("wait","--fn","document.fonts.status === 'loaded'");
 run("wait","--fn","document.querySelector('main') && !document.body.innerText.includes('Loading your')");
 run("wait","1000");
 if(run("get","text","body").includes("Something Went Wrong")) throw new Error(`Capture failed: ${page}`);
 run("eval","document.querySelector('nextjs-portal')?.remove()");
 run("screenshot",`/tmp/clover-${page}-${market}.png`);
 await sharp(`/tmp/clover-${page}-${market}.png`).webp({quality:92}).toFile(`../assets/landing-screens/${page}-${market}.webp`);
 console.log(page,market,run("get","text","body").slice(0,250));
}
