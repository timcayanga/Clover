import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../app/transactions/page.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map<string, ts.VariableDeclaration>();
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node);
  ts.forEachChild(node, visit);
}
visit(ast);
// Execute actual production declarations in render order, catching the category
// helper's initialization failure rather than testing a copied sorting algorithm.
function evaluate(names: string[], context: Record<string, unknown>, result: string) {
  const nodes = names.map(name => { const node = declarations.get(name); assert.ok(node, name); return node; }).sort((a,b) => a.pos-b.pos);
  const code = nodes.map(node => `const ${node.getText(ast)};`).join('\n') + `\nresult = (${result});`;
  const sandbox = { ...context, result: undefined };
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return sandbox.result;
}
const context = {
  useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
  transactions: [{id:'z', categoryName:'Travel'}, {id:'a', categoryName:'Food'}],
  matchesTransactionSearch: () => true, matchesTransactionFilters: () => true, hasTransactionUserEdits: () => true,
  categories: [], otherCategoryId: 'other', accountInstitutionById: new Map(), accountNameById: new Map(), accountNumberById: new Map(), categoryNameById: new Map(),
  searchText:'', currencyFilter:'', categoryFilters:[], tagFilters:[], expandedAccountFilters:[], typeFilters:[], dateFilterMode:'ltd', dateFilterAnchor:'2026-09-08', customStart:'', customEnd:'', amountMin:'', amountMax:'', reviewFilter:'', sourceFilter:'', confidenceFilter:'', sortField:'category',
};
for (const [sortDirection, expected] of [['asc','a,z'], ['desc','z,a']]) {
  assert.equal(evaluate(['getDisplayCategoryNameForTransaction','visibleTransactions'], {...context,sortDirection}, 'visibleTransactions.map(row=>row.id).join(",")'), expected);
}
const currency = {formatCurrencyCode: (value: string) => value.trim().toUpperCase()};
assert.equal(evaluate(['getCurrencyCodes','getWorkspaceCurrencyCodes'], currency, 'getWorkspaceCurrencyCodes([]).length'), 0);
assert.equal(evaluate(['getCurrencyCodes','getWorkspaceCurrencyCodes'], currency, 'getWorkspaceCurrencyCodes([{currency:"PHP"},{currency:"PHP"},{currency:"USD"}]).join(",")'), 'PHP,USD');
assert.equal(evaluate(['nextCurrencyCodes'], {payload:{currencyCodes:[]},responseCurrencyCodes:[],workspaceCurrencyCodesFromData:['USD']}, 'nextCurrencyCodes.length'), 0, 'Authoritative empty currencies replace stale cache');
for (const total of [0,1,12,24,25,26,50,51,201]) {
  let loaded=Math.min(25,total), shown=Math.min(12,loaded), iterations=0;
  const canLoad=(exhausted=loaded>=total, searchText='') => evaluate(['hasMoreMobileTransactions'], {isCompactViewport:true,mobilePaginationExhausted:exhausted,searchText,mobileVisibleTransactions:{length:shown},visibleTransactions:{length:loaded},transactions:{length:loaded},transactionsSummary:{totalCount:total}}, 'hasMoreMobileTransactions');
  while(canLoad()) {
    assert.ok(++iterations<100,'Loading must stop');
    if(shown<loaded) shown=Math.min(loaded,shown+12);
    else {loaded=Math.min(total,loaded+25);shown=Math.min(loaded,shown+25);}
  }
  assert.equal(shown,total,`All ${total} rows remain reachable`);
  assert.equal(canLoad(true),false);
  if(total>12) {
    shown=12;
    assert.equal(canLoad(true),true,'Exhausted server must not hide fetched rows');
    assert.equal(canLoad(true,'search'),true,'Fetched search rows remain reachable');
    shown=loaded; assert.equal(canLoad(true),false,'Empty/duplicate pages do not loop after local rows are displayed');
  }
}
const formatter={transactionEstimateLoading:false,transactionEstimateUnavailable:false,isAllCurrenciesView:false,transactionSummaryCurrencies:[],visibleTransactions:[],formatTransactionAggregate:(value:number)=>`PHP ${value}`};
assert.equal(evaluate(['formatTransactionSummary'],{...formatter,transactionsLoadFailed:true},'formatTransactionSummary(0)'), 'Unavailable');
assert.equal(evaluate(['formatTransactionSummary'],{...formatter,transactionsLoadFailed:false},'formatTransactionSummary(0)'), 'PHP 0');
const detail=fs.readFileSync(new URL('../app/transactions/[transactionId]/page.tsx',import.meta.url),'utf8');
assert.match(detail,/<label htmlFor="transaction-detail-amount" data-transaction-detail-field="amount">/);
assert.match(detail,/<input\s+id="transaction-detail-amount"\s+type="number"\s+aria-label="Amount"/);
assert.equal((detail.match(/id="transaction-detail-amount"/g)??[]).length,1);
console.log('UI defects regression passed: category sort both directions, authoritative currencies, nine mobile sizes, exhaustion/search boundaries, failed/recovered totals, amount label association.');
