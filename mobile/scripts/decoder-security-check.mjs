import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {mobileRoot} from './forge-security-patch.mjs';
const require=createRequire(import.meta.url);
const lock=JSON.parse(readFileSync(join(mobileRoot,'package-lock.json'),'utf8'));
const decoders=Object.entries(lock.packages).filter(([p])=>p.endsWith('/decode-uri-component'));
const consumers = Object.keys(lock.packages).filter(p => p.endsWith('/query-string'));
assert.equal(Boolean(decoders.length), Boolean(consumers.length), 'Legacy parser and decoder must migrate together');
for(const [p,e] of decoders){
 assert.equal(e.version,'0.5.1');
 assert.equal(JSON.parse(readFileSync(join(mobileRoot,p,'package.json'))).version,'0.5.1');
 const module=require(join(mobileRoot,p));const decode=module.default||module;
 for(const [input,expected] of [['BPI%20Personal','BPI Personal'],['%F0%9F%8D%80','🍀'],['%E2%82%B1','₱'],['%zz','%zz']])assert.equal(decode(input),expected);
 // The advisory's distinct encoded runs must finish inside a bounded process.
 const code=`const m=require(${JSON.stringify(join(mobileRoot,p))});const decode=m.default||m;let payload='';for(let i=0;i<32000;i++)payload+='%'+Math.floor(i/256).toString(16).padStart(2,'0')+'%'+(i%256).toString(16).padStart(2,'0')+'x';payload+='%zz';if(typeof decode(payload)!=='string')process.exit(1);`;
 execFileSync(process.execPath,['-e',code],{timeout:5000,stdio:'pipe'});
}
if (!consumers.length) {
 const { stringifySearchParams } = require('expo-router/build/utils/queryParams');
 const { parseUrlUsingCustomBase } = require('expo-router/build/utils/url');
 const sample = { account: 'BPI Personal 1234', name: 'Japan Trip 🍀', currency: 'PHP', callback: 'clover://payment-request/bill?x=1&y=2' };
 assert.deepEqual(Object.fromEntries(parseUrlUsingCustomBase(`/transactions?${stringifySearchParams(sample)}`).searchParams), sample);
 const parsed = parseUrlUsingCustomBase('/transactions?name=Caf%C3%A9+Lunch&account=BPI&account=Maya&bad=%zz').searchParams;
 assert.equal(parsed.get('name'), 'Café Lunch');
 assert.equal(parsed.get('bad'), '%zz');
 assert.deepEqual(parsed.getAll('account'), ['BPI', 'Maya']);
 const code = `const {parseUrlUsingCustomBase}=require('expo-router/build/utils/url');let payload='';for(let i=0;i<32000;i++)payload+='%'+Math.floor(i/256).toString(16).padStart(2,'0')+'%'+(i%256).toString(16).padStart(2,'0')+'x';payload+='%zz';if(typeof parseUrlUsingCustomBase('/transactions?name='+payload).searchParams.get('name')!=='string')process.exit(1);`;
 execFileSync(process.execPath, ['-e', code], { cwd: mobileRoot, timeout: 5000, stdio: 'pipe' });
 console.log('PASS Expo Router URLSearchParams: Unicode, malformed-run workload, arrays and Clover callback round-trip');
} else {
const query=require('query-string');
const sample={account:'BPI Personal 1234',name:'Japan Trip 🍀',currency:'PHP',amount:'1200',callback:'clover://payment-request/bill?x=1&y=2'};
assert.deepEqual({...query.parse(query.stringify(sample))},sample);
assert.equal(query.parse('name=Caf%C3%A9+Lunch').name,'Café Lunch');
assert.equal(query.parse('name=%zz').name,'%zz');
assert.deepEqual(query.parse('account=BPI&account=Maya').account,['BPI','Maya']);
assert.equal(query.parseUrl('clover://transactions?currency=PHP&name=BPI%20Personal').query.name,'BPI Personal');
console.log('PASS official decoder 0.5.1: malformed-run workload, Unicode, query arrays, round-trip and Clover callback URLs through query-string');

}
