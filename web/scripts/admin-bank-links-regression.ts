import assert from 'node:assert/strict';
import { summarizeBankLinks } from '../lib/admin-bank-link-metrics';
const summary = summarizeBankLinks([
  { userId: 'a', bankId: 'bpi', bankName: 'BPI', count: 2 },
  { userId: 'a', bankId: 'bpi', bankName: 'BPI', count: 1 },
  { userId: 'b', bankId: 'bpi', bankName: 'BPI', count: 1 },
  { userId: 'a', bankId: 'bdo', bankName: 'BDO', count: 2 },
  { userId: 'c', bankId: 'bdo', bankName: 'BDO', count: 0 },
]);
assert.equal(summary.totalAccounts, 6);
assert.equal(summary.totalUsers, 2);
assert.deepEqual(summary.banks, [
  { id: 'bpi', name: 'BPI', accountCount: 4, userCount: 2 },
  { id: 'bdo', name: 'BDO', accountCount: 2, userCount: 1 },
]);
assert.deepEqual(summarizeBankLinks([]), {totalAccounts:0,totalUsers:0,banks:[]});
assert.equal(summarizeBankLinks([{userId:'a',bankId:'a',bankName:'A',count:-1}]).totalAccounts,0);
console.log('Admin linked-bank totals: multiple users, banks, Profiles and empty inventory passed.');
