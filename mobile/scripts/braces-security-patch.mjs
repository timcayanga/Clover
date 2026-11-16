import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, mobileRoot } from './forge-security-patch.mjs';
export const bracesAdvisory='https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const manifest=JSON.parse(readFileSync(new URL('./braces-security-manifest.json',import.meta.url),'utf8'));
// Local, bounded-recursion mitigation; no upstream fixed release exists as of Oct 3.
// Review with the forge mitigation on Nov 1. Unknown package/source versions fail closed.
export function bracesPaths(root=mobileRoot){
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
 const entries=Object.entries(lock.packages).filter(([p])=>p.endsWith('/braces'));
 if(!entries.length)throw new Error('Expected braces dependency; review mitigation');
 for(const [p,v] of entries){
  if(!p.startsWith('node_modules/')||p.includes('..')||v.version!=='3.0.3')throw new Error('Unexpected braces version/path');
  if(JSON.parse(readFileSync(join(root,p,'package.json'),'utf8')).version!==v.version)throw new Error('Unexpected installed braces version');
 }
 return entries.map(([p])=>p);
}
export function verifyBracesPatch(root=mobileRoot){
 const paths=bracesPaths(root);
 for(const p of paths)for(const [file,m] of Object.entries(manifest))if(hash(readFileSync(join(root,p,'lib',file)))!==m.patched)throw new Error(`Unpatched/changed braces: ${p}/${file}`);
 return paths;
}
export function applyBracesPatch(root=mobileRoot){
 for(const p of bracesPaths(root))for(const [file,m] of Object.entries(manifest)){
  const path=join(root,p,'lib',file);let source=readFileSync(path,'utf8');if(hash(source)===m.patched)continue;
  if(hash(source)!==m.original)throw new Error(`Unknown braces source: ${path}`);
  for(const [a,b] of m.replacements)source=source.split(a).join(b);
  if(hash(source)!==m.patched)throw new Error('Braces patch hash mismatch');writeFileSync(path,source);
 }
 verifyBracesPatch(root);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))applyBracesPatch();
