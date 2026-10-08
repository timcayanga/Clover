import { selectExistingClerkSession } from "../lib/clerk-initial-session";
import assert from "node:assert/strict";
import { adviserCurrency, adviserMonthRange, isSpendingSummaryQuestion, commitmentInstallment, upcomingBillsReply } from "../lib/adviser-analysis";
import { classifyAdviserScope } from "../lib/adviser-scope";
import { classifyEverydayQuestion, isEverydayFollowUp } from "../lib/adviser-everyday";
import { selectAdviserToolNames } from "../lib/adviser-tool-routing";
import { readAiConsent } from "../lib/ai-consent-request";
import { resolveCircleMemberPhoto } from "../lib/circle-member-photo-match";
import { buildBudgetOverview } from "../lib/budgeting";
async function main() {
  for(const q of ["What is an emergency fund?","Check upcoming bills","Explain compound interest","List overdue payments"]) assert(classifyAdviserScope(q).allowed,q);
  assert.equal(classifyEverydayQuestion("What is an emergency fund?"), null);
  assert.deepEqual(selectAdviserToolNames({question:"What is an emergency fund?"}), []);
  assert.equal(isEverydayFollowUp("What is an emergency fund?"), false);
  assert.equal(isEverydayFollowUp("Check upcoming bills"), false);
  assert.equal(isEverydayFollowUp("PHP 25,000"), true);
  assert.equal(isEverydayFollowUp("Yes"), true);
  const routine = "What is a simple weekly routine for keeping track of several bank accounts, a credit card, and e-wallets?";
  assert.equal(classifyAdviserScope(routine).allowed,true);
  assert.equal(classifyAdviserScope("What is a simple workout routine?").allowed,false);
  assert.equal(classifyEverydayQuestion(routine),null);
  assert.deepEqual(selectAdviserToolNames({question:routine}),[]);
  assert.equal(classifyEverydayQuestion("What credit card can I get?"),"credit_card");
  assert.deepEqual(selectAdviserToolNames({question:"How are my budgets doing?"}),["get_budget_status"]);
  assert(isSpendingSummaryQuestion("Show my PHP spending by category for September 2026. Focus only on expenses, excluding transfers."));
  assert.equal(isSpendingSummaryQuestion("How much did I spend at Starbucks in September?"),false);
  assert.equal(isSpendingSummaryQuestion("Compare food spending this month"),false);
  assert.equal(adviserCurrency("My USD spending",["PHP","USD"]),"USD");
  assert.equal(adviserCurrency("My spending",["USD","PHP"]),"PHP");
  const now = new Date("2026-09-29T04:00:00Z");
  const range=adviserMonthRange("September 2026",now)!;
  assert.equal(range.start.toISOString(),"2026-09-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(),"2026-10-01T00:00:00.000Z");
  assert.equal(adviserMonthRange("last month",new Date("2026-01-15"))!.label,"December 2025");
  assert.equal(commitmentInstallment({kind:"debt",amount:1749000,tracking:{paymentAmount:15000}}),15000);
  assert.equal(commitmentInstallment({kind:"debt",amount:1749000}),0);
  const transactions=[{currency:"PHP",amount:100,date:new Date("2026-09-01")},{currency:"USD",amount:500,date:now},{currency:"PHP",amount:700,date:new Date("2026-08-31")}].map(t=>({...t,accountId:"a",categoryId:"food",type:"expense" as const,isExcluded:false}));
  const budgets=buildBudgetOverview({now,budgets:[{id:"b",name:"Food",kind:"spend_limit",scope:"category",cadence:"monthly",targetAmount:200,currency:"PHP",isActive:true,accountId:null,categoryId:"food"}],transactions}).budgets;
  assert.equal(budgets[0].actualAmount,100);assert.equal(budgets[0].remainingAmount,100);
  const billsReply = upcomingBillsReply({currency:"PHP",horizonDays:14,availableCash:100000,details:{recurring:[],commitments:[{label:"Mortgage installment",amount:15000,due:"2026-10-01"},{label:"Unknown loan",amount:0,due:"2026-10-02"}],plannedPayments:[]}});
  assert.match(billsReply,/Mortgage installment: ₱15,000.00/);
  assert.match(billsReply,/Oct 1/);
  assert.match(billsReply,/Unknown loan: installment amount not recorded/);
  const member={userId:"u",displayName:"Alex Reyes"};
  assert.equal(resolveCircleMemberPhoto(member,[{name:"Alex Reyes",avatarUrl:"shared.jpg"}],new Map([["u","profile.jpg"]])),"profile.jpg");
  assert.equal(resolveCircleMemberPhoto({...member,userId:null},[{name:" Alex Reyes ",avatarUrl:"shared.jpg"}],new Map()),"shared.jpg");
  assert.equal(resolveCircleMemberPhoto(member,[],new Map()),null);
  assert.equal(resolveCircleMemberPhoto(member,[{name:"Alex Reyes",avatarUrl:"a"},{name:"Alex Reyes",avatarUrl:"b"}],new Map()),null);
  const client = {sessions:[{id:"older"},{id:"active"}],lastActiveSessionId:"active"};
  assert.equal(selectExistingClerkSession(client,"")?.id,"active");
  assert.equal(selectExistingClerkSession(client,"older")?.id,"older");
  assert.equal(selectExistingClerkSession(client,"expired")?.id,"active");
  assert.equal(selectExistingClerkSession({sessions:[],lastActiveSessionId:null}),null);
  let calls=0;
  assert.deepEqual(await readAiConsent(async()=>{calls++;return calls===1?new Response(null,{status:503}):Response.json({allowed:true});}),{allowed:true});assert.equal(calls,2);
  calls=0;await assert.rejects(readAiConsent(async()=>{calls++;return new Response(null,{status:401});}),/session/);assert.equal(calls,1);
  await assert.rejects(readAiConsent(async()=>new Response(null,{status:503})),/Unable/);
  assert.deepEqual(await readAiConsent(async()=>Response.json({allowed:false})),{allowed:false});
  await assert.rejects(readAiConsent(async()=>Response.json({allowed:"true"})),/Invalid/);
  console.log("Adviser reliability and Circle photos passed: scope, intent, month/currency boundaries, installments, budget arithmetic, identity matching and fail-closed consent retries.");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
import { spendingRoomOptions, spendingRoomReply } from "../lib/adviser-spending-room";

assert.deepEqual(spendingRoomOptions("How much can I spend on a trip over the next 30 days in PHP, after bills, everyday spending and savings? Keep an extra PHP 5,000 buffer."), {horizonDays:30, additionalBuffer:5000});
assert.deepEqual(spendingRoomOptions("How much can we spend over 2 weeks? Keep an additional ₱5k reserve."), {horizonDays:14, additionalBuffer:5000});
for (const question of [
  "How much can I spend for 100 days?",
  "How much can I spend until October 26?",
  "How much can I spend? I have PHP 50,000 available.",
  "How much can I spend? Include expected income of PHP 40,000.",
  "How much can I spend? Keep an extra USD 5,000 buffer.",
  "How much can I spend? Don't keep an extra PHP 5,000 buffer.",
]) assert.equal(spendingRoomOptions(question), null, question);
const room = {currency:"PHP",horizonDays:30,availableCash:50000,expectedIncome:0,knownObligations:10000,everydaySpendingBuffer:5000,goalContribution:5000,additionalBuffer:5000,safeToSpend:25000,roomAfterProtection:25000,confidence:{label:"medium",score:65},caveats:["Some debt installments are missing."]};
assert.match(spendingRoomReply(room), /Estimated spending room: ₱25,000.00/);
assert.match(spendingRoomReply(room), /Some debt installments are missing/);
assert.match(spendingRoomReply({...room,safeToSpend:0,roomAfterProtection:-1000}), /No spending room.*exceed available cash by ₱1,000.00/);

for (const question of ["How much can I put towards my next trip?", "How much can we set aside for our vacation?", "How much can I realistically allocate toward travel?"]) {
  assert(classifyAdviserScope(question).allowed, question);
  assert.equal(classifyEverydayQuestion(question), null, question);
  assert.deepEqual(selectAdviserToolNames({question}), ["calculate_safe_to_spend"], question);
  assert.deepEqual(spendingRoomOptions(question), {horizonDays:undefined, additionalBuffer:undefined});
}
assert.equal(classifyAdviserScope("How much can I put in my luggage for the trip?").allowed, false);
const tripReply = spendingRoomReply(room, "How much can I put towards my next trip?");
assert.match(tripReply, /estimated ₱25,000.00/);
assert.match(tripReply, /next 30 days/);
assert.match(tripReply, /Some debt installments are missing/);
assert.match(tripReply, /planning ceiling/);
assert.match(spendingRoomReply({...room, safeToSpend:0, roomAfterProtection:-1000}, "How much can I put towards my next trip?"), /hold off.*₱1,000.00/);

assert.doesNotMatch(tripReply, /\*\*/, "The chat displays plain text, so template replies must not include Markdown emphasis markers.");
