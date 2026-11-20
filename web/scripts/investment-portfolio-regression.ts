import assert from 'node:assert/strict';
import { portfolioInstitutions, portfolioAssetGroups, holdingBalanceChange, projectPortfolio, recordedNumber, recordedPortfolioSeries, type PortfolioAccount, type PortfolioSnapshot } from '../../shared/investment-portfolio';
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

const btc = { ...rows[0], subtype: "crypto", symbol: "BTC", name: "Bitcoin SegWit", value: "130", startingValue: "100" };
const bitcoinGroups = portfolioAssetGroups([btc, { ...btc, id: "wallet2", name: "Bitcoin", value: "0", startingValue: "0" }, { ...btc, currency: "USD" }]);
assert.equal(bitcoinGroups.length, 2);
assert.equal(bitcoinGroups[0].members.length, 2);
assert.equal(bitcoinGroups[0].holding.name, "Bitcoin");
assert.equal(holdingBalanceChange(bitcoinGroups[0].holding), 30);
assert.equal(holdingBalanceChange({ ...btc, value: "87.8" }), -12);
assert.equal(holdingBalanceChange({ ...btc, startingValue: null }), null);
assert.equal(holdingBalanceChange({ ...btc, startingValue: "0" }), null);
assert.equal(rows.find(r=>r.id==="holding")?.startingValue, "800");

const xrp = { ...btc, symbol: "XRP", name: "XRP", value: "8264.90" };
const [xrpGroup] = portfolioAssetGroups([xrp, { ...xrp, id: "second", value: "0", startingValue: null }]);
assert.equal(xrpGroup.members.length, 2);
assert.equal(Number(xrpGroup.holding.value), 8264.90);
assert.equal(holdingBalanceChange(xrpGroup.holding), null);
assert.equal(projectPortfolio([base], [snapshot], false)[0].startingValue, null);

const pdax = { ...btc, institution: "PDAX", institutionLogoUrl: "/assets/banks/philippines/pdax.png" };
const [phpInstitution, usdInstitution] = portfolioInstitutions([
  pdax, { ...pdax, id: "another", institution: " pdax ", startingValue: "300", value: "310" }, { ...pdax, currency: "USD" },
]);
assert.equal(phpInstitution.count, 2);
assert.equal(phpInstitution.row.logoUrl, pdax.institutionLogoUrl);
assert.equal(holdingBalanceChange(phpInstitution.row), 10);
assert.equal(usdInstitution.count, 1);
for (const incomplete of [{ startingValue: null }, { value: null }]) {
  assert.equal(holdingBalanceChange(portfolioInstitutions([pdax, { ...pdax, ...incomplete }])[0].row), null);
}
assert.equal(holdingBalanceChange(portfolioInstitutions([{ ...pdax, startingValue: "0" }])[0].row), null);

const statementHolding = { ...pdax, valuationAccountId: "statement-account", date: "2026-08-01", startingValue: null };
const statementHistory = [{accountId: "statement-account", currency: "PHP", date: "2026-06-01", value: 100}];
assert.equal(holdingBalanceChange(portfolioInstitutions([statementHolding], statementHistory)[0].row), 30);
assert.equal(holdingBalanceChange(portfolioInstitutions([statementHolding], [{...statementHistory[0], currency: "USD"}])[0].row), null);
