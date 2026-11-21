import assert from 'node:assert/strict';
import { buildAdviserSavingsAnswer as answer } from '../lib/adviser-savings-plan';
import { parseAdviserChart } from '../../shared/adviser-chart';
import { adviserHistoryInput } from '../lib/adviser-history';
const q='Can I put ₱10,000 a month towards Japan? I earn ₱80,000 and plan ₱50,000 for bills and everyday spending. I need ₱60,000 in six months.';
const a=answer(q,'PHP')!;assert.ok(a);const p=a.visualization.savingsPlan!;
assert.equal(p.monthlyContribution,10000);assert.equal(p.monthlyBuffer,20000);assert.equal(p.points.at(-1)?.amount,60000);assert.equal(a.visualization.title,'Japan savings plan');assert.ok(parseAdviserChart(a.visualization));
const saved=adviserHistoryInput.parse({id:'c0f1943a-0123-4567-8123-0123456789ab',revision:0,messages:[{role:'user',content:q},{role:'assistant',content:a.reply,visualization:a.visualization}]});assert.deepEqual(saved.messages[1].visualization?.savingsPlan,p);
const missing=answer('Help me save PHP 60000 for Japan in six months.','PHP')!;assert.equal(missing.visualization.savingsPlan?.monthlyBuffer,null);assert.match(missing.reply,/Tell me your monthly income/);
const deficit=answer('Help me save PHP 60000 in 6 months. I earn PHP 20000 and spend PHP 15000.','PHP')!;assert.equal(deficit.visualization.savingsPlan?.monthlyBuffer,-5000);assert.match(deficit.reply,/shortfall/);
const partial=answer('Help me save PHP 100000 in 3 months. I already saved PHP 20000.','PHP')!;assert.equal(partial.visualization.savingsPlan?.monthlyContribution,26666.67);assert.equal(partial.visualization.savingsPlan?.points.at(-1)?.amount,100000);
const long=answer('Help me save SGD 120000 in 24 months.','SGD')!;assert.ok(long.visualization.bars.length<=8);assert.equal(long.visualization.savingsPlan?.points.at(-1)?.month,24);assert.ok(parseAdviserChart(long.visualization));
for(const question of ['Save PHP 1000 a month for 6 months.','Create a goal for PHP 60000 in 6 months.','Help me save PHP 60000 in 6 months. I earn USD 3000.','Help me save $60000 in 6 months.','Help me save PHP 60000 in 0 months.']) assert.equal(answer(question,'PHP'),null,question);
for(const patch of [{monthlyContribution:1},{monthlyBuffer:90000},{points:[{month:6,amount:999999}]},{monthlyIncome:Infinity},{confidence:{label:'high',score:101}}])assert.equal(parseAdviserChart({...a.visualization,savingsPlan:{...p,...patch}}),null);
console.log('Savings projections: target math, budget deficit, partial savings, currencies, checkpoints, validation and saved history passed.');

const yen=answer('Help me save JPY 100000 in 6 months.','JPY')!;assert.equal(yen.visualization.savingsPlan?.monthlyContribution,16667);assert.ok(parseAdviserChart(yen.visualization));

assert.equal(parseAdviserChart({...a.visualization,currency:'123'}),null);
