const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const jsx = require('react/jsx-runtime');
const { renderToStaticMarkup } = require('react-dom/server');
const file = fs.readFileSync(path.join(__dirname,'../app/transactions/page.tsx'),'utf8');
const ast = ts.createSourceFile('page.tsx',file,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler, panel;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'applyBulkEdit') handler = node.initializer.getText(ast);
  if (ts.isConditionalExpression(node) && node.condition.getText(ast) === 'bulkEditOpen') panel = node.whenTrue.getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast); assert(handler && panel);
function evaluate(expression, context) {
  const js = ts.transpileModule('exports.value = '+expression, { compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX} }).outputText;
  const exports = {};
  vm.runInNewContext(js,{...context,exports,require: name => { assert.equal(name,'react/jsx-runtime'); return jsx; }});
  return exports.value;
}
const empty = () => {};
const base = {accountId:'',categoryId:'',type:'',tags:[],tagAction:''};
const selected = [{id:'a',tags:['Existing'],accountName:'Bank',categoryName:'Food'}, {id:'b',tags:['Private'],accountName:'Cash',categoryName:'Other'}];
async function run(form, failSecond=false) {
  const calls=[], patches=[], messages=[];
  const snapshot=JSON.stringify(selected);
  const fn=evaluate(handler,{
    selectedTransactionIds:['a','b'],transactions:selected,bulkEditForm:form,
    selectedWorkspaceId:'profile-a',selectedRowsRef:{current:{workspaceId:'profile-a',rows:new Map()}},accounts:[],categories:[],
    formatTransactionAccountName:empty,setIsSaving:empty,applyTransactionPatchesLocally:p=>patches.push(p),setBulkEditOpen:empty,clearSelection:empty,setUndoStack:empty,setRedoStack:empty,
    setMessage:m=>messages.push(m),refreshTransactionsSummary:empty,capturePostHogClientEvent:empty,
    updateTransaction:async(id,payload)=>{calls.push({id,payload});if(failSecond && id==='b') throw Error('Retry later');},
  });
  await fn({preventDefault:empty});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(selected),snapshot,'Bulk editing never mutates cached source records');
  return {calls,patches,messages};
}
(async()=>{
  let result=await run({...base,categoryId:'food'});
  assert.equal(result.calls.length,2);
  for(const {payload} of result.calls) { assert.equal(payload.categoryId,'food'); assert(!('tags' in payload));assert(!('tagAction' in payload),'Unchanged tags must be omitted rather than replaced'); }
  for(const tagAction of ['add','remove']) {
    result=await run({...base,tags:['Trip'],tagAction});
    for(const {payload} of result.calls) { assert.equal(payload.tagAction,tagAction);assert.equal(JSON.stringify(payload.tags),'["Trip"]'); }
  }
  result=await run({...base,tagAction:'remove'});assert.equal(result.calls.length,0);assert.match(result.messages[0],/Choose at least one tag/);
  result=await run({...base,tags:['Trip'],tagAction:'add'},true);assert.match(result.messages.at(-1),/1 of 2/);assert.equal(result.patches.at(-1)[0].transactionId,'b','Failed edits restore only the failed original');
  const context={bulkEditDialogRef:{},isSaving:false,tableLocked:false,selectedTransactionIds:['a','b'],bulkEditForm:{...base,tags:['Trip'],tagAction:'add'},categories:[],selectableTransactionAccounts:[],setBulkEditOpen:empty,setBulkEditForm:empty,applyBulkEdit:empty,MobileSheetHandle:()=>null,TransactionTagsEditor:()=>React.createElement('input',{'aria-label':'Tags'})};
  const html=renderToStaticMarkup(evaluate(panel,context));
  for(const label of ['Category','Account','Type','Tags','Tag action']) assert(html.includes(label));
  assert(!html.includes('>Debit<') && !html.includes('>Credit<'));
  assert(html.includes('Add tags') && html.includes('Remove tags'));
  console.log('PASS actual web bulk editor: rendered tag controls; unchanged tags omitted; add/remove delegation; missing-tag validation; partial failure restoration without cached-record mutation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
