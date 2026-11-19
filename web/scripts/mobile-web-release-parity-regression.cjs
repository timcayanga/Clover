const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const jsx = require('react/jsx-runtime');
const postcss = require('postcss');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const hooks = { useState: v => [typeof v === 'function' ? v() : v, () => {}], useMemo: fn => fn() };
const empty = () => null;
const Calendar = () => React.createElement('section', { className: 'recurring-calendar' }, 'Payment calendar');
function load(file, dependencies) {
  const exports = {};
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, require: name => {
    if (name === 'react') return hooks;
    if (name === 'react/jsx-runtime') return jsx;
    assert(name in dependencies, `Declare the rendered fixture dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const shared = {
  '@/components/clover-mascot': { CloverMascot: empty },
  '@/components/category-brand-mark': { CategoryBrandMark: empty },
  '@/components/mobile-swipe-delete': { MobileSwipeDelete: ({ children }) => React.createElement('div', null, children) },
};
const { RecurringDashboard } = load('components/recurring-dashboard.tsx', {
  ...shared,
  '@/lib/recurring-dashboard-summary': { recurringDashboardSummary: () => [['Due this month', 'PHP 100']] },
  '@/lib/commitments': { commitmentRecurrenceLabels: {}, commitmentStatusLabels: {} },
  '@/lib/recurring-calendar': { buildRecurringCalendarOccurrences: () => [], toRecurringCalendarDateKey: () => '2026-11-19' },
  '@/lib/recurring-tracking': {}, '@/lib/currency-format': {},
  '@/components/recurring-calendar': { RecurringCalendar: Calendar },
});
const recurring = RecurringDashboard({ items: [], tab: 'overview', reviewCount: 1, review: React.createElement('p', null, 'Review suggestions'), onOpen: empty, onAdd: empty, onDelete: empty });
const overview = nodes(recurring, n => n.props?.className === 'recurring-redesign__overview')[0];
assert.equal(overview.props.children[0].type, Calendar);
assert.equal(overview.props.children[1].props['aria-label'], 'Recurring summary');
assert.equal(overview.props.children[2].props.className, 'recurring-redesign__review');
const html = renderToStaticMarkup(recurring);
assert(html.indexOf('Payment calendar') < html.indexOf('Due this month'));
assert(html.indexOf('Due this month') < html.indexOf('Review suggestions'));

const { SplitBillHome } = load('components/split-bill-home.tsx', {
  ...shared,
  '../../shared/split-bill-experience': { suggestBillCategory: () => ({ name: 'Food & Dining' }) },
  '@/components/interface-icon': { InterfaceIcon: empty },
  '@/lib/split-bill-balance-summary': { splitBillBalanceSummary: () => ({ youOwe: 'PHP 0', owedToYou: 'PHP 0' }), isSameSplitBillPerson: (a,b) => a.toLowerCase() === b.toLowerCase() },
  '@clerk/nextjs': { useUser: () => ({ user: { fullName: 'Alex Reyes', firstName: 'Alex', imageUrl: '/qa-self.png' } }) },
  '@/components/split-bill-action-buttons': { SplitBillActionButtons: empty },
  '@/components/split-bill-qr-library': { SplitBillQrLibrary: empty },
  '@/lib/account-identity-cache': { readAccountIdentityCache: () => null },
  '@/lib/split-bill': { formatSplitBillAmount: (a,c) => `${c} ${a}`, formatSplitBillSettlementStatus: s => s === 'open' ? 'Open' : s, normalizeCurrencyCode: s => s },
  '@/components/split-bill-entity-avatar': { SplitBillEntityAvatar: ({ name, avatarUrl }) => React.createElement('span', { 'data-avatar-name': name, 'data-avatar-photo': avatarUrl }) },
});
const bill = { id: 'bill', title: 'Fixture lunch', billDate: '2026-11-19', currency: 'PHP', total: '120', resolved: false, settlementStatus: 'open', settlement: { transfers: [] }, payments: [], items: [], participants: ['You','Bea','Nico','Lara','Sam','Other'].map(name => ({ id: name, name })) };
const before = JSON.stringify(bill);
let opened;
const tree = SplitBillHome({ tab: 'Bills', bills: [bill], groups: [], people: [{ name: 'Bea', avatarUrl: '/qa-bea.png' }], currentUserName: 'Alex', onOpenBill: id => opened = id, onOpenGroup: empty, onOpenPerson: empty, onDeleteBill: empty, onDeleteGroup: empty, onDeletePerson: empty });
const row = nodes(tree, n => n.props?.className === 'split-bill-swipe-row')[0];
const context = nodes(row, n => n.props?.className === 'split-bill-mobile-context')[0];
const stack = nodes(context, n => n.props?.className === 'split-bill-avatar-stack')[0];
assert.equal(stack.props.children.length, 5);
assert.equal(stack.props.children[0].props.name, 'Alex Reyes');
assert.equal(stack.props.children[0].props.avatarUrl, '/qa-self.png');
assert.equal(stack.props.children[1].props.avatarUrl, '/qa-bea.png');
assert.equal(stack.props.children[2].props.name, 'Nico', 'Initial fallback retains the person name');
assert.match(stack.props['aria-label'], /Alex Reyes, Bea, Nico, Lara, Sam, Other/);
const rowHtml = renderToStaticMarkup(row);
assert(!rowHtml.includes('>Open<') && !rowHtml.includes('You, Bea'));
assert.match(rowHtml, /Nov 19, 2026/);
row.props.onClick(); assert.equal(opened, 'bill');
assert.equal(JSON.stringify(bill), before, 'Presentation never rewrites participants, money or source records');

const css = postcss.parse(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'));
css.walkRules(rule => {
  if (!rule.selector.includes('.clover-tabs.clover-tabs:is(.recurring-tabs--mobile, .investments-tabs--mobile)') && !rule.selector.includes('.clover-tabs.clover-tabs.recurring-tabs--mobile .recurring-tab-label')) return;
  rule.walkDecls(decl => assert(!['row wrap','auto','normal'].includes(decl.value) || !['flex-flow','height','white-space'].includes(decl.prop), 'Do not restore higher-specificity wrapping/auto-height mobile tab overrides'));
});
function declarations(selector, width) {
  const result = {};
  css.walkRules(rule => {
    if (!postcss.list.comma(rule.selector).includes(selector)) return;
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type !== 'atrule' || parent.name !== 'media') continue;
      const max = /max-width:\s*(\d+)px/.exec(parent.params), min = /min-width:\s*(\d+)px/.exec(parent.params);
      if (max && width > +max[1] || min && width < +min[1]) return;
    }
    rule.walkDecls(decl => result[decl.prop] = decl.value);
  });
  return result;
}
const summary = '.recurring-redesign--overview .recurring-redesign__overview > .recurring-summary';
const calendar = '.recurring-redesign--overview .recurring-redesign__overview > .recurring-calendar';
for (const width of [320,393,820,1100]) {
  assert.equal(declarations('.transactions-entry--figma[data-entry-method="ask"] .adviser-chat__composer',width)['margin-top'], 'auto');
  for (const selector of ['.transactions-entry--figma[data-entry-method="ask"] > .transaction-creation-panel:not([hidden])', '.transactions-entry--figma[data-entry-method="ask"] .adviser-experience--entry', '.transactions-entry--figma[data-entry-method="ask"] .adviser-experience__main', '.transactions-entry--figma[data-entry-method="ask"] .adviser-chat']) {
    assert.equal(declarations(selector,width).flex,'1');
    assert.equal(declarations(selector,width)['min-height'],'0');
  }
  assert.equal(declarations('.contextual-ask-clover__panel',width).bottom, 'var(--ask-keyboard-inset, 0px)');
  assert.equal(declarations('.contextual-ask-clover__panel',width).height, 'min(86dvh, 800px, var(--ask-visible-height, 100dvh))');
  for (const selector of ['.contextual-ask-clover__chat', '.contextual-ask-clover__chat > .adviser-experience', '.contextual-ask-clover__chat .adviser-experience__main', '.contextual-ask-clover__chat .adviser-chat']) {
    assert.equal(declarations(selector,width).flex, '1');
    assert.equal(declarations(selector,width)['min-height'], '0');
    assert.equal(declarations(selector,width).overflow, 'hidden', 'Only welcome/history/thread content scrolls, never a second outer sheet');
  }
  assert.equal(declarations('.contextual-ask-clover__chat .adviser-chat__composer',width)['margin-top'], 'auto');
  assert.equal(declarations('.contextual-ask-clover__chat .adviser-chat__composer',width).flex, '0 0 auto');
  assert.equal(declarations('.contextual-ask-clover__chat .adviser-chat__composer textarea',width)['min-height'], '64px');
  assert.equal(declarations('.contextual-ask-clover__chat .adviser-chat__welcome',width)['justify-content'], 'flex-end');
  for (const scope of ['.content .clover-tabs.compact-product-tabs', '.shell-mobile-subheader .clover-tabs.compact-product-tabs', '.circle-detail .circle-product-tabs.clover-tabs.compact-product-tabs']) {
    assert.equal(declarations(scope,width).height, '44px');
    assert.equal(declarations(scope,width)['max-height'], '44px');
    assert.equal(declarations(scope,width).display, 'flex');
    assert.equal(declarations(`${scope} > button`,width).height, '44px');
    assert.equal(declarations(`${scope} > button:not(.is-active):not([aria-selected="true"]) :is(.animated-tabs__label,.recurring-tab-label)`,width).display, 'none');
    assert.equal(declarations(`${scope} > button:is(.is-active,[aria-selected="true"]) :is(.animated-tabs__label:not(.recurring-tab-label--mobile),.recurring-tab-label--desktop)`,width)['white-space'], 'nowrap');
  }
  assert.equal(declarations(summary,width)['grid-row'], '2');
  assert.equal(declarations(calendar,width)['grid-row'], '1');
  assert.equal(declarations(summary,width).width, '100%');
  assert.equal(declarations('.split-bill-list-toolbar > input',width).height, '44px');
  assert.equal(declarations('.split-bill-list-toolbar > .button',width).height, '44px');
  assert.equal(declarations('.split-bill-mobile-context',width)['flex-direction'], 'row');
  assert.equal(declarations('.split-bill-swipe-list',width).gap, '8px');
  assert.equal(declarations('.split-bill-swipe-row__copy > strong',width)['font-size'], declarations('.content--transactions .transactions-mobile-simple-row__name-main',width)['font-size']);
}
assert.equal(declarations(summary,1280)['grid-row'], '1', 'Desktop keeps its original summary-first arrangement');
assert.equal(declarations(calendar,1280)['grid-row'], '2');
assert.equal(declarations('.contextual-ask-clover__chat .adviser-chat__composer',1280)['margin-top'], undefined, 'Composer docking is scoped to mobile sheets');
assert.equal(declarations('.circle-detail .circle-product-tabs.clover-tabs.compact-product-tabs',1280).height, undefined, 'Mobile overrides do not change desktop tabs');
assert.match(fs.readFileSync(path.join(root,'components/circles-page-client.tsx'),'utf8'), /ariaLabel="Circle display currency"\s+showChevron=\{false\}/);
console.log('PASS rendered mobile web parity: calendar/summary/review order; five participant avatars and self identity; retained desktop arrangement, matching row type, 44px search/filter, row gaps, and Circle currency control.');
