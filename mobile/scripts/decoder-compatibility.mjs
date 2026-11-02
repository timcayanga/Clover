// Expo Router's query-string 7 consumer needs the official decoder's ESM default.
// This is an import-shape adapter only; the published decoder remains unchanged.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {hash,mobileRoot} from './forge-security-patch.mjs';
const m=JSON.parse(readFileSync(new URL('./decoder-compatibility.json',import.meta.url)));
const lock=JSON.parse(readFileSync(join(mobileRoot,'package-lock.json'),'utf8'));
const consumers=Object.entries(lock.packages).filter(([p])=>p.endsWith('/query-string'));
if(!consumers.length)throw Error('Expected Expo Router query-string consumer');
for(const [p,e] of consumers){
 if(e.version!==m.version)throw Error('Review query-string compatibility before changing versions');
 const file=join(mobileRoot,p,'index.js'),s=readFileSync(file,'utf8');
 if(hash(s)===m.patchedHash)continue;
 if(process.argv.includes('--verify')||hash(s)!==m.originalHash)throw Error('Missing or modified decoder import compatibility adapter');
 const next=s.replace(m.old,m.new);if(hash(next)!==m.patchedHash)throw Error('Unexpected decoder import adapter output');
 writeFileSync(file,next);
}
console.log('PASS published decoder ESM/CommonJS import compatibility for Expo Router');
