import assert from 'node:assert/strict';
import { deriveReconciledBalance, normalizeAccountBalanceSign } from '../lib/account-balance';
import { projectPagedAccountBalance, type AccountBalanceAnchor } from '../lib/paged-account-balance';
const rows=Array.from({length:858},(_,i)=>({id:String(i),amount:i<172?'100':'10',type:i<172?'income':'expense',isExcluded:false}));
const total=deriveReconciledBalance({balance:'10000',transactions:rows,treatStoredBalanceAsOpening:true})!;
assert.equal(total,'20340.00');
for(let count=25;count<rows.length;count+=25){
  const page=rows.slice(0,count),anchor={accountId:'bank',balance:total,openingBalance:'10000',rows:page};
  assert.equal(projectPagedAccountBalance(anchor,'10000',page),total,'Reading another page cannot change the full balance');
}
const page=[rows[0],rows[200]],anchor:AccountBalanceAnchor<typeof rows[number]>={accountId:'bank',balance:total,openingBalance:'10000',rows:page};
assert.equal(projectPagedAccountBalance(anchor,'10000',[{...page[0],amount:'150'},page[1]]),'20390.00','Visible income edit adjusts complete balance');
assert.equal(projectPagedAccountBalance(anchor,'10000',[page[0]]),'20350.00','Deleting expense restores money');
assert.equal(projectPagedAccountBalance(anchor,'10000',[page[0],{...page[1],isExcluded:true}]),'20350.00','Excluded expense stops affecting balance');
assert.equal(projectPagedAccountBalance(anchor,'10000',[...page,{id:'new',amount:'25',type:'expense',isExcluded:false}]),'20315.00','New expense adjusts complete balance');
assert.equal(projectPagedAccountBalance(anchor,'10100',page),'20440.00','Stored opening-balance edit remains effective');
const next=rows.slice(201,226),extended={...anchor,rows:[...page,...next]};
assert.equal(projectPagedAccountBalance(extended,'10000',[{...page[0],amount:'150'},page[1],...next]),'20390.00','Pagination preserves earlier edits without counting newly loaded rows twice');
assert.equal(normalizeAccountBalanceSign('credit_card',Number(projectPagedAccountBalance(anchor,'10000',page))),-20340);
assert.equal(anchor.balance,total);assert.equal(page[0].amount,'100');
console.log('Paged account balance regression passed: full858row ledger, pagination, edits, deletes, exclusions, new rows, opening edits and liability signs.');
