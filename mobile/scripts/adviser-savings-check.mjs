import { money } from '../src/financial-format.ts';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {parseAdviserSavingsPlan} from '../../shared/adviser-savings-plan.ts';
// Native component contract checks. OS engine validation remains a separate bundle/device check.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=fs.readFileSync(root+'/mobile/src/adviser-savings-card.tsx','utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const colors=['#03a8c0','#62b991','#e6b953','#ef9c70','#799ed6','#af88ca','#5ed3d0','#719b8f'];
const jsx=(type,props)=>({type,props});const walk=t=>Array.isArray(t)?t.flatMap(walk):!t||typeof t!=='object'?[]:[t,...walk(t.props?.children)];
const text=t=>Array.isArray(t)?t.map(text).join(' '):t&&typeof t==='object'?text(t.props?.children):t==null?'':String(t);
const result=[];
for(const platform of ['ios','android'])for(const dark of [false,true])for(const fixture of JSON.parse(fs.readFileSync(new URL('./fixtures/adviser-savings.json',import.meta.url),'utf8'))){
 assert(parseAdviserSavingsPlan(fixture.chart.savingsPlan),'Fixture must satisfy the native shared contract');
 const exports={};const deps={'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Platform:{OS:platform}},'react-native-svg':{__esModule:true,default:'Svg',Rect:'Rect',Line:'Line',G:'G',Text:'SvgText'},'./app-text':{Text:'Text'},'./ui':{money:money,useTheme:()=>({colors:{ink:dark?'#fff':'#202b37',teal:'#00acc0',muted:'#687386',line:'#d4e0e8'}})},'../../shared/adviser-savings-plan':{savingsColors:colors}};
 vm.runInNewContext(compile(source),{exports,require:n=>{assert(n in deps,n);return deps[n]},Intl,Math,String});
 const tree=exports.AdviserSavingsCard({chart:fixture.chart}),nodes=walk(tree),p=fixture.chart.savingsPlan;
 assert.equal(nodes.filter(n=>n.type==='Rect').length,p.points.length);
 for(const n of nodes.filter(n=>n.type==='Rect')){const r=n.props;assert(Number.isFinite(r.height)&&r.height>=0&&r.y>=0&&r.x>=0&&r.x+r.width<=360);assert(colors.includes(r.fill));assert(Math.abs(r.y+r.height-197)<.001)}
 const svg=nodes.find(n=>n.type==='Svg');assert.equal(svg.props.width,'100%');assert.equal(svg.props.accessibilityRole,'image');assert(svg.props.accessibilityLabel.includes(String(p.target)));
 for(const point of p.points)assert(svg.props.accessibilityLabel.includes(`Month ${point.month}:`),'Each checkpoint must be available to VoiceOver/TalkBack');
 const monthLabels=nodes.filter(n=>n.type==='SvgText').filter((_,i)=>i%2===1);
 if(p.points.length>6)assert(monthLabels.every(n=>/^M[0-9]+$/.test(text(n))),'Long timelines need compact axis labels on phones');
 assert(text(tree).includes(money(String(p.monthlyContribution),fixture.chart.currency)));
 assert.equal(nodes.filter(n=>n.type==='SvgText').length,p.points.length*2);
 assert(!nodes.some(n=>['Pressable','Button'].includes(n.type)),'Projection must not silently create a goal or move money');
 if(fixture.id==='shortfall')assert(text(tree).includes('monthly shortfall'));
 if(fixture.id==='yen')assert(!money(String(p.monthlyContribution),'JPY').includes('.00'));
 result.push({platform,dark,fixture:fixture.id,bars:p.points.length,monthly:p.monthlyContribution,result:'pass'});
}
console.log('PASS 20 native component cases: iOS/Android, light/dark, PHP/JPY/SGD, existing savings, shortfall, bar bounds and accessibility. Component props rendered in a test harness; not a substitute for an OS/device run.');
