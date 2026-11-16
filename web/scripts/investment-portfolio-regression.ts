import assert from 'node:assert/strict';
import { projectPortfolio, recordedNumber, recordedPortfolioSeries, type PortfolioAccount, type PortfolioSnapshot } from '../../shared/investment-portfolio';
const base:PortfolioAccount={id:'institution',name:'Broker',institution:'Broker',type:'investment',currency:'PHP',balance:'1500'};
const individual={...base,id:'asset',name:'Fund',investmentSymbol:'FUND',balance:'1000'};
const foreign={...individual,id:'usd',currency:'USD',balance:'20'};
const snapshot:PortfolioSnapshot={id:'statement',accountId:base.id,institution:'Broker',date:'2026-08-01',currency:'PHP',totalValue:'1500',holdings:[{id:'holding',name:'Fund',symbol:'FUND',subtype:'mutual_fund',currency:'PHP',quantity:'10',value:'1000',cost:'900'},{id:'unknown',name:'Unvalued Fund',symbol:null,subtype:null,currency:'PHP',quantity:null,value:null,cost:null}]};
const before=JSON.stringify([base,individual,foreign,snapshot]);
const rows=projectPortfolio([base,individual,foreign],[{...snapshot,id:'old',date:'2026-07-01',holdings:[{...snapshot.holdings[0],value:'800'}]},snapshot]);
assert.equal(rows.length,3,'Institution aggregate and linked asset must not be counted twice; unvalued holding must remain visible');
assert.equal(rows.find(r=>r.id==='holding')?.value,'1000','Use valuation date, not caller ordering');
assert.equal(rows.find(r=>r.id==='holding')?.accountId,'asset');
assert.equal(rows.find(r=>r.id==='holding')?.valuationAccountId,'institution','History must retain the actual valuation source');
assert.equal(rows.find(r=>r.id==='usd')?.value,'20','Never merge same-symbol holdings across currencies');
assert.equal(rows.find(r=>r.id==='unknown')?.value,null);
assert.equal(JSON.stringify([base,individual,foreign,snapshot]),before,'Projection must never edit records');
assert.equal(recordedNumber('0'),0);assert.equal(recordedNumber(''),null);assert.equal(recordedNumber('NaN'),null);
assert.deepEqual(recordedPortfolioSeries([
 {accountId:'a',date:'2026-08-02',currency:'PHP',value:120},
 {accountId:'a',date:'2026-08-01',currency:'PHP',value:100},
 {accountId:'a',date:'2026-08-01T12:00:00Z',currency:'PHP',value:110},
 {accountId:'b',date:'2026-08-02',currency:'PHP',value:0},
 {accountId:'private',date:'2026-08-01',currency:'PHP',value:900},
 {accountId:'a',date:'2026-08-01',currency:'USD',value:999},
 {accountId:'a',date:'invalid',currency:'PHP',value:999},
], 'PHP',['a','b']),[{date:'2026-08-01',value:110,accounts:1},{date:'2026-08-02',value:120,accounts:2}]);
console.log('Investment portfolio projection and recorded valuation regressions passed.');
