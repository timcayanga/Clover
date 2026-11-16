const fm = window.financeManager ?? {};

let pdfModulePromise = null;

const storage = (() => {
  try {
    return window.localStorage ?? {
      getItem: () => null,
      setItem: () => {},
    };
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
    };
  }
})();

const STORAGE_KEY = "clover-screen";
const ITEMS_STORAGE_KEY = "clover-items";
const HISTORY_STORAGE_KEY = "clover-activity";
const SAVED_VIEWS_STORAGE_KEY = "clover-saved-views";

const screenMeta = {
  overview: {
    kicker: "Today",
    title: "Finance overview",
    description: "A calm desktop workspace for reviewing transactions, insights, and source-aware spending.",
    primary: "Add transaction",
    secondary: "See analytics",
  },
  "line-items": {
    kicker: "Manual tracking",
    title: "Transactions",
    description: "",
    primary: "Add transaction",
    secondary: "Import files",
  },
  analytics: {
    kicker: "Analytics",
    title: "Analytics",
    description: "",
    primary: "Review items",
    secondary: "Refresh metrics",
  },
};

const seedItems = [
  {
    id: "seed-income-1",
    date: "2026-04-12",
    type: "income",
    merchant: "Income - Acme Corp",
    amount: 45000,
    category: "Income",
    notes: "Monthly payroll",
    issue: null,
  },
  {
    id: "seed-expense-1",
    date: "2026-04-12",
    type: "expense",
    merchant: "Grab ride",
    amount: 186,
    category: "Transport",
    notes: "Home commute",
    issue: null,
  },
  {
    id: "seed-expense-2",
    date: "2026-04-11",
    type: "expense",
    merchant: "Grocery run - Rustan's",
    amount: 2840,
    category: "Food & Dining",
    notes: "Weekly groceries",
    issue: null,
  },
  {
    id: "seed-expense-3",
    date: "2026-04-11",
    type: "expense",
    merchant: "Coffee",
    amount: 240,
    category: "Food & Dining",
    notes: "Potential duplicate receipt",
    issue: {
      kind: "duplicate",
      detail: "Looks like a duplicate of Grocery run - Rustan's.",
      relatedId: "seed-expense-2",
    },
  },
];

const state = {
  screen: storage.getItem(STORAGE_KEY) || "overview",
  filter: "all",
  period: "ltd",
  analyticsTrendView: "month",
  analyticsSearch: "",
  analyticsCatalogOpen: false,
  periodBeforeCustom: "ltd",
  periodAnchor: "",
  periodYear: "",
  periodMonth: "",
  periodQuarter: "",
  periodWeekIndex: "",
  customStart: "",
  customEnd: "",
  query: "",
  transactionsSearchOpen: false,
  categoryFilter: "all",
  categoryFilters: [],
  sourceFilter: "all",
  sourceFilters: [],
  typeFilter: "all",
  amountMinFilter: "",
  amountMaxFilter: "",
  activeColumnFilter: "",
  sortBy: "date-desc",
  editingId: null,
  activeWarningId: null,
  selectedItemId: null,
  selectedItemIds: [],
  transactionsSummaryOpen: false,
  transactionsAddMenuOpen: false,
  transactionsDownloadMenuOpen: false,
  undoStack: [],
  redoStack: [],
  pendingPdfFile: null,
  pendingPdfQueue: [],
  pendingPdfQueueTotal: 0,
  pendingPdfQueueIndex: 0,
  pendingSourceTarget: null,
  activityLog: [],
  savedViews: [],
  actionDockOpen: false,
  items: [],
  importMessage: "",
};

const elements = {
  navButtons: document.querySelectorAll(".nav-link[data-screen]"),
  screens: document.querySelectorAll("[data-screen-panel]"),
  topbar: document.querySelector(".topbar"),
  kicker: document.querySelector("[data-screen-kicker]"),
  title: document.querySelector("[data-screen-title]"),
  description: document.querySelector("[data-screen-description]"),
  actionDock: document.querySelector("[data-action-dock]"),
  primaryAction: document.querySelector('[data-action="primary"]'),
  secondaryAction: document.querySelector('[data-action="secondary"]'),
  heroStart: document.querySelector('[data-action="start-entry"]'),
  heroAnalytics: document.querySelector('[data-action="jump-analytics"]'),
  form: document.querySelector("#line-item-form"),
  list: document.querySelector("#line-item-list"),
  template: document.querySelector("#line-item-template"),
  filters: document.querySelectorAll("[data-filter]"),
  sortHeaders: document.querySelectorAll("[data-sort-field]"),
  dateFilterTrigger: document.querySelector("#date-filter-trigger"),
  dateFilterTriggerLabel: document.querySelector("#date-filter-trigger .date-filter-trigger__label"),
  dateFilterModal: document.querySelector("#date-filter-modal"),
  dateFilterPanel: document.querySelector("#date-filter-panel"),
  dateFilterSummary: document.querySelector("#date-filter-summary"),
  dateFilterClose: document.querySelector("#date-filter-close"),
  dateFilterDone: document.querySelector("#date-filter-done"),
  dateFilterReset: document.querySelector("#date-filter-reset"),
  dateFilterTabs: document.querySelectorAll("[data-date-tab]"),
  searchInput: document.querySelector("#line-item-search"),
  transactionsSearchTrigger: document.querySelector("#transactions-search-trigger"),
  transactionsSearchPopover: document.querySelector("#transactions-search-popover"),
  transactionsSearchInput: document.querySelector("#transactions-search-input"),
  transactionsSearchClear: document.querySelector("#transactions-search-clear"),
  transactionsSearchApply: document.querySelector("#transactions-search-apply"),
  transactionsSearchCancel: document.querySelector("#transactions-search-cancel"),
  transactionsAdd: document.querySelector("#transactions-add"),
  transactionsAddMenu: document.querySelector("#transactions-add-menu"),
  transactionsAddTransaction: document.querySelector("#transactions-add-transaction"),
  transactionsImportFiles: document.querySelector("#transactions-import-files"),
  transactionsDownloadMenu: document.querySelector("#transactions-download-menu"),
  transactionsDownload: document.querySelector("#transactions-download"),
  transactionsDownloadCsv: document.querySelector("#transactions-download-csv"),
  transactionsDownloadPdf: document.querySelector("#transactions-download-pdf"),
  transactionsImportModal: document.querySelector("#transactions-import-modal"),
  transactionsImportClose: document.querySelector("#transactions-import-close"),
  transactionsImportChoose: document.querySelector("#transactions-import-choose"),
  transactionsImportCancel: document.querySelector("#transactions-import-cancel"),
  transactionsUndo: document.querySelector("#transactions-undo"),
  transactionsRedo: document.querySelector("#transactions-redo"),
  transactionsDateTrigger: document.querySelector("#transactions-date-trigger"),
  transactionsFiltersTrigger: document.querySelector("#transactions-filters-trigger"),
  transactionsBulkEdit: document.querySelector("#transactions-bulk-edit"),
  transactionsSelectedChip: document.querySelector("#transactions-selected-chip"),
  transactionsLayout: document.querySelector(".transactions-layout"),
  transactionsSummaryPanel: document.querySelector(".transactions-summary-panel"),
  transactionsSummaryToggle: document.querySelector("#transactions-summary-toggle"),
  categoryFilter: document.querySelector("#category-filter"),
  sourceFilter: document.querySelector("#source-filter"),
  typeFilter: document.querySelector("#type-filter"),
  amountMinFilter: document.querySelector("#amount-min-filter"),
  amountMaxFilter: document.querySelector("#amount-max-filter"),
  accountSortButton: document.querySelector(".line-item-header-cell--account-sort"),
  accountFilterButton: document.querySelector("[data-column-filter-field='source']"),
  categorySortButton: document.querySelector(".line-item-header-cell--category-sort"),
  categoryFilterButton: document.querySelector("[data-column-filter-field='category']"),
  sourceOptions: document.querySelector("#source-options"),
  columnFilterTray: document.querySelector("#column-filter-tray"),
  tableWrap: document.querySelector(".table-wrap"),
  scrollTopFab: document.querySelector("#scroll-top-fab"),
  listSummary: document.querySelector("[data-list-summary]"),
  periodNet: document.querySelector("[data-period-net]"),
  warningSummary: document.querySelector("[data-warning-summary]"),
  analyticsStats: document.querySelector("#analytics-stats"),
  analyticsBrowser: document.querySelector("#analytics-browser"),
  analyticsDateTrigger: document.querySelector("#analytics-date-trigger"),
  analyticsDateTriggerLabel: document.querySelector("#analytics-date-trigger .date-filter-trigger__label"),
  analyticsTrendView: document.querySelector("#analytics-trend-view"),
  analyticsCashflow: document.querySelector("#analytics-cashflow"),
  analyticsSourceDonut: document.querySelector("#analytics-source-donut"),
  analyticsCategories: document.querySelector("#analytics-categories"),
  analyticsCategoryDonut: document.querySelector("#analytics-category-donut"),
  analyticsSources: document.querySelector("#analytics-sources"),
  analyticsMoneyFlows: document.querySelector("#analytics-money-flows"),
  analyticsInsights: document.querySelector("#analytics-insights"),
  analyticsChanges: document.querySelector("#analytics-changes"),
  analyticsWarnings: document.querySelector("#analytics-warnings"),
  analyticsRecurring: document.querySelector("#analytics-recurring"),
  analyticsBillsPayments: document.querySelector("#analytics-bills-payments"),
  analyticsRange: document.querySelectorAll("[data-analytics-range]"),
  overviewMetrics: document.querySelector("#overview-metrics"),
  overviewInsights: document.querySelector("#overview-insights"),
  overviewTips: document.querySelector("#overview-tips"),
  overviewActivity: document.querySelector("#overview-activity"),
  overviewActivityCount: document.querySelector("#overview-activity-count"),
  statementUpload: document.querySelector("#statement-upload"),
  importStatus: document.querySelector("#import-status"),
  transactionsSummary: document.querySelector("#transactions-summary"),
  summaryDownloadTransactions: document.querySelector("#summary-download-transactions"),
  pdfPasswordModal: document.querySelector("#pdf-password-modal"),
  pdfPasswordForm: document.querySelector("#pdf-password-form"),
  pdfPasswordInput: document.querySelector("#pdf-password-input"),
  pdfPasswordCancel: document.querySelector("#pdf-password-cancel"),
  pdfPasswordCopy: document.querySelector("#pdf-password-copy"),
  pdfPasswordQueue: document.querySelector("#pdf-password-queue"),
  pdfPasswordError: document.querySelector("#pdf-password-error"),
  bulkEditModal: document.querySelector("#bulk-edit-modal"),
  bulkEditForm: document.querySelector("#bulk-edit-form"),
  bulkEditClose: document.querySelector("#bulk-edit-close"),
  bulkEditCancel: document.querySelector("#bulk-edit-cancel"),
  bulkEditCopy: document.querySelector("#bulk-edit-copy"),
  bulkEditCount: document.querySelector("#bulk-edit-count"),
  bulkEditCategory: document.querySelector("#bulk-edit-form select[name='category']"),
  bulkEditSource: document.querySelector("#bulk-edit-form input[name='source']"),
  bulkEditType: document.querySelector("#bulk-edit-form select[name='type']"),
  bulkEditNotes: document.querySelector("#bulk-edit-form textarea[name='notes']"),
  bulkEditTags: document.querySelector("#bulk-edit-form input[name='tags']"),
  bulkEditTagsMode: document.querySelector("#bulk-edit-form select[name='tagsMode']"),
  sourceModal: document.querySelector("#source-modal"),
  sourceForm: document.querySelector("#source-form"),
  sourceInput: document.querySelector("#source-modal-input"),
  sourceCancel: document.querySelector("#source-modal-cancel"),
  sourceError: document.querySelector("#source-modal-error"),
  manualEntryModal: document.querySelector("#manual-entry-modal"),
  manualEntryClose: document.querySelector("#manual-entry-close"),
  manualEntryTitle: document.querySelector("#manual-entry-title"),
  itemDetailModal: document.querySelector("#item-detail-modal"),
  itemDetailClose: document.querySelector("#item-detail-close"),
  itemDetailTitle: document.querySelector("#item-detail-title"),
  itemDetailAmount: document.querySelector("#item-detail-amount"),
  itemDetailMerchant: document.querySelector("#item-detail-merchant"),
  itemDetailAmountInput: document.querySelector("#item-detail-amount-input"),
  itemDetailDate: document.querySelector("#item-detail-date"),
  itemDetailType: document.querySelector("#item-detail-type"),
  itemDetailSource: document.querySelector("#item-detail-source"),
  itemDetailImportedFrom: document.querySelector("#item-detail-imported-from"),
  itemDetailImportedAt: document.querySelector("#item-detail-imported-at"),
  itemDetailCategory: document.querySelector("#item-detail-category"),
  itemDetailNotes: document.querySelector("#item-detail-notes"),
  itemDetailImportEvidence: document.querySelector("#item-detail-import-evidence"),
  itemDetailWarningWrap: document.querySelector("#item-detail-warning-wrap"),
  itemDetailWarning: document.querySelector("#item-detail-warning"),
  itemDetailDelete: document.querySelector("#item-detail-delete"),
  savedViewSelect: document.querySelector("#saved-view-select"),
  saveViewButton: document.querySelector("#save-view"),
  bulkDelete: document.querySelector("#bulk-delete"),
  clearSelection: document.querySelector("#clear-selection"),
  selectAll: document.querySelector("#select-all"),
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);

const USD_TO_PHP_RATE = 60;

const localDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `item-${Date.now()}-${Math.random()}`);

const iconPath = (name) => `assets/icons/${name}.svg`;

const loadPdfModule = async () => {
  if (window.pdfjsLib) {
    return window.pdfjsLib;
  }

  pdfModulePromise ??= import("./node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  return pdfModulePromise;
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeAmount = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : 0;
  const raw = String(value || "").trim();
  const negative = raw.startsWith("(") && raw.endsWith(")") || /-$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[(),$₱\s-]/g, "").replace(/,/g, "");
  const parsed = Number(cleaned.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return Math.abs(negative ? -parsed : parsed);
};

const normalizeDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return localDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const compactMatch = raw.match(/^(\d{1,2})([A-Za-z]{3})(\d{2}|\d{4})$/);
  if (compactMatch) {
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const day = Number(compactMatch[1]);
    const month = monthMap[compactMatch[2].toLowerCase()];
    let year = Number(compactMatch[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;

    if (month !== undefined && day >= 1 && day <= 31) {
      const parsed = new Date(Date.UTC(year, month, day));
      return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return localDate();
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const cloneItems = (items) => items.map((item) => ({ ...item, issue: item.issue ? { ...item.issue } : null }));

const selectedCount = () => state.selectedItemIds.length;

const setSelectedItems = (ids) => {
  state.selectedItemIds = Array.from(new Set(ids));
  if (elements.bulkDelete) {
    elements.bulkDelete.hidden = selectedCount() === 0;
  }
  if (elements.clearSelection) {
    elements.clearSelection.hidden = selectedCount() === 0;
  }
  if (elements.transactionsBulkEdit) {
    const count = selectedCount();
    elements.transactionsBulkEdit.disabled = count === 0;
  }
  if (elements.transactionsSelectedChip) {
    const count = selectedCount();
    elements.transactionsSelectedChip.hidden = count === 0;
    elements.transactionsSelectedChip.textContent = `${count} selected`;
  }
  if (elements.selectAll) {
    const allSelected = state.items.length > 0 && selectedCount() === state.items.length;
    const someSelected = selectedCount() > 0 && !allSelected;
    elements.selectAll.checked = allSelected;
    elements.selectAll.indeterminate = someSelected;
  }
};

const toggleSelectedItem = (id, checked) => {
  const next = new Set(state.selectedItemIds);
  if (checked) next.add(id);
  else next.delete(id);
  setSelectedItems([...next]);
};

const clearSelectedItems = () => setSelectedItems([]);

const loadLocalItems = () => {
  const raw = storage.getItem(ITEMS_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const loadJsonStorage = (key, fallback) => {
  const raw = storage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const saveJsonStorage = (key, value) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op if browser storage is unavailable
  }
};

const loadActivityLog = () => loadJsonStorage(HISTORY_STORAGE_KEY, []);
const saveActivityLog = (entries) => saveJsonStorage(HISTORY_STORAGE_KEY, entries);
const loadSavedViews = () => loadJsonStorage(SAVED_VIEWS_STORAGE_KEY, []);
const saveSavedViews = (views) => saveJsonStorage(SAVED_VIEWS_STORAGE_KEY, views);

const normalizeIssue = (item) => {
  if (item.issue) {
    return {
      kind: item.issue.kind || "review",
      detail: item.issue.detail || "Please review this line item.",
      relatedId: item.issue.relatedId || null,
    };
  }

  if (item.status === "Duplicate?") {
    return {
      kind: "duplicate",
      detail: "Please review this line item for a possible duplicate.",
      relatedId: null,
    };
  }

  return null;
};

const CATEGORY_DEFINITIONS = [
  { label: "Income", icon: "income", tone: "income", aliases: ["Salary"] },
  { label: "Gifts & Donations", icon: "gift", tone: "gifts", aliases: ["Gift", "Gifts", "Donation", "Donations", "Charity"] },
  { label: "Transport", icon: "transport", tone: "transport", aliases: [] },
  { label: "Housing", icon: "housing", tone: "housing", aliases: [] },
  { label: "Bills & Utilities", icon: "bill", tone: "bills", aliases: ["Utilities", "Subscriptions", "Bills"] },
  { label: "Food & Dining", icon: "food", tone: "food", aliases: ["Groceries"] },
  { label: "Travel & Lifestyle", icon: "travel", tone: "travel", aliases: ["Travel"] },
  { label: "Shopping", icon: "shopping", tone: "shopping", aliases: [] },
  { label: "Children", icon: "children", tone: "children", aliases: [] },
  { label: "Education", icon: "education", tone: "education", aliases: [] },
  { label: "Health & Wellness", icon: "health", tone: "health", aliases: ["Medical"] },
  { label: "Financial", icon: "financial", tone: "financial", aliases: ["Investments"] },
  { label: "Business", icon: "business", tone: "business", aliases: [] },
  { label: "Transfers", icon: "transfer", tone: "transfer", aliases: ["Transfer"] },
  { label: "Other", icon: "other", tone: "other", aliases: ["Everything Else", "Uncategorized"] },
];

const defaultCategoryLabel = "Other";

const categoryLabelMap = new Map();
for (const definition of CATEGORY_DEFINITIONS) {
  categoryLabelMap.set(normalizeText(definition.label), definition.label);
  for (const alias of definition.aliases || []) {
    categoryLabelMap.set(normalizeText(alias), definition.label);
  }
}

const normalizeCategoryLabel = (value) => {
  const category = String(value || "").trim();
  if (!category) return defaultCategoryLabel;
  return categoryLabelMap.get(normalizeText(category)) || defaultCategoryLabel;
};

const categoryDefinitionForLabel = (label) => {
  const normalized = normalizeCategoryLabel(label);
  return CATEGORY_DEFINITIONS.find((definition) => definition.label === normalized) || CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];
};

const normalizeTagsValue = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))].join(", ");
  }
  return String(value || "")
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(", ");
};

const splitTags = (value) => normalizeTagsValue(value).split(", ").filter(Boolean);

const mergeTags = (existing, incoming, mode = "append") => {
  const current = splitTags(existing);
  const next = splitTags(incoming);
  if (mode === "remove") {
    const removals = new Set(next.map((tag) => normalizeText(tag)));
    return current.filter((tag) => !removals.has(normalizeText(tag))).join(", ");
  }
  return [...new Set([...current, ...next].map((tag) => String(tag || "").trim()).filter(Boolean))].join(", ");
};

const normalizeItem = (item) => ({
  id: item.id || uid(),
  date: normalizeDate(item.date),
  type: ["income", "transfer"].includes(item.type) ? item.type : "expense",
  merchant: String(item.merchant || item.description || item.name || "Untitled item"),
  amount: normalizeAmount(item.amount),
  category: normalizeCategoryLabel(item.category),
  source: String(item.source || item.sourceLabel || "").trim() || "Cash",
  notes: String(item.notes || item.memo || ""),
  tags: normalizeTagsValue(item.tags || item.tag || ""),
  importedFrom: String(item.importedFrom || item.sourceFile || item.sourceLabel || "").trim() || "Manual entry",
  importedAt: String(item.importedAt || "").trim(),
  importEvidence: String(item.importEvidence || item.rawText || item.description || item.memo || "").trim(),
  issue: normalizeIssue(item),
});

const normalizeItems = (items) => (Array.isArray(items) ? items.map(normalizeItem) : []);

const statusClass = (issue) => {
  if (!issue) return "";
  return issue.kind === "duplicate" || issue.kind === "pair" ? "status-warn" : "status-bad";
};

const duplicateCandidate = (candidate, items) => {
  const candidateMerchant = normalizeText(candidate.merchant);
  return items.find((item) => {
    if (!item || item.id === candidate.id) return false;
    if (normalizeDate(item.date) !== normalizeDate(candidate.date)) return false;
    if (normalizeAmount(item.amount) !== normalizeAmount(candidate.amount)) return false;

    const itemMerchant = normalizeText(item.merchant);
    return (
      itemMerchant === candidateMerchant ||
      itemMerchant.includes(candidateMerchant) ||
      candidateMerchant.includes(itemMerchant)
    );
  });
};

const transferPairCandidate = (candidate, items) => {
  const candidateDate = normalizeDate(candidate.date);
  const candidateAmount = Number(candidate.amount) || 0;
  if (!candidateAmount) return null;

  const candidateText = normalizeText(`${candidate.source || ""} ${candidate.merchant || ""} ${candidate.notes || ""}`);
  const candidateTransferish = candidate.type === "transfer" || /(transfer|wise|bank|cash payment|cash withdrawal|atm withdrawal|withdrawal)/i.test(candidateText);
  if (!candidateTransferish) return null;

  return items.find((item) => {
    if (!item || item.id === candidate.id) return false;
    if (normalizeDate(item.date) !== candidateDate) return false;

    const itemAmount = Number(item.amount) || 0;
    const diff = Math.abs(candidateAmount - itemAmount);
    if (diff < 1 || diff > 50) return false;

    const otherText = normalizeText(`${item.source || ""} ${item.merchant || ""} ${item.notes || ""}`);
    const otherTransferish = item.type === "transfer" || /(transfer|wise|bank|cash payment|cash withdrawal|atm withdrawal|withdrawal)/i.test(otherText);
    if (!otherTransferish) return false;

    const candidateWise = /wise/i.test(candidateText);
    const otherWise = /wise/i.test(otherText);
    const candidateBank = /(bpi|bdo|rcbc|unionbank|bank)/i.test(candidateText);
    const otherBank = /(bpi|bdo|rcbc|unionbank|bank)/i.test(otherText);

    return (candidateWise && otherBank) || (otherWise && candidateBank);
  });
};

const buildIssue = (item, existingItems) => {
  const transferPair = transferPairCandidate(item, existingItems);
  if (transferPair) {
    return {
      kind: "pair",
      detail: `Possible transfer pair with ${transferPair.merchant}. Check for a convenience fee.`,
      relatedId: transferPair.id,
    };
  }

  const duplicate = duplicateCandidate(item, existingItems);
  if (!duplicate) return null;

  return {
    kind: "duplicate",
    detail: `Possible duplicate of ${duplicate.merchant}.`,
    relatedId: duplicate.id,
  };
};

const computeSummary = (items) => {
  const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + Number(item.amount), 0);
  const expenses = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
  const net = income - expenses;
  const reviewCount = items.filter((item) => Boolean(item.issue)).length;
  const savingsRate = income > 0 ? Math.max(0, ((net / income) * 100).toFixed(1)) : "0.0";

  return { income, expenses, net, reviewCount, savingsRate };
};

const parseAnalyticsDate = (value) => new Date(`${normalizeDate(value)}T12:00:00`);

const dayKey = (date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);

const monthKey = (date) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date);

const analyticsDateKey = (date) => new Intl.DateTimeFormat("en-CA").format(date);

const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const addMonths = (date, amount) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount, 1);
  return next;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const buildAnalyticsSpan = (items) => {
  const bounds = periodBounds();
  const dates = items.map((item) => parseAnalyticsDate(item.date)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) {
    const now = new Date();
    return {
      start: startOfMonth(now),
      end: endOfMonth(now),
      mode: "month",
    };
  }

  const earliest = new Date(Math.min(...dates.map((date) => date.getTime())));
  const latest = new Date(Math.max(...dates.map((date) => date.getTime())));
  const start = bounds.start || earliest;
  const end = bounds.end || latest;
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

  if (state.period === "day" || spanDays <= 45) {
    return { start, end, mode: "day" };
  }

  return {
    start: startOfMonth(start),
    end: endOfMonth(end),
    mode: "month",
  };
};

const buildAnalyticsBuckets = (items) => {
  const span = buildAnalyticsSpan(items);
  const buckets = [];
  const bucketMap = new Map();

  if (span.mode === "day") {
    for (let cursor = new Date(span.start); cursor <= span.end; cursor = addDays(cursor, 1)) {
      const key = analyticsDateKey(cursor);
      const label = dayKey(cursor);
      const bucket = { key, label, income: 0, expenses: 0, net: 0, count: 0 };
      buckets.push(bucket);
      bucketMap.set(key, bucket);
    }
  } else {
    for (let cursor = new Date(span.start); cursor <= span.end; cursor = addMonths(cursor, 1)) {
      const key = analyticsDateKey(cursor).slice(0, 7);
      const label = monthKey(cursor);
      const bucket = { key, label, income: 0, expenses: 0, net: 0, count: 0 };
      buckets.push(bucket);
      bucketMap.set(key, bucket);
    }
  }

  for (const item of items) {
    const itemDate = parseAnalyticsDate(item.date);
    if (Number.isNaN(itemDate.getTime())) continue;
    const key = span.mode === "day" ? analyticsDateKey(itemDate) : analyticsDateKey(itemDate).slice(0, 7);
    const bucket = bucketMap.get(key);
    if (!bucket) continue;
    const amount = Number(item.amount) || 0;
    if (item.type === "income") bucket.income += amount;
    else if (item.type === "expense") bucket.expenses += amount;
    bucket.net += item.type === "income" ? amount : item.type === "expense" ? -amount : 0;
    bucket.count += 1;
  }

  return buckets;
};

const aggregateItems = (items, keyFn, filterFn = () => true) => {
  const totals = new Map();
  items.forEach((item) => {
    if (!filterFn(item)) return;
    const key = keyFn(item);
    if (!key) return;
    const current = totals.get(key) || { label: key, amount: 0, count: 0 };
    current.amount += Number(item.amount) || 0;
    current.count += 1;
    totals.set(key, current);
  });
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
};

const recurringRows = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const key = `${normalizeText(item.merchant)}|${item.type}|${item.category}`;
    const bucket = grouped.get(key) || {
      label: item.merchant || "Untitled item",
      category: normalizeCategoryLabel(item.category),
      type: item.type,
      count: 0,
      amount: 0,
      totalDays: new Set(),
    };
    bucket.count += 1;
    bucket.amount += Number(item.amount) || 0;
    bucket.totalDays.add(item.date);
    grouped.set(key, bucket);
  });

  return [...grouped.values()]
    .filter((row) => row.count >= 2)
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 5);
};

const categoryChangeRows = (currentItems, previousItems) => {
  const currentTotals = aggregateItems(
    currentItems,
    (item) => normalizeCategoryLabel(item.category),
    (item) => item.type === "expense"
  );
  const previousTotals = aggregateItems(
    previousItems,
    (item) => normalizeCategoryLabel(item.category),
    (item) => item.type === "expense"
  );
  const previousMap = new Map(previousTotals.map((entry) => [entry.label, entry.amount]));

  return currentTotals
    .map((entry) => {
      const previous = previousMap.get(entry.label) || 0;
      return {
        label: entry.label,
        current: entry.amount,
        previous,
        delta: entry.amount - previous,
      };
    })
    .concat(
      previousTotals
        .filter((entry) => !currentTotals.some((current) => current.label === entry.label))
        .map((entry) => ({
          label: entry.label,
          current: 0,
          previous: entry.amount,
          delta: -entry.amount,
        }))
    )
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 6);
};

const billsPaymentRows = (items) => {
  const normalized = items
    .map((item) => ({
      ...item,
      amountValue: Number(item.amount) || 0,
      dateValue: parseAnalyticsDate(item.date),
      text: normalizeText(`${item.source || ""} ${item.merchant || ""} ${item.notes || ""} ${item.importEvidence || ""}`),
    }))
    .filter((item) => !Number.isNaN(item.dateValue.getTime()) && item.amountValue > 0);

  const rcbcCandidates = normalized
    .filter((item) => /rcbc/.test(normalizeText(item.source)) && /cash payment/i.test(item.text))
    .sort((a, b) => a.dateValue - b.dateValue);
  const unionCandidates = normalized
    .filter(
      (item) =>
        /unionbank|union bank/.test(normalizeText(item.source)) &&
        /(bills payment|online fund transfer|fund transfer)/i.test(item.text)
    )
    .sort((a, b) => a.dateValue - b.dateValue);

  const matchedRcbc = new Set();
  const matchedUnion = new Set();
  const matches = [];

  for (const rcbc of rcbcCandidates) {
    let bestMatch = null;

    for (const union of unionCandidates) {
      if (matchedUnion.has(union.id)) continue;
      const amountDiff = Math.abs(rcbc.amountValue - union.amountValue);
      if (amountDiff > 1) continue;
      const lagDays = Math.round((rcbc.dateValue.getTime() - union.dateValue.getTime()) / 86400000);
      if (lagDays < 0 || lagDays > 10) continue;

      const rank = lagDays * 10 + amountDiff;
      if (!bestMatch || rank < bestMatch.rank) {
        bestMatch = { union, lagDays, amountDiff, rank };
      }
    }

    if (bestMatch) {
      matchedRcbc.add(rcbc.id);
      matchedUnion.add(bestMatch.union.id);
      matches.push({
        id: `${rcbc.id}:${bestMatch.union.id}`,
        rcbc,
        union: bestMatch.union,
        lagDays: bestMatch.lagDays,
      });
    }
  }

  const pendingRcbc = rcbcCandidates.filter((item) => !matchedRcbc.has(item.id));
  const pendingUnion = unionCandidates.filter((item) => !matchedUnion.has(item.id));

  return {
    matches,
    pendingRcbc,
    pendingUnion,
  };
};

const bpiMonthIndex = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const extractBpiPeriodHints = (text) => {
  const compact = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const match = compact.match(/([a-z]{3})(\d{1,2})(\d{4})([a-z]{3})(\d{1,2})(\d{4})/i);
  if (!match) return null;

  return {
    startMonth: bpiMonthIndex[match[1].toLowerCase()],
    startYear: Number(match[3]),
    endMonth: bpiMonthIndex[match[4].toLowerCase()],
    endYear: Number(match[6]),
  };
};

const parseBpiStatementDate = (value, periodHints = null) => {
  const raw = String(value || "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const compactMatch = raw.match(/^(?<month>[A-Za-z]{3,9})\s+(?<day>\d{1,2})(?:,\s*(?<year>\d{4}))?$/);
  if (!compactMatch) return null;

  const monthIndex = bpiMonthIndex[compactMatch.groups.month.slice(0, 3).toLowerCase()];
  const day = Number(compactMatch.groups.day);
  if (monthIndex === undefined || !day || day < 1 || day > 31) return null;

  let year = compactMatch.groups.year ? Number(compactMatch.groups.year) : null;
  if (!year && periodHints?.startYear && periodHints?.endYear) {
    if (periodHints.startYear === periodHints.endYear) {
      year = periodHints.startYear;
    } else if (periodHints.startMonth !== undefined && monthIndex >= periodHints.startMonth) {
      year = periodHints.startYear;
    } else if (periodHints.endMonth !== undefined && monthIndex <= periodHints.endMonth) {
      year = periodHints.endYear;
    } else {
      year = periodHints.startYear;
    }
  }
  if (!year) return null;

  const parsed = new Date(Date.UTC(year, monthIndex, day));
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const extractBpiRows = (text, sourceLabel = "statement", pdfPages = []) => {
  const raw = String(text || "").trim();
  const compactRaw = normalizeText(raw).replace(/\s+/g, "");
  const sourceLooksLikePdf = /\.pdf$/i.test(String(sourceLabel || ""));
  if (
    !sourceLooksLikePdf ||
    !/(accountsummaryfortheperiod|periodcovered)/i.test(compactRaw) ||
    !/debitamountcreditamount/i.test(compactRaw)
  ) {
    return [];
  }

  const periodHints = extractBpiPeriodHints(compactRaw);
  const structuredRows = [];

  const compactText = (value) => String(value || "").replace(/\s+/g, "").trim();

  if (Array.isArray(pdfPages) && pdfPages.length) {
    for (const page of pdfPages) {
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      if (!pageItems.length) continue;

      const pageText = normalizeText(page.text || pageItems.map((item) => item.str || "").join(" ")).replace(/\s+/g, "");
      if (!/debitamountcreditamount/i.test(pageText)) continue;

      const rowBuckets = new Map();
      for (const item of pageItems) {
        const str = String(item?.str || "").trim();
        if (!str) continue;
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        const key = Math.round(y * 2) / 2;
        if (!rowBuckets.has(key)) rowBuckets.set(key, []);
        rowBuckets.get(key).push({ str, x, y });
      }

      for (const rowItems of rowBuckets.values()) {
        const items = rowItems.sort((a, b) => a.x - b.x);
        const dateTokens = items
          .filter((item) => item.x < 80)
          .map((item) => compactText(item.str))
          .filter(Boolean);
        const monthToken = dateTokens.find((token) => bpiMonthIndex[token.slice(0, 3).toLowerCase()] !== undefined);
        const dayToken = dateTokens.find((token) => /^\d{1,2}$/.test(token));
        const dateText = monthToken && dayToken ? `${monthToken} ${dayToken}` : dateTokens.slice(0, 2).join(" ");
        const date = parseBpiStatementDate(dateText, periodHints);
        if (!date) continue;

        const amountCandidates = items.filter((item) => /[\d,]+(?:\.\d{2})?/.test(compactText(item.str)) && item.x >= 340 && item.x <= 520);
        if (!amountCandidates.length) continue;

        const amountItem = amountCandidates.sort((a, b) => a.x - b.x)[0];
        const isCreditColumn = amountItem.x >= 430;
        const amount = normalizeAmount(compactText(amountItem.str));
        const description = items
          .filter((item) => item.x > 60 && item.x < 340)
          .map((item) => compactText(item.str))
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim();

        if (!description || /^beginning balance|^total debit|^total credit|^balance this statement/i.test(description)) continue;

        const descText = normalizeText(description);
        const merchant = inferMerchantFromDescription(description);
        const type = inferStatementType(descText, isCreditColumn ? "credit" : "debit");
        const category = inferCategoryFromStatement(`${merchant} ${description}`, type);

        structuredRows.push({
          date,
          type,
          merchant,
          amount,
          category,
          source: "BPI",
          notes: description || "Imported from statement",
        });
      }
    }
  }

  if (structuredRows.length) {
    return structuredRows;
  }

  const rows = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rowPattern = /([A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?)\s+(.+?)(?=(?:[A-Z][a-z]{2}\s+\d{1,2}(?:,\s*\d{4})?)|$)/gs;
  const rawRows = raw.matchAll(rowPattern);
  for (const match of rawRows) {
    const dateText = String(match[1] || "").trim();
    const rowText = String(match[2] || "").trim();
    if (!rowText || /beginning balance|total debit|total credit|balance this statement/i.test(rowText)) continue;
    const date = parseBpiStatementDate(dateText, periodHints) || normalizeDate(dateText);
    if (!date) continue;

    const creditMatch = rowText.match(/(?:CREDIT|CR)\s*[\s:]*([\d,]+(?:\.\d{2})?)/i);
    const debitMatch = rowText.match(/(?:DEBIT|DR)\s*[\s:]*([\d,]+(?:\.\d{2})?)/i);
    const genericAmountMatch = rowText.match(/([\d,]+(?:\.\d{2})?)/);
    const amount = normalizeAmount((creditMatch || debitMatch || genericAmountMatch || [])[1] || "");
    const descText = normalizeText(rowText);
    const merchant = inferMerchantFromDescription(rowText);
    const type = inferStatementType(descText, creditMatch ? "credit" : "debit");

    rows.push({
      date,
      type,
      merchant,
      amount,
      category: inferCategoryFromStatement(`${merchant} ${rowText}`, type),
      source: "BPI",
      notes: rowText || "Imported from statement",
    });
  }

  return rows;
};

const extractBdoRows = (text, sourceLabel = "statement", pdfPages = []) => {
  const raw = String(text || "").trim();
  const sourceLooksLikePdf = /\.pdf$/i.test(String(sourceLabel || ""));
  if (!sourceLooksLikePdf || !/BDO STATEMENT OF ACCOUNT|WITHDRAWAL\s+DEPOSIT\s+BALANCE/i.test(raw)) {
    return [];
  }

  const structuredRows = [];

  if (Array.isArray(pdfPages) && pdfPages.length) {
    for (const page of pdfPages) {
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      if (!pageItems.length) continue;

      const pageText = normalizeText(page.text || pageItems.map((item) => item.str || "").join(" "));
      if (!/withdrawal\s+deposit\s+balance/i.test(pageText)) continue;

      const rowBuckets = new Map();
      for (const item of pageItems) {
        const str = String(item?.str || "").trim();
        if (!str) continue;
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        const key = Math.round(y * 2) / 2;
        if (!rowBuckets.has(key)) rowBuckets.set(key, []);
        rowBuckets.get(key).push({ str, x, y });
      }

      for (const rowItems of rowBuckets.values()) {
        const items = rowItems.sort((a, b) => a.x - b.x);
        const dateToken = items.find((item) => /^\d{2}\/\d{2}\/\d{2}$/.test(item.str));
        if (!dateToken) continue;

        const amountCandidates = items.filter((item) => /[\d,]+(?:\.\d{2})?/.test(item.str) && item.x >= 300 && item.x < 520);
        if (!amountCandidates.length) continue;

        const amountItem = amountCandidates.sort((a, b) => a.x - b.x)[0];
        const description = items
          .filter((item) => item.x > 80 && item.x < 340)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (!description || /^beginning balance|^ending balance|^total/i.test(description)) continue;

        const direction = amountItem.x >= 420 ? "credit" : "debit";
        const type = inferStatementType(description, direction);
        const merchant = inferMerchantFromDescription(description);

        structuredRows.push({
          date: normalizeDate(dateToken.str),
          type,
          merchant,
          amount: normalizeAmount(amountItem.str),
          category: inferCategoryFromStatement(`${merchant} ${description}`, type),
          source: "BDO",
          notes: description || "Imported from statement",
        });
      }
    }
  }

  if (structuredRows.length) {
    return structuredRows;
  }

  const rows = [];
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rowPattern = /^(?<date>\d{2}\/\d{2}\/\d{2})\s+(?<desc>.+?)\s+(?<amount>[\d,]+(?:\.\d{2})?)-?\s+(?<balance>[\d,]+(?:\.\d{2})?)$/i;
  for (const line of lines) {
    if (/^beginning balance|^ending balance|^total/i.test(line)) continue;
    const match = line.match(rowPattern);
    if (!match?.groups) continue;
    const { date, desc, amount } = match.groups;
    const direction = /deposit|salary|payroll|interest|refund|credit/i.test(desc) ? "credit" : "debit";
    const type = inferStatementType(desc, direction);
    const merchant = inferMerchantFromDescription(desc);
    rows.push({
      date: normalizeDate(date),
      type,
      merchant,
      amount: normalizeAmount(amount),
      category: inferCategoryFromStatement(`${merchant} ${desc}`, type),
      source: "BDO",
      notes: desc || "Imported from statement",
    });
  }

  return rows;
};

const sankeyTargetLabel = (item, billsPaymentIds = new Set()) => {
  const text = normalizeText(`${item.source || ""} ${item.merchant || ""} ${item.notes || ""} ${item.importEvidence || ""}`);
  if (item.type === "income") return item.category || "Income";
  if (billsPaymentIds.has(item.id) || /bills payment|cash payment/i.test(text)) return "Bills payments";
  if (item.type === "transfer") return "Transfers";
  return normalizeCategoryLabel(item.category);
};

const buildSankeyFlowData = (items) => {
  const billsPayments = billsPaymentRows(items);
  const matchedIds = new Set([
    ...billsPayments.matches.map((match) => match.rcbc.id),
    ...billsPayments.matches.map((match) => match.union.id),
  ]);

  const flowItems = items
    .map((item) => {
      const amount = Math.abs(Number(item.amount) || 0);
      if (!amount) return null;
      const source = String(item.source || "Cash").trim() || "Cash";
      const target = sankeyTargetLabel(item, matchedIds);
      return {
        id: item.id,
        source,
        target,
        amount,
        type: item.type,
      };
    })
    .filter(Boolean);

  const sourceTotals = aggregateItems(flowItems, (item) => item.source);
  const targetTotals = aggregateItems(flowItems, (item) => item.target);
  const topSourceLabels = sourceTotals.slice(0, 5).map((row) => row.label);
  const topTargetLabels = targetTotals.slice(0, 5).map((row) => row.label);
  const otherSourceLabel = sourceTotals.length > topSourceLabels.length ? "Other sources" : null;
  const otherTargetLabel = targetTotals.length > topTargetLabels.length ? "Other destinations" : null;

  const sourceMap = new Map();
  const targetMap = new Map();
  const flowMap = new Map();

  for (const item of flowItems) {
    const source = topSourceLabels.includes(item.source) ? item.source : otherSourceLabel || item.source;
    const target = topTargetLabels.includes(item.target) ? item.target : otherTargetLabel || item.target;
    sourceMap.set(source, (sourceMap.get(source) || 0) + item.amount);
    targetMap.set(target, (targetMap.get(target) || 0) + item.amount);
    const key = `${source}→${target}`;
    flowMap.set(key, (flowMap.get(key) || 0) + item.amount);
  }

  const sourceNodes = [...sourceMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount], index) => ({
    side: "source",
    label,
    amount,
    tone: sourceToneForItem({ source: label }),
    color: sourceToneColor(label, index),
  }));
  const targetNodes = [...targetMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount], index) => ({
    side: "target",
    label,
    amount,
    tone: sankeyTargetTone(label),
    color: sankeyTargetColor(label, index),
  }));

  const sourceLayout = layoutSankeyNodes(sourceNodes, 320, 26, 10);
  const targetLayout = layoutSankeyNodes(targetNodes, 320, 26, 10);
  const sourceLayoutMap = new Map(sourceLayout.map((node) => [node.label, node]));
  const targetLayoutMap = new Map(targetLayout.map((node) => [node.label, node]));
  const flowEntries = [...flowMap.entries()]
    .map(([key, amount]) => {
      const [source, target] = key.split("→");
      const sourceNode = sourceLayoutMap.get(source);
      const targetNode = targetLayoutMap.get(target);
      if (!sourceNode || !targetNode) return null;
      return { source, target, amount, sourceNode, targetNode };
    })
    .filter(Boolean)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 18);

  const totalAmount = flowEntries.reduce((sum, entry) => sum + entry.amount, 0) || 1;

  return {
    billsPayments,
    sourceLayout,
    targetLayout,
    flowEntries,
    totalAmount,
  };
};

const layoutSankeyNodes = (nodes, height = 320, padding = 26, gap = 10) => {
  if (!nodes.length) return [];
  const total = nodes.reduce((sum, node) => sum + (Number(node.amount) || 0), 0) || 1;
  const usable = Math.max(0, height - padding * 2 - gap * Math.max(0, nodes.length - 1));
  const scale = usable / total;
  let cursor = padding;

  return nodes.map((node) => {
    const heightValue = Math.max(22, (Number(node.amount) || 0) * scale);
    const laidOut = {
      ...node,
      top: cursor,
      height: heightValue,
      center: cursor + heightValue / 2,
    };
    cursor += heightValue + gap;
    return laidOut;
  });
};

const renderSankeyFlowChart = (data) => {
  if (!data?.sourceLayout?.length || !data?.targetLayout?.length || !data?.flowEntries?.length) {
    return `<div class="empty-state">No transaction flows found for this period.</div>`;
  }

  const width = 1000;
  const height = 320;
  const leftX = 40;
  const leftWidth = 240;
  const rightWidth = 240;
  const rightX = width - rightWidth - 40;
  const startX = leftX + leftWidth;
  const endX = rightX;
  const curveLeft = startX + 135;
  const curveRight = endX - 135;
  const total = data.totalAmount || 1;
  const sourceOffsets = new Map(data.sourceLayout.map((node) => [node.label, 0]));
  const targetOffsets = new Map(data.targetLayout.map((node) => [node.label, 0]));

  const paths = data.flowEntries
    .map((entry, index) => {
      const sourceUsed = sourceOffsets.get(entry.source) || 0;
      const targetUsed = targetOffsets.get(entry.target) || 0;
      const sourceNode = entry.sourceNode;
      const targetNode = entry.targetNode;
      const sourceShare = sourceNode.amount ? sourceUsed / sourceNode.amount : 0;
      const targetShare = targetNode.amount ? targetUsed / targetNode.amount : 0;
      const startY = sourceNode.top + sourceShare * sourceNode.height + Math.max(3, (entry.amount / total) * 26);
      const endY = targetNode.top + targetShare * targetNode.height + Math.max(3, (entry.amount / total) * 26);
      const strokeWidth = Math.max(2, Math.min(24, (entry.amount / total) * 84));
      const opacity = Math.max(0.16, Math.min(0.52, 0.16 + (entry.amount / total) * 0.42));
      sourceOffsets.set(entry.source, sourceUsed + entry.amount);
      targetOffsets.set(entry.target, targetUsed + entry.amount);
      return `
        <path
          d="M ${startX} ${startY.toFixed(2)} C ${curveLeft} ${startY.toFixed(2)}, ${curveRight} ${endY.toFixed(2)}, ${endX} ${endY.toFixed(2)}"
          fill="none"
          stroke="${entry.sourceNode.color}"
          stroke-width="${strokeWidth.toFixed(2)}"
          stroke-linecap="round"
          stroke-opacity="${opacity.toFixed(2)}"
          class="sankey-link sankey-link--${index % 6}"
        />
      `;
    })
    .join("");

  const sourceNodes = data.sourceLayout
    .map(
      (node) => `
        <div class="sankey-node sankey-node--source sankey-node--${node.tone}" style="top:${node.top.toFixed(2)}px; height:${node.height.toFixed(2)}px;">
          <span class="sankey-node__swatch" aria-hidden="true" style="background:${node.color};"></span>
          <div class="sankey-node__meta">
            <strong>${escapeHtml(node.label)}</strong>
            <small>${formatCurrency(node.amount)}</small>
          </div>
        </div>
      `
    )
    .join("");

  const targetNodes = data.targetLayout
    .map(
      (node) => `
        <div class="sankey-node sankey-node--target sankey-node--${node.tone}" style="top:${node.top.toFixed(2)}px; height:${node.height.toFixed(2)}px;">
          <span class="sankey-node__swatch" aria-hidden="true" style="background:${node.color};"></span>
          <div class="sankey-node__meta">
            <strong>${escapeHtml(node.label)}</strong>
            <small>${formatCurrency(node.amount)}</small>
          </div>
        </div>
      `
    )
    .join("");

  const leaderSource = data.sourceLayout[0];
  const leaderTarget = data.targetLayout[0];
  return `
    <div class="sankey-chart__frame">
      <svg class="sankey-chart__links" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
        ${paths}
      </svg>
      <div class="sankey-chart__center">
        <span>Money flows</span>
        <strong>${leaderSource ? escapeHtml(leaderSource.label) : "Sources"} → ${leaderTarget ? escapeHtml(leaderTarget.label) : "Destinations"}</strong>
        <small>${formatCurrency(total)} traced across the selected period</small>
      </div>
      <div class="sankey-chart__column sankey-chart__column--left">${sourceNodes}</div>
      <div class="sankey-chart__column sankey-chart__column--right">${targetNodes}</div>
    </div>
  `;
};

const sankeyTargetTone = (label) => {
  const normalized = normalizeText(label);
  if (/income|salary/.test(normalized)) return "positive";
  if (/bills payment|transfer|transfers/.test(normalized)) return "neutral";
  if (/food|dining|groceries|transport|travel|shopping|medical|housing|utilities/.test(normalized)) return "negative";
  return "neutral";
};

const sankeyTargetColor = (label, index) => {
  const normalized = normalizeText(label);
  if (/income|salary/.test(normalized)) return "rgba(14, 159, 110, 0.92)";
  if (/bills payment/.test(normalized)) return "rgba(208, 139, 0, 0.92)";
  if (/transfer|transfers/.test(normalized)) return "rgba(3, 168, 192, 0.92)";
  const palette = categoryColorPalette;
  return palette[index % palette.length];
};

const sourceToneColor = (label, index) => {
  const normalized = normalizeText(label);
  if (/cash/.test(normalized)) return "rgba(3, 168, 192, 0.92)";
  if (/unionbank/.test(normalized)) return "rgba(56, 132, 255, 0.92)";
  if (/rcbc/.test(normalized)) return "rgba(198, 79, 110, 0.92)";
  if (/bpi/.test(normalized)) return "rgba(14, 159, 110, 0.92)";
  if (/bdo/.test(normalized)) return "rgba(208, 139, 0, 0.92)";
  if (/hsbc/.test(normalized)) return "rgba(79, 70, 229, 0.92)";
  if (/\bpnb\b|philippine national bank/.test(normalized)) return "rgba(16, 185, 129, 0.92)";
  if (/ps bank|psbank/.test(normalized)) return "rgba(129, 93, 255, 0.92)";
  if (/wise/.test(normalized)) return "rgba(129, 93, 255, 0.92)";
  const palette = categoryColorPalette;
  return palette[index % palette.length];
};

const sourceChipStyleForLabel = (label) => {
  const normalized = normalizeText(label);
  if (!normalized || normalized === "cash") {
    return "background-color: rgba(3, 168, 192, 0.2); box-shadow: inset 0 0 0 1px rgba(3, 168, 192, 0.12); color: var(--text);";
  }
  if (normalized.includes("unionbank") || normalized.includes("union bank")) {
    return "background-color: rgba(56, 132, 255, 0.18); box-shadow: inset 0 0 0 1px rgba(56, 132, 255, 0.12); color: #1d4ed8;";
  }
  if (normalized.includes("rcbc")) {
    return "background-color: rgba(198, 79, 110, 0.18); box-shadow: inset 0 0 0 1px rgba(198, 79, 110, 0.12); color: #be185d;";
  }
  if (normalized.includes("bpi")) {
    return "background-color: rgba(14, 159, 110, 0.18); box-shadow: inset 0 0 0 1px rgba(14, 159, 110, 0.12); color: #047857;";
  }
  if (normalized.includes("bdo")) {
    return "background-color: rgba(208, 139, 0, 0.18); box-shadow: inset 0 0 0 1px rgba(208, 139, 0, 0.12); color: #b45309;";
  }
  if (normalized.includes("hsbc")) {
    return "background-color: rgba(79, 70, 229, 0.18); box-shadow: inset 0 0 0 1px rgba(79, 70, 229, 0.12); color: #4338ca;";
  }
  if (normalized.includes("pnb") || normalized.includes("philippine national bank")) {
    return "background-color: rgba(34, 197, 94, 0.18); box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.12); color: #15803d;";
  }
  if (normalized.includes("ps bank") || normalized.includes("psbank")) {
    return "background-color: rgba(99, 102, 241, 0.18); box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.12); color: #4338ca;";
  }
  if (normalized.includes("wise")) {
    return "background-color: rgba(6, 182, 212, 0.18); box-shadow: inset 0 0 0 1px rgba(6, 182, 212, 0.12); color: #0f766e;";
  }
  if (normalized.includes("gcash")) {
    return "background-color: rgba(34, 197, 94, 0.18); box-shadow: inset 0 0 0 1px rgba(34, 197, 94, 0.12); color: #15803d;";
  }
  if (normalized.includes("maya") || normalized.includes("paymaya")) {
    return "background-color: rgba(168, 85, 247, 0.18); box-shadow: inset 0 0 0 1px rgba(168, 85, 247, 0.12); color: #7e22ce;";
  }
  if (normalized.includes("paypal")) {
    return "background-color: rgba(59, 130, 246, 0.18); box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.12); color: #1d4ed8;";
  }
  if (normalized.includes("grab")) {
    return "background-color: rgba(0, 191, 165, 0.18); box-shadow: inset 0 0 0 1px rgba(0, 191, 165, 0.12); color: #0f766e;";
  }
  if (normalized.includes("shopee")) {
    return "background-color: rgba(245, 158, 11, 0.18); box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.12); color: #b45309;";
  }
  if (normalized.includes("lazada")) {
    return "background-color: rgba(139, 92, 246, 0.18); box-shadow: inset 0 0 0 1px rgba(139, 92, 246, 0.12); color: #6d28d9;";
  }
  return "background-color: rgba(3, 168, 192, 0.16); box-shadow: inset 0 0 0 1px rgba(3, 168, 192, 0.1); color: var(--text);";
};

const sourceBadgeLabelFor = (label) => {
  const normalized = normalizeText(label);
  if (!normalized || normalized === "cash") return "C";
  if (normalized.includes("unionbank") || normalized.includes("union bank")) return "UB";
  if (normalized.includes("bpi")) return "BPI";
  if (normalized.includes("bdo")) return "BDO";
  if (normalized.includes("rcbc")) return "R";
  if (normalized.includes("metrobank")) return "MB";
  if (normalized.includes("security bank")) return "SB";
  if (normalized.includes("landbank") || normalized.includes("land bank")) return "LB";
  if (normalized.includes("pnb") || normalized.includes("philippine national bank")) return "PNB";
  if (normalized.includes("eastwest") || normalized.includes("east west")) return "EW";
  if (normalized.includes("gcash")) return "G";
  if (normalized.includes("maya") || normalized.includes("paymaya")) return "M";
  if (normalized.includes("wise")) return "W";
  if (normalized.includes("paypal")) return "PP";
  if (normalized.includes("grab")) return "G";
  if (normalized.includes("shopee")) return "S";
  if (normalized.includes("lazada")) return "L";
  const initials = String(label || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "A";
  return initials;
};

const sourceBadgeDataUri = (label) => {
  const badgeLabel = sourceBadgeLabelFor(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#03a8c0"/><text x="12" y="15" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${badgeLabel.length > 2 ? 7 : 8}" font-weight="700" fill="#ffffff">${badgeLabel}</text></svg>`;
  return `url("data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}")`;
};

const categoryIconShapeForItem = (item) => {
  const category = normalizeText(item.category || "");
  const type = normalizeText(item.type || "");
  if (type === "income" || category.includes("salary")) {
    return `<rect x="5" y="6" width="14" height="12" rx="2"/><path d="M8 10h8"/><path d="M8 13h5"/>`;
  }
  if (type === "transfer" || category.includes("transfer")) {
    return `<path d="M7 8l-3 3 3 3"/><path d="M4 11h10"/><path d="M17 16l3-3-3-3"/><path d="M14 13h6"/>`;
  }
  if (category.includes("medical") || category.includes("clinic") || category.includes("hospital") || category.includes("pharmacy") || category.includes("medicine") || category.includes("drug")) {
    return `<path d="M12 5v14"/><path d="M5 12h14"/>`;
  }
  if (category.includes("grocery") || category.includes("groceries") || category.includes("supermarket") || category.includes("market")) {
    return `<path d="M6 9h12l-1 8H7L6 9Z"/><path d="M9 9a3 3 0 0 1 6 0"/><path d="M9 12h.01"/><path d="M15 12h.01"/>`;
  }
  if (category.includes("housing") || category.includes("rent") || category.includes("mortgage") || category.includes("apartment") || category.includes("condo") || category.includes("home") || category.includes("house") || category.includes("lodging")) {
    return `<path d="M4.5 11.5 12 5l7.5 6.5"/><path d="M6.5 10.8V19h11V10.8"/><path d="M10 19v-5h4v5"/>`;
  }
  if (category.includes("food") || category.includes("dining") || category.includes("restaurant") || category.includes("coffee") || category.includes("meal")) {
    return `<path d="M7 5v14"/><path d="M7 7c0 1.5 1 2.5 2.2 2.8V19"/><path d="M12.5 5v14"/><path d="M16.5 5v14"/>`;
  }
  if (category.includes("transport")) {
    return `<path d="M6 15h12l-1-5H7l-1 5Z"/><path d="M8 15v2"/><path d="M16 15v2"/><path d="M8.5 10.5 10 8h4l1.5 2.5"/>`;
  }
  if (category.includes("travel")) {
    return `<path d="M3.5 12l17-5-5 5 5 5-17-5 7-2z"/><path d="M10 10l2 2-2 2"/>`;
  }
  if (category.includes("shopping")) {
    return `<path d="M6 9h12l-1 10H7L6 9Z"/><path d="M9 9a3 3 0 0 1 6 0"/>`;
  }
  if (category.includes("utilities")) {
    return `<path d="M13 3 7 13h4l-1 8 7-10h-4Z"/>`;
  }
  if (category.includes("subscription") || category.includes("membership")) {
    return `<circle cx="12" cy="12" r="7"/><path d="M12 8v4l3 2"/>`;
  }
  if (category.includes("investment")) {
    return `<path d="M5 17h14"/><path d="M7 14l3-3 3 2 5-6"/><path d="M15 7h3v3"/>`;
  }
  return `<circle cx="12" cy="12" r="6.5"/>`;
};

const categoryVectorImageUrl = (item) => iconPath(categoryIconForItem(item));

const categoryToneColorForItem = (item) => {
  const tone = categoryToneForItem(item);
  const colors = {
    income: "#0e9f6e",
    gifts: "#db2777",
    transfer: "#7f8d96",
    transport: "#0ea5e9",
    housing: "#a8552f",
    bills: "#d97706",
    food: "#f97316",
    travel: "#4f46e5",
    shopping: "#ec4899",
    children: "#8b5cf6",
    education: "#0891b2",
    health: "#ef4444",
    financial: "#06b6d4",
    business: "#64748b",
    other: "#64748b",
    default: "#64748b",
  };
  return colors[tone] || colors.default;
};

const analyticsCatalog = [
  {
    id: "cashflow",
    title: "Cashflow trend",
    subtitle: "Income, expenses, and net movement",
    preview: "assets/analytics-previews/cashflow-line.svg",
    anchor: "analytics-cashflow",
  },
  {
    id: "categories",
    title: "Category mix",
    subtitle: "Where the money went",
    preview: "assets/analytics-previews/category-mix.svg",
    anchor: "analytics-category-donut",
  },
  {
    id: "sources",
    title: "Source mix",
    subtitle: "Where transactions came from",
    preview: "assets/analytics-previews/top-sources.svg",
    anchor: "analytics-source-donut",
  },
  {
    id: "flows",
    title: "Money flows",
    subtitle: "Where money comes from and where it goes",
    preview: "assets/analytics-previews/sankey-flow.svg",
    anchor: "analytics-money-flows",
  },
  {
    id: "changes",
    title: "Category changes",
    subtitle: "Biggest shifts versus the previous period",
    preview: "assets/analytics-previews/category-changes.svg",
    anchor: "analytics-changes",
  },
  {
    id: "recurring",
    title: "Recurring patterns",
    subtitle: "Repeated transactions worth watching",
    preview: "assets/analytics-previews/recurring-patterns.svg",
    anchor: "analytics-recurring",
  },
  {
    id: "warnings",
    title: "Warnings",
    subtitle: "Items that need review",
    preview: "assets/analytics-previews/warnings.svg",
    anchor: "analytics-warnings",
  },
  {
    id: "bills-payments",
    title: "Bills payments",
    subtitle: "Settlements matched across banks",
    preview: "assets/analytics-previews/bills-payments.svg",
    anchor: "analytics-bills-payments",
  },
];

const analyticsViewLabel = (view) => {
  switch (view) {
    case "day":
      return "Day";
    case "week":
      return "Week";
    case "year":
      return "Year";
    default:
      return "Month";
  }
};

const analyticsBucketKey = (date, view) => {
  if (view === "day") return analyticsDateKey(date);
  if (view === "week") {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return analyticsDateKey(start);
  }
  if (view === "year") return String(date.getFullYear());
  return analyticsDateKey(date).slice(0, 7);
};

const analyticsBucketLabel = (start, end, view) => {
  if (view === "day") return dayKey(start);
  if (view === "week") return weekLabel(start, end);
  if (view === "year") return String(start.getFullYear());
  return monthKey(start);
};

const buildTrendBuckets = (items, bounds, view) => {
  const dates = items.map((item) => parseAnalyticsDate(item.date)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return [];

  let spanStart = bounds.start ? new Date(bounds.start) : new Date(Math.min(...dates.map((date) => date.getTime())));
  let spanEnd = bounds.end ? new Date(bounds.end) : new Date(Math.max(...dates.map((date) => date.getTime())));

  if (view === "week") {
    spanStart = new Date(spanStart);
    spanStart.setDate(spanStart.getDate() - ((spanStart.getDay() + 6) % 7));
    spanEnd = new Date(spanEnd);
    spanEnd.setDate(spanEnd.getDate() + (6 - ((spanEnd.getDay() + 6) % 7)));
  } else if (view === "month") {
    spanStart = startOfMonth(spanStart);
    spanEnd = endOfMonth(spanEnd);
  } else if (view === "year") {
    spanStart = new Date(spanStart.getFullYear(), 0, 1);
    spanEnd = new Date(spanEnd.getFullYear(), 11, 31);
  }

  const buckets = [];
  const bucketMap = new Map();
  const cursor = new Date(spanStart);
  cursor.setHours(0, 0, 0, 0);

  const advance = () => {
    if (view === "day") {
      cursor.setDate(cursor.getDate() + 1);
    } else if (view === "week") {
      cursor.setDate(cursor.getDate() + 7);
    } else if (view === "year") {
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
    cursor.setHours(0, 0, 0, 0);
  };

  while (cursor <= spanEnd) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    if (view === "day") {
      end.setTime(start.getTime());
    } else if (view === "week") {
      end.setDate(start.getDate() + 6);
    } else if (view === "year") {
      end.setFullYear(start.getFullYear(), 11, 31);
    } else {
      end.setMonth(end.getMonth() + 1, 0);
    }
    const key = analyticsBucketKey(start, view);
    const bucket = { key, label: analyticsBucketLabel(start, end, view), start, end, income: 0, expenses: 0, net: 0, count: 0 };
    buckets.push(bucket);
    bucketMap.set(key, bucket);
    advance();
  }

  for (const item of items) {
    const itemDate = parseAnalyticsDate(item.date);
    if (Number.isNaN(itemDate.getTime())) continue;
    const key = analyticsBucketKey(itemDate, view);
    const bucket = bucketMap.get(key);
    if (!bucket) continue;
    const amount = Number(item.amount) || 0;
    if (item.type === "income") bucket.income += amount;
    else if (item.type === "expense") bucket.expenses += amount;
    bucket.net += item.type === "income" ? amount : item.type === "expense" ? -amount : 0;
    bucket.count += 1;
  }

  return buckets;
};

const renderTrendChart = (buckets) => {
  if (!buckets.length) {
    return `<div class="empty-state">No transactions found for this period.</div>`;
  }

  const series = [
    { key: "income", label: "Income", color: "#0e9f6e" },
    { key: "expenses", label: "Expenses", color: "#c64f6e" },
    { key: "net", label: "Net", color: "#03a8c0" },
  ];
  const width = 920;
  const height = 280;
  const padX = 38;
  const padY = 28;
  const values = series.flatMap((entry) => buckets.map((bucket) => Number(bucket[entry.key]) || 0));
  const maxValue = Math.max(1, ...values, 0);
  const minValue = Math.min(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const xStep = buckets.length > 1 ? (width - padX * 2) / (buckets.length - 1) : 0;
  const yScale = (value) => height - padY - ((value - minValue) / range) * (height - padY * 2);

  const lineFor = (key) => {
    const points = buckets
      .map((bucket, index) => {
        const x = padX + xStep * index;
        const y = yScale(Number(bucket[key]) || 0);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return points;
  };

  const areaPoints = buckets
    .map((bucket, index) => {
      const x = padX + xStep * index;
      const y = yScale(Number(bucket.net) || 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const gridLines = Array.from({ length: 5 }, (_, index) => {
    const y = padY + ((height - padY * 2) / 4) * index;
    return `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" class="line-chart__grid-line"></line>`;
  }).join("");

  const xLabels = buckets
    .map((bucket, index) => {
      const x = padX + xStep * index;
      return `<text x="${x}" y="${height - 6}" text-anchor="middle" class="line-chart__label">${bucket.label}</text>`;
    })
    .join("");

  const pointNodes = series
    .map((entry) =>
      buckets
        .map((bucket, index) => {
          const x = padX + xStep * index;
          const y = yScale(Number(bucket[entry.key]) || 0);
          return `<circle cx="${x}" cy="${y}" r="3.6" fill="${entry.color}" class="line-chart__point"></circle>`;
        })
        .join("")
    )
    .join("");

  return `
    <div class="line-chart-shell">
      <div class="line-chart-legend">
        ${series
          .map(
            (entry) => `
              <span><i class="legend-swatch" style="background:${entry.color}"></i>${entry.label}</span>
            `
          )
          .join("")}
      </div>
      <svg viewBox="0 0 ${width} ${height}" class="line-chart-svg" preserveAspectRatio="none" role="img" aria-label="Cashflow line chart">
        ${gridLines}
        <polyline points="${areaPoints}" fill="rgba(3,168,192,0.06)" stroke="none" class="line-chart__area"></polyline>
        <polyline points="${lineFor("income")}" fill="none" stroke="#0e9f6e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="line-chart__line"></polyline>
        <polyline points="${lineFor("expenses")}" fill="none" stroke="#c64f6e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="line-chart__line"></polyline>
        <polyline points="${lineFor("net")}" fill="none" stroke="#03a8c0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" class="line-chart__line"></polyline>
        ${pointNodes}
        ${xLabels}
      </svg>
    </div>
  `;
};

const renderAnalyticsBrowser = () => {
  if (!elements.analyticsBrowser) return;
  const query = normalizeText(state.analyticsSearch);
  const results = analyticsCatalog.filter((entry) => {
    if (!query) return true;
    const haystack = normalizeText(`${entry.title} ${entry.subtitle}`);
    return haystack.includes(query);
  });
  if (!state.analyticsCatalogOpen && !query) {
    elements.analyticsBrowser.hidden = true;
    elements.analyticsBrowser.innerHTML = "";
    return;
  }

  elements.analyticsBrowser.hidden = false;
  if (!results.length) {
    elements.analyticsBrowser.innerHTML = `<div class="empty-state">No analytics matched your search.</div>`;
    return;
  }

  elements.analyticsBrowser.innerHTML = results
    .map(
      (entry) => `
        <button class="analytics-browser-card analytics-browser-card--stacked" type="button" data-analytics-target="${entry.anchor}">
          <img src="${entry.preview}" alt="${entry.title} preview" />
          <div class="analytics-browser-card__meta">
            <strong>${entry.title}</strong>
            <span>${entry.subtitle}</span>
          </div>
        </button>
      `
    )
    .join("");

  elements.analyticsBrowser.querySelectorAll("[data-analytics-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.analyticsTarget;
      if (!target) return;
      const node = document.getElementById(target);
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      state.analyticsCatalogOpen = false;
      renderAnalyticsBrowser();
    });
  });
};

const categoryColorPalette = [
  "rgba(3, 168, 192, 0.95)",
  "rgba(14, 159, 110, 0.95)",
  "rgba(56, 132, 255, 0.95)",
  "rgba(208, 139, 0, 0.95)",
  "rgba(198, 79, 110, 0.95)",
  "rgba(129, 93, 255, 0.95)",
];

const previousPeriodBounds = (bounds) => {
  if (!bounds.start || !bounds.end) return null;
  const spanDays = Math.max(1, Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86400000) + 1);
  const previousEnd = addDays(bounds.start, -1);
  const previousStart = addDays(previousEnd, -(spanDays - 1));
  return { start: previousStart, end: previousEnd };
};

const itemsWithinBounds = (items, bounds) => {
  if (!bounds?.start || !bounds?.end) return items;
  const startTime = bounds.start.getTime();
  const endTime = bounds.end.getTime();
  return items.filter((item) => {
    const itemTime = new Date(`${normalizeDate(item.date)}T12:00:00`).getTime();
    return itemTime >= startTime && itemTime <= endTime;
  });
};

const saveItems = async () => {
  const snapshot = cloneItems(state.items);
  if (typeof fm.saveState === "function") {
    try {
      await fm.saveState(snapshot);
      return;
    } catch {
      // fall back to browser storage below
    }
  }

  try {
    storage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // no-op if browser storage is unavailable
  }
};

const syncHistoryControls = () => {
  if (elements.transactionsUndo instanceof HTMLButtonElement) {
    elements.transactionsUndo.disabled = state.undoStack.length === 0;
  }
  if (elements.transactionsRedo instanceof HTMLButtonElement) {
    elements.transactionsRedo.disabled = state.redoStack.length === 0;
  }
};

const pushHistorySnapshot = () => {
  state.undoStack.push(cloneItems(state.items));
  if (state.undoStack.length > 20) {
    state.undoStack = state.undoStack.slice(-20);
  }
  state.redoStack = [];
  syncHistoryControls();
};

const restoreItemsSnapshot = async (snapshot, targetStack) => {
  if (!snapshot) return;
  targetStack.push(cloneItems(state.items));
  if (targetStack.length > 20) {
    targetStack.splice(0, targetStack.length - 20);
  }
  state.items = cloneItems(snapshot);
  if (state.selectedItemId && !state.items.some((item) => item.id === state.selectedItemId)) {
    closeItemDetailModal();
  }
  if (state.selectedItemIds.length) {
    setSelectedItems(state.selectedItemIds.filter((id) => state.items.some((item) => item.id === id)));
  }
  await saveItems();
  renderAll();
  syncHistoryControls();
};

const undoLastChange = async () => {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return;
  await restoreItemsSnapshot(snapshot, state.redoStack);
  recordActivity({ title: "Undid change", detail: "Restored the previous transaction state", kind: "info" });
};

const redoLastChange = async () => {
  const snapshot = state.redoStack.pop();
  if (!snapshot) return;
  await restoreItemsSnapshot(snapshot, state.undoStack);
  recordActivity({ title: "Redid change", detail: "Reapplied the next transaction state", kind: "info" });
};

const recordActivity = (entry, undoState = null) => {
  const logEntry = {
    id: uid(),
    at: new Date().toISOString(),
    title: entry.title,
    detail: entry.detail || "",
    kind: entry.kind || "info",
    undoable: Boolean(undoState),
  };
  state.activityLog = [logEntry, ...state.activityLog].slice(0, 20);
  saveActivityLog(state.activityLog);
  renderOverview();
  renderActivityPanel();
};

const saveCurrentViewState = () => ({
  filter: state.filter,
  period: state.period,
  periodBeforeCustom: state.periodBeforeCustom,
  periodAnchor: state.periodAnchor,
  periodYear: state.periodYear,
  periodMonth: state.periodMonth,
  periodQuarter: state.periodQuarter,
  periodWeekIndex: state.periodWeekIndex,
  customStart: state.customStart,
  customEnd: state.customEnd,
  query: state.query,
  categoryFilter: state.categoryFilter,
  categoryFilters: Array.isArray(state.categoryFilters) ? [...state.categoryFilters] : [],
  sourceFilters: Array.isArray(state.sourceFilters) ? [...state.sourceFilters] : [],
  sourceFilter: state.sourceFilter,
  typeFilter: state.typeFilter,
  amountMinFilter: state.amountMinFilter,
  amountMaxFilter: state.amountMaxFilter,
  sortBy: state.sortBy,
});

const applySavedView = (view) => {
  if (!view) return;
  state.filter = view.filter || state.filter;
  state.period = view.period || state.period;
  state.periodBeforeCustom = view.periodBeforeCustom || state.periodBeforeCustom;
  state.periodAnchor = view.periodAnchor || state.periodAnchor;
  state.periodYear = view.periodYear || state.periodYear;
  state.periodMonth = view.periodMonth || state.periodMonth;
  state.periodQuarter = view.periodQuarter || state.periodQuarter;
  state.periodWeekIndex = view.periodWeekIndex || state.periodWeekIndex;
  state.customStart = view.customStart || state.customStart;
  state.customEnd = view.customEnd || state.customEnd;
  state.query = view.query ?? state.query;
  state.categoryFilters = Array.isArray(view.categoryFilters)
    ? [...new Set(view.categoryFilters.map((category) => normalizeCategoryLabel(category)).filter(Boolean))]
    : typeof view.categoryFilter === "string" && view.categoryFilter !== "all"
      ? [normalizeCategoryLabel(view.categoryFilter)]
      : [];
  state.categoryFilter = view.categoryFilter && view.categoryFilter !== "all" ? normalizeCategoryLabel(view.categoryFilter) : state.categoryFilter;
  state.sourceFilters = Array.isArray(view.sourceFilters)
    ? [...new Set(view.sourceFilters.map((source) => String(source || "").trim()).filter(Boolean))]
    : typeof view.sourceFilter === "string" && view.sourceFilter !== "all"
      ? [view.sourceFilter]
      : [];
  state.sourceFilter = view.sourceFilter || state.sourceFilter;
  state.typeFilter = view.typeFilter || state.typeFilter;
  state.amountMinFilter = view.amountMinFilter ?? state.amountMinFilter;
  state.amountMaxFilter = view.amountMaxFilter ?? state.amountMaxFilter;
  state.sortBy = view.sortBy || state.sortBy;
  state.activeColumnFilter = "";
  if (elements.categoryFilter) elements.categoryFilter.value = state.categoryFilter;
  if (elements.sourceFilter && "value" in elements.sourceFilter) elements.sourceFilter.value = state.sourceFilter;
  if (elements.typeFilter) elements.typeFilter.value = state.typeFilter;
  if (elements.amountMinFilter) elements.amountMinFilter.value = state.amountMinFilter;
  if (elements.amountMaxFilter) elements.amountMaxFilter.value = state.amountMaxFilter;
  if (elements.savedViewSelect) elements.savedViewSelect.value = view.id || "";
  renderAll();
};

const applyPresetView = (preset) => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth());
  const quarter = String(Math.floor(now.getMonth() / 3) + 1);
  const weekIndex = String(currentWeekIndexForYear(year));

  switch (preset) {
    case "today":
      state.period = "day";
      state.periodBeforeCustom = "day";
      state.periodAnchor = localDate();
      break;
    case "week":
      state.period = "week";
      state.periodBeforeCustom = "week";
      state.periodYear = year;
      state.periodWeekIndex = weekIndex;
      break;
    case "month":
      state.period = "month";
      state.periodBeforeCustom = "month";
      state.periodYear = year;
      state.periodMonth = month;
      break;
    case "quarter":
      state.period = "quarter";
      state.periodBeforeCustom = "quarter";
      state.periodYear = year;
      state.periodQuarter = quarter;
      break;
    case "year":
      state.period = "year";
      state.periodBeforeCustom = "year";
      state.periodYear = year;
      break;
    case "ltd":
    default:
      state.period = "ltd";
      state.periodBeforeCustom = "ltd";
      state.periodAnchor = "";
      state.periodYear = "";
      state.periodMonth = "";
      state.periodQuarter = "";
      state.periodWeekIndex = "";
      state.customStart = "";
      state.customEnd = "";
      break;
  }

  state.activeColumnFilter = "";
  renderAll();
};

const refreshSavedViewSelect = () => {
  if (!elements.savedViewSelect) return;
  const current = elements.savedViewSelect.value;
  const presetOptions = [
    ["preset:ltd", "Lifetime to date"],
    ["preset:today", "Today"],
    ["preset:week", "This week"],
    ["preset:month", "This month"],
    ["preset:quarter", "This quarter"],
    ["preset:year", "This year"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  const options = ['<option value="">All transactions</option>']
    .concat(['<optgroup label="Presets">', presetOptions, "</optgroup>"])
    .concat(
      state.savedViews.map(
        (view) => `<option value="${escapeHtml(view.id)}">${escapeHtml(view.name)}</option>`
      )
    )
    .join("");
  elements.savedViewSelect.innerHTML = options;
  if (current && [...elements.savedViewSelect.options].some((option) => option.value === current)) {
    elements.savedViewSelect.value = current;
  }
};

const saveCurrentView = async () => {
  const name = window.prompt("Name this saved view", `View ${state.savedViews.length + 1}`);
  if (!name) return;

  const entry = {
    id: uid(),
    name: String(name).trim().slice(0, 60) || `View ${state.savedViews.length + 1}`,
    ...saveCurrentViewState(),
  };

  state.savedViews = [entry, ...state.savedViews].slice(0, 12);
  saveSavedViews(state.savedViews);
  refreshSavedViewSelect();
  if (elements.savedViewSelect) elements.savedViewSelect.value = entry.id;
  recordActivity({ title: "Saved view", detail: entry.name, kind: "info" });
};

const exportTransactionsCsv = (rows, filename = "clover-transactions.csv") => {
  const header = [
    "Date",
    "Name",
    "Source",
    "Type",
    "Category",
    "Amount",
    "Notes",
    "Tags",
    "Imported from",
    "Imported at",
    "Warning",
  ];
  const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(escapeCsv).join(",")];
  rows.forEach((item) => {
    lines.push(
      [
        item.date,
        item.merchant,
        item.source || "Cash",
        item.type,
        item.category,
        Number(item.amount) || 0,
        item.notes || "",
        item.tags || "",
        item.importedFrom || "",
        item.importedAt || "",
        item.issue?.detail || "",
      ]
        .map(escapeCsv)
        .join(",")
    );
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const sanitizePdfText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");

const makeSimplePdf = (linesByPage) => {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [] /Count 0 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageObjects = [];

  linesByPage.forEach((lines) => {
    const textLines = lines.map((line) => sanitizePdfText(line));
    const contentLines = [
      "BT",
      "/F1 10 Tf",
      "14 TL",
      "50 760 Td",
      ...(textLines.length ? [`(${textLines[0]}) Tj`, ...textLines.slice(1).map((line) => `T* (${line}) Tj`)] : ["() Tj"]),
      "ET",
    ];
    const content = contentLines.join("\n");
    const contentObj = objects.push(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`);
    const pageObj = objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`
    );
    pageObjects.push(pageObj);
  });

  objects[1] = `<< /Type /Pages /Kids [${pageObjects.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageObjects.length} >>`;

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets[index + 1] = chunks.join("").length;
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefStart = chunks.join("").length;
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objects.length; i += 1) {
    const offset = String(offsets[i]).padStart(10, "0");
    chunks.push(`${offset} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return new Blob([chunks.join("")], { type: "application/pdf" });
};

const exportTransactionsPdf = (rows, filename = "clover-transactions.pdf") => {
  const pageSize = 42;
  const lines = [
    "Clover - Transactions",
    `Generated: ${new Date().toLocaleString()}`,
    "",
    ...rows.flatMap((item) => [
      `${item.date || ""} | ${item.merchant || ""} | ${(item.source || "Cash") || ""} | ${item.category || ""} | ${formatCurrency(normalizeAmount(item.amount))}`,
    ]),
  ];
  const pages = [];
  for (let i = 0; i < lines.length; i += pageSize) {
    pages.push(lines.slice(i, i + pageSize));
  }
  const blob = makeSimplePdf(pages.length ? pages : [["Clover - Transactions"]]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const updateTopbar = () => {
  const meta = screenMeta[state.screen];
  const analyticsMode = state.screen === "analytics";
  if (elements.topbar) {
    elements.topbar.hidden = state.screen !== "analytics";
    elements.topbar.classList.toggle("is-search-mode", analyticsMode);
  }
  if (elements.searchInput instanceof HTMLInputElement) {
    elements.searchInput.hidden = !analyticsMode;
    if (analyticsMode) {
      elements.searchInput.placeholder = "Search analytics";
      elements.searchInput.value = state.analyticsSearch;
      elements.searchInput.setAttribute("aria-label", "Search analytics");
    } else {
      elements.searchInput.placeholder = "Search";
      elements.searchInput.value = "";
      elements.searchInput.setAttribute("aria-label", "Search");
    }
  }
  if (elements.kicker) {
    elements.kicker.hidden = analyticsMode;
    elements.kicker.textContent = meta.kicker;
  }
  if (elements.title) {
    elements.title.hidden = analyticsMode;
    elements.title.textContent = meta.title;
  }
  if (elements.description) {
    elements.description.hidden = analyticsMode || !meta.description;
    elements.description.textContent = meta.description;
  }
  if (elements.primaryAction) {
    elements.primaryAction.textContent = meta.primary;
  }
  if (elements.secondaryAction) {
    elements.secondaryAction.textContent = meta.secondary;
  }
};

const setScreen = (screen) => {
  const hasPanel = [...elements.screens].some((panel) => panel.dataset.screenPanel === screen);
  if (!hasPanel) {
    screen = "overview";
  }
  state.screen = screen;
  document.body.dataset.screen = screen;
  storage.setItem(STORAGE_KEY, screen);
  elements.navButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.screen === screen));
  elements.screens.forEach((panel) => {
    const isActive = panel.dataset.screenPanel === screen;
    panel.hidden = !isActive;
    panel.classList.toggle("is-active", isActive);
  });
  updateTopbar();
  closeTransactionsAddMenu();
  closeTransactionsSearchPopover();
  closeTransactionsDownloadMenu();
  if (elements.actionDock) {
    elements.actionDock.hidden = true;
    state.actionDockOpen = false;
    elements.actionDock.classList.remove("is-open");
  }
  if (screen !== "analytics") {
    state.analyticsCatalogOpen = false;
    state.analyticsSearch = "";
    renderAnalyticsBrowser();
  }
  updateScrollTopFab();
};

const setFilter = (filter) => {
  state.filter = filter;
  elements.filters.forEach((button) => button.classList.toggle("is-active", button.dataset.filter === filter));
  renderLineItems();
};

const setCategoryFilter = (category) => {
  if (Array.isArray(category)) {
    state.categoryFilters = [...new Set(category.map((value) => normalizeCategoryLabel(value)).filter(Boolean))];
    state.categoryFilter = state.categoryFilters[0] || "all";
  } else {
    const nextCategory = category && category !== "all" ? normalizeCategoryLabel(category) : "all";
    state.categoryFilter = nextCategory;
    state.categoryFilters = nextCategory !== "all" ? [nextCategory] : [];
  }
  if (elements.categoryFilter) {
    elements.categoryFilter.value = state.categoryFilter;
  }
  renderLineItems();
};

const setSort = (sortBy) => {
  state.sortBy = sortBy;
  renderLineItems();
};

const setSortField = (field) => {
  const currentField = String(state.sortBy || "date-desc").split("-")[0];
  const currentDirection = String(state.sortBy || "date-desc").endsWith("asc") ? "asc" : "desc";
  const defaultDirection = field === "amount" || field === "date" ? "desc" : "asc";
  const nextDirection = currentField === field ? (currentDirection === "asc" ? "desc" : "asc") : defaultDirection;
  if (["type", "category", "amount"].includes(field)) {
    state.activeColumnFilter = field;
  } else {
    state.activeColumnFilter = "";
  }
  setSort(`${field}-${nextDirection}`);
};

const setQuery = (query) => {
  state.query = query;
  syncTransactionsSearchControls();
  renderLineItems();
};

const ensurePeriodDefaults = () => {
  const now = new Date();
  if (!state.periodYear) {
    state.periodYear = String(now.getFullYear());
  }
  if (!state.periodMonth) {
    state.periodMonth = String(now.getMonth());
  }
  if (!state.periodQuarter) {
    state.periodQuarter = String(Math.floor(now.getMonth() / 3) + 1);
  }
  if (!state.periodWeekIndex) {
    state.periodWeekIndex = currentWeekIndexForYear(state.periodYear);
  }
};

const setPeriod = (period) => {
  state.period = period;
  if (period !== "custom") {
    state.periodBeforeCustom = period;
  }
  ensurePeriodDefaults();
  if (period === "day" && !state.periodAnchor) {
    state.periodAnchor = localDate();
  }
  if (period === "custom" && !state.customStart) {
    state.customStart = state.periodAnchor || localDate();
  }
  if (period === "custom" && !state.customEnd) {
    state.customEnd = state.periodAnchor || localDate();
  }
  renderLineItems();
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const currentYear = () => new Date().getFullYear();

const yearOptions = () => {
  const now = currentYear();
  return Array.from({ length: 11 }, (_, index) => String(now - 5 + index));
};

const weekLabel = (start, end) => {
  const startMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);
  const endMonth = new Intl.DateTimeFormat("en-US", { month: "short" }).format(end);
  const startDay = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(start);
  const endDay = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(end);
  const endYear = new Intl.DateTimeFormat("en-US", { year: "numeric" }).format(end);

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay}-${endDay}, ${endYear}`;
  }

  if (start.getFullYear() === end.getFullYear()) {
    return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`;
  }

  return `${startMonth} ${startDay}, ${start.getFullYear()} - ${endMonth} ${endDay}, ${endYear}`;
};

const weekRangesForYear = (yearValue) => {
  const year = Number(yearValue);
  if (!Number.isFinite(year)) return [];

  const ranges = [];
  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);
  const cursor = new Date(firstDay);
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));

  let index = 0;
  while (cursor <= lastDay) {
    const start = new Date(cursor);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    ranges.push({ value: String(index), label: weekLabel(start, end), start, end });
    cursor.setDate(cursor.getDate() + 7);
    index += 1;
  }

  return ranges;
};

const currentWeekIndexForYear = (yearValue, dateValue = localDate()) => {
  const target = new Date(`${normalizeDate(dateValue)}T12:00:00`);
  const weeks = weekRangesForYear(yearValue);
  const found = weeks.findIndex((week) => target >= week.start && target <= week.end);
  return found >= 0 ? String(found) : "0";
};

const periodBounds = () => {
  const anchorDate = state.periodAnchor || localDate();
  const anchor = new Date(`${anchorDate}T00:00:00`);
  const year = Number(state.periodYear || currentYear());

  if (state.period === "ltd") {
    return {
      start: null,
      end: null,
      label: "Lifetime to date",
    };
  }

  if (state.period === "day") {
    return {
      start: anchor,
      end: anchor,
      label: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(anchor),
    };
  }

  if (state.period === "week") {
    const weeks = weekRangesForYear(year);
    const selected = weeks[Number(state.periodWeekIndex) || 0] || weeks[0];
    if (!selected) {
      return { start: null, end: null, label: "Lifetime to date" };
    }
    return {
      start: selected.start,
      end: selected.end,
      label: weekLabel(selected.start, selected.end),
    };
  }

  if (state.period === "month") {
    const monthIndex = Number(state.periodMonth);
    const start = new Date(year, Number.isFinite(monthIndex) ? monthIndex : 0, 1);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1, 0);
    return {
      start,
      end,
      label: `${monthNames[start.getMonth()]} ${year}`,
    };
  }

  if (state.period === "quarter") {
    const quarterIndex = Math.min(3, Math.max(0, Number(state.periodQuarter) || 1)) - 1;
    const start = new Date(year, quarterIndex * 3, 1);
    const end = new Date(year, quarterIndex * 3 + 3, 0);
    return {
      start,
      end,
      label: `Q${quarterIndex + 1} ${year}`,
    };
  }

  if (state.period === "year") {
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    return {
      start,
      end,
      label: `${year}`,
    };
  }

  if (state.period === "custom") {
    const customStart = state.customStart ? new Date(`${state.customStart}T00:00:00`) : new Date(anchor);
    const customEnd = state.customEnd ? new Date(`${state.customEnd}T23:59:59`) : new Date(anchor);
    return {
      start: customStart,
      end: customEnd,
      label:
        state.customStart && state.customEnd
          ? `${state.customStart} to ${state.customEnd}`
          : "Custom range",
    };
  }

  return {
    start: null,
    end: null,
    label: "Lifetime to date",
  };
};

const renderDateFilterRelativeControls = () => {
  const years = yearOptions();
  const yearMarkup = years
    .map((year) => `<option value="${year}"${year === String(state.periodYear || currentYear()) ? " selected" : ""}>${year}</option>`)
    .join("");
  const activePeriod = state.period === "custom" ? state.periodBeforeCustom || "ltd" : state.period;
  const quickRanges = [
    ["day", "Today"],
    ["week", "This week"],
    ["month", "This month"],
    ["quarter", "This quarter"],
    ["year", "This year"],
    ["ltd", "Lifetime to date"],
  ];

  const quickMarkup = quickRanges
    .map(
      ([value, label]) =>
        `<button class="date-filter-chip${value === activePeriod ? " is-active" : ""}" type="button" data-period-choice="${value}">${label}</button>`
    )
    .join("");

  if (activePeriod === "day") {
    const dateValue = state.periodAnchor || localDate();
    return `
      <div class="date-filter-chip-row">${quickMarkup}</div>
      <div class="date-filter-fields">
        <label class="date-filter-field">
          <span>On</span>
          <input type="date" data-period-day value="${dateValue}" />
        </label>
      </div>
    `;
  }

  if (activePeriod === "week") {
    const selectedYear = String(state.periodYear || currentYear());
    const weekOptions = weekRangesForYear(selectedYear);
    if (!state.periodWeekIndex || !weekOptions.some(({ value }) => value === String(state.periodWeekIndex))) {
      state.periodWeekIndex = currentWeekIndexForYear(selectedYear);
    }
    const weekMarkup = weekOptions
      .map(
        ({ value, label }) =>
          `<option value="${value}"${value === String(state.periodWeekIndex) ? " selected" : ""}>${label}</option>`
      )
      .join("");
    return `
      <div class="date-filter-chip-row">${quickMarkup}</div>
      <div class="date-filter-fields date-filter-fields--two">
        <label class="date-filter-field">
          <span>Year</span>
          <select data-period-year>${yearMarkup}</select>
        </label>
        <label class="date-filter-field">
          <span>Week</span>
          <select data-period-week>${weekMarkup}</select>
        </label>
      </div>
    `;
  }

  if (activePeriod === "month") {
    const selectedMonth = String(Number.isFinite(Number(state.periodMonth)) ? Number(state.periodMonth) : new Date().getMonth());
    const monthMarkup = monthNames
      .map((month, index) => `<option value="${index}"${String(index) === selectedMonth ? " selected" : ""}>${month}</option>`)
      .join("");
    return `
      <div class="date-filter-chip-row">${quickMarkup}</div>
      <div class="date-filter-fields date-filter-fields--two">
        <label class="date-filter-field">
          <span>Year</span>
          <select data-period-year>${yearMarkup}</select>
        </label>
        <label class="date-filter-field">
          <span>Month</span>
          <select data-period-month>${monthMarkup}</select>
        </label>
      </div>
    `;
  }

  if (activePeriod === "quarter") {
    const selectedQuarter = String(Math.min(4, Math.max(1, Number(state.periodQuarter) || Math.floor(new Date().getMonth() / 3) + 1)));
    const quarterMarkup = Array.from({ length: 4 }, (_, index) => index + 1)
      .map((quarter) => `<option value="${quarter}"${String(quarter) === selectedQuarter ? " selected" : ""}>Q${quarter}</option>`)
      .join("");
    return `
      <div class="date-filter-chip-row">${quickMarkup}</div>
      <div class="date-filter-fields date-filter-fields--two">
        <label class="date-filter-field">
          <span>Year</span>
          <select data-period-year>${yearMarkup}</select>
        </label>
        <label class="date-filter-field">
          <span>Quarter</span>
          <select data-period-quarter>${quarterMarkup}</select>
        </label>
      </div>
    `;
  }

  if (activePeriod === "year") {
    return `
      <div class="date-filter-chip-row">${quickMarkup}</div>
      <div class="date-filter-fields">
        <label class="date-filter-field">
          <span>Year</span>
          <select data-period-year>${yearMarkup}</select>
        </label>
      </div>
    `;
  }

  return `
    <div class="date-filter-chip-row">${quickMarkup}</div>
    <div class="date-filter-empty">Lifetime to date includes every transaction up to today.</div>
  `;
};

const renderDateFilterCustomControls = () => `
  <div class="date-filter-fields date-filter-fields--two">
    <label class="date-filter-field">
      <span>Start</span>
      <input type="date" data-custom-start value="${state.customStart || state.periodAnchor || localDate()}" />
    </label>
    <label class="date-filter-field">
      <span>End</span>
      <input type="date" data-custom-end value="${state.customEnd || state.periodAnchor || localDate()}" />
    </label>
  </div>
`;

const periodLabelForDate = (dateValue) => {
  const date = new Date(`${normalizeDate(dateValue)}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

const formatDateLabel = (dateValue) => periodLabelForDate(dateValue);

const formatAmountLabel = (value) => formatCurrency(normalizeAmount(value));

const populateBulkEditCategoryOptions = () => {
  if (!(elements.bulkEditCategory instanceof HTMLSelectElement)) return;
  const options = ['<option value="">Leave unchanged</option>']
    .concat(
      getCategoryOptions().map(
        (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
      )
    )
    .join("");
  elements.bulkEditCategory.innerHTML = options;
};

const renderTransactionsSummary = (items) => {
  if (!elements.transactionsSummary) return;

  const summary = computeSummary(items);
  const categoryRows = aggregateItems(
    items,
    (item) => normalizeCategoryLabel(item.category),
    (item) => item.type === "expense"
  );
  const sourceRows = aggregateItems(items, (item) => item.source || "Cash");
  const dates = items
    .map((item) => normalizeDate(item.date))
    .filter(Boolean)
    .sort((a, b) => new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`));
  const firstDate = dates[0] ? periodLabelForDate(dates[0]) : "—";
  const lastDate = dates.length ? periodLabelForDate(dates[dates.length - 1]) : "—";
  const topCategory = categoryRows[0];
  const topSource = sourceRows[0];

  const setText = (selector, value) => {
    const node = elements.transactionsSummary.querySelector(selector);
    if (node) node.textContent = value;
  };

  setText("[data-summary-total]", `${items.length}`);
  setText("[data-summary-income]", formatCurrency(summary.income));
  setText("[data-summary-spending]", formatCurrency(summary.expenses));
  setText("[data-summary-net]", formatCurrency(summary.net));
  setText("[data-summary-review]", `${summary.reviewCount}`);
  setText(
    "[data-summary-category]",
    topCategory ? `${topCategory.label} · ${formatCurrency(topCategory.amount)}` : "—"
  );
  setText(
    "[data-summary-source]",
    topSource ? `${topSource.label} · ${topSource.count} item${topSource.count === 1 ? "" : "s"}` : "—"
  );
  setText("[data-summary-first]", firstDate);
  setText("[data-summary-last]", lastDate);

  const netNode = elements.transactionsSummary.querySelector("[data-summary-net]");
  if (netNode) {
    netNode.classList.toggle("positive", summary.net > 0);
    netNode.classList.toggle("negative", summary.net < 0);
    netNode.classList.toggle("neutral", summary.net === 0);
  }
};

const focusNextWarningItem = (items = filteredItems()) => {
  const warningItems = sortItems(items).filter((item) => Boolean(item.issue));
  if (!warningItems.length) return;
  const currentIndex = warningItems.findIndex((item) => item.id === state.activeWarningId);
  const nextItem = warningItems[(currentIndex + 1) % warningItems.length] || warningItems[0];
  state.activeWarningId = nextItem.id;
  renderReviewBanner();
  openItemDetailModal(nextItem.id);
};

const focusAdjacentWarningItem = (direction = 1, items = filteredItems()) => {
  const warningItems = sortItems(items).filter((item) => Boolean(item.issue));
  if (!warningItems.length) return;
  const currentIndex = warningItems.findIndex((item) => item.id === state.selectedItemId || item.id === state.activeWarningId);
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + warningItems.length) % warningItems.length;
  const nextItem = warningItems[nextIndex] || warningItems[0];
  state.activeWarningId = nextItem.id;
  renderReviewBanner();
  openItemDetailModal(nextItem.id);
};

const syncTransactionsSearchInput = () => {
  if (!(elements.transactionsSearchInput instanceof HTMLInputElement)) return;
  elements.transactionsSearchInput.value = state.query;
};

const syncTransactionsSearchControls = () => {
  syncTransactionsSearchInput();
  if (elements.transactionsSearchClear) {
    elements.transactionsSearchClear.hidden = !state.query;
  }
  if (elements.transactionsSearchPopover) {
    elements.transactionsSearchPopover.hidden = !state.transactionsSearchOpen;
  }
  if (elements.transactionsSearchTrigger) {
    elements.transactionsSearchTrigger.setAttribute(
      "aria-expanded",
      state.transactionsSearchOpen ? "true" : "false"
    );
  }
};

const openTransactionsSearchPopover = () => {
  state.transactionsSearchOpen = true;
  syncTransactionsSearchControls();
  window.setTimeout(() => elements.transactionsSearchInput?.focus(), 0);
};

const closeTransactionsSearchPopover = () => {
  state.transactionsSearchOpen = false;
  syncTransactionsSearchControls();
};

const syncTransactionsAddMenu = () => {
  if (!elements.transactionsAddMenu) return;
  elements.transactionsAddMenu.classList.toggle("is-open", state.transactionsAddMenuOpen);
  const panel = elements.transactionsAddMenu.querySelector(".transactions-add-menu__panel");
  if (panel instanceof HTMLElement) {
    panel.hidden = !state.transactionsAddMenuOpen;
  }
  if (elements.transactionsAdd) {
    elements.transactionsAdd.setAttribute("aria-expanded", state.transactionsAddMenuOpen ? "true" : "false");
    elements.transactionsAdd.title = state.transactionsAddMenuOpen ? "Close add menu" : "Open add menu";
  }
};

const syncTransactionsDownloadMenu = () => {
  if (!elements.transactionsDownloadMenu) return;
  elements.transactionsDownloadMenu.classList.toggle("is-open", state.transactionsDownloadMenuOpen);
  const panel = elements.transactionsDownloadMenu.querySelector(".transactions-download-menu__panel");
  if (panel instanceof HTMLElement) {
    panel.hidden = !state.transactionsDownloadMenuOpen;
  }
  if (elements.transactionsDownload) {
    elements.transactionsDownload.setAttribute("aria-expanded", state.transactionsDownloadMenuOpen ? "true" : "false");
    elements.transactionsDownload.title = state.transactionsDownloadMenuOpen ? "Close download menu" : "Open download menu";
  }
};

const closeTransactionsDownloadMenu = () => {
  if (!state.transactionsDownloadMenuOpen) return;
  state.transactionsDownloadMenuOpen = false;
  syncTransactionsDownloadMenu();
};

const toggleTransactionsDownloadMenu = () => {
  state.transactionsDownloadMenuOpen = !state.transactionsDownloadMenuOpen;
  syncTransactionsDownloadMenu();
};

const closeTransactionsAddMenu = () => {
  if (!state.transactionsAddMenuOpen) return;
  state.transactionsAddMenuOpen = false;
  syncTransactionsAddMenu();
};

const toggleTransactionsAddMenu = () => {
  state.transactionsAddMenuOpen = !state.transactionsAddMenuOpen;
  syncTransactionsAddMenu();
};

const syncTransactionsPanelState = () => {
  if (elements.transactionsLayout) {
    elements.transactionsLayout.classList.toggle("transactions-layout--summary-open", state.transactionsSummaryOpen);
  }
  if (elements.transactionsSummaryPanel) {
    elements.transactionsSummaryPanel.hidden = !state.transactionsSummaryOpen;
  }
  if (elements.transactionsSummaryToggle) {
    elements.transactionsSummaryToggle.setAttribute("aria-expanded", state.transactionsSummaryOpen ? "true" : "false");
    elements.transactionsSummaryToggle.setAttribute(
      "aria-label",
      state.transactionsSummaryOpen ? "Hide transaction summary" : "Show transaction summary"
    );
    elements.transactionsSummaryToggle.title = state.transactionsSummaryOpen ? "Hide summary" : "Show summary";
  }
};

const openTransactionsImportModal = () => {
  if (!elements.transactionsImportModal) return;
  elements.transactionsImportModal.hidden = false;
  refreshModalState();
  window.setTimeout(() => elements.transactionsImportChoose?.focus(), 0);
};

const closeTransactionsImportModal = () => {
  if (!elements.transactionsImportModal) return;
  elements.transactionsImportModal.hidden = true;
  refreshModalState();
};

const openBulkEditModal = () => {
  if (!elements.bulkEditModal) return;
  if (!state.selectedItemIds.length) return;
  populateBulkEditCategoryOptions();

  const selectedItems = state.items.filter((item) => state.selectedItemIds.includes(item.id));
  const uniqueValues = (getter) => [...new Set(selectedItems.map(getter).filter(Boolean))];

  if (elements.bulkEditCount) {
    elements.bulkEditCount.textContent = `${selectedItems.length} selected`;
  }
  if (elements.bulkEditCopy) {
    elements.bulkEditCopy.textContent = `Apply the same changes to ${selectedItems.length} selected transaction${selectedItems.length === 1 ? "" : "s"}.`;
  }

  if (elements.bulkEditType instanceof HTMLSelectElement) {
    const types = uniqueValues((item) => item.type);
    elements.bulkEditType.value = types.length === 1 ? types[0] : "";
  }
  if (elements.bulkEditSource instanceof HTMLInputElement) {
    const sources = uniqueValues((item) => item.source || "Cash");
    elements.bulkEditSource.value = sources.length === 1 ? sources[0] : "";
  }
  if (elements.bulkEditCategory instanceof HTMLSelectElement) {
    const categories = uniqueValues((item) => normalizeCategoryLabel(item.category));
    elements.bulkEditCategory.value = categories.length === 1 ? categories[0] : "";
  }
  if (elements.bulkEditNotes instanceof HTMLTextAreaElement) {
    const notes = uniqueValues((item) => String(item.notes || "").trim());
    elements.bulkEditNotes.value = notes.length === 1 ? notes[0] : "";
  }
  if (elements.bulkEditTags instanceof HTMLInputElement) {
    const tags = uniqueValues((item) => normalizeTagsValue(item.tags || ""));
    elements.bulkEditTags.value = tags.length === 1 ? tags[0] : "";
  }
  if (elements.bulkEditTagsMode instanceof HTMLSelectElement) {
    elements.bulkEditTagsMode.value = "append";
  }

  elements.bulkEditModal.hidden = false;
  refreshModalState();
  window.setTimeout(() => elements.bulkEditType?.focus(), 0);
};

const closeBulkEditModal = () => {
  if (!elements.bulkEditModal) return;
  elements.bulkEditModal.hidden = true;
  refreshModalState();
};

const submitBulkEdit = async (event) => {
  event.preventDefault();
  if (!state.selectedItemIds.length) {
    closeBulkEditModal();
    return;
  }

  const data = Object.fromEntries(new FormData(elements.bulkEditForm).entries());
  const patch = {};
  if (data.type) patch.type = data.type;
  if (data.source && String(data.source).trim()) patch.source = String(data.source).trim();
  if (data.category) patch.category = String(data.category).trim();
  if (data.notes && String(data.notes).trim()) patch.notes = String(data.notes).trim();
  if (!Object.keys(patch).length) {
    closeBulkEditModal();
    return;
  }

  const selected = new Set(state.selectedItemIds);
  const tagMode = String(data.tagsMode || "append");
  const tagValues = normalizeTagsValue(data.tags);
  pushHistorySnapshot();
  state.items = state.items.map((item) => {
    if (!selected.has(item.id)) return item;
    const next = { ...item, ...patch };
    if (tagValues) {
      next.tags = mergeTags(item.tags || "", tagValues, tagMode);
    }
    return next;
  });
  await saveItems();
  closeBulkEditModal();
  renderAll();
  recordActivity({
    title: "Bulk edited transactions",
    detail: `${selected.size} item${selected.size === 1 ? "" : "s"} updated`,
    kind: "info",
  });
};

const matchesSharedFilters = (item) => {
  if (state.filter === "income" && item.type !== "income") return false;
  if (state.filter === "expense" && item.type !== "expense") return false;
  if (state.filter === "review" && !item.issue) return false;
  if (Array.isArray(state.categoryFilters) && state.categoryFilters.length > 0) {
    const activeCategories = new Set(state.categoryFilters.map((category) => normalizeText(category)));
    if (!activeCategories.has(normalizeText(item.category))) return false;
  } else if (state.categoryFilter !== "all" && normalizeText(item.category) !== normalizeText(state.categoryFilter)) return false;
  if (Array.isArray(state.sourceFilters) && state.sourceFilters.length > 0) {
    const activeSources = new Set(state.sourceFilters.map((source) => normalizeText(source)));
    if (!activeSources.has(normalizeText(item.source))) return false;
  } else if (state.sourceFilter !== "all" && normalizeText(item.source) !== normalizeText(state.sourceFilter)) return false;
  if (state.typeFilter !== "all" && normalizeText(item.type) !== normalizeText(state.typeFilter)) return false;
  const amount = Number(item.amount) || 0;
  if (state.amountMinFilter !== "" && amount < Number(state.amountMinFilter)) return false;
  if (state.amountMaxFilter !== "" && amount > Number(state.amountMaxFilter)) return false;
  if (state.query) {
    const query = normalizeText(state.query);
    const haystack = normalizeText(`${item.merchant} ${item.category} ${item.source || ""} ${item.notes || ""} ${item.tags || ""}`);
    if (!haystack.includes(query)) return false;
  }
  return true;
};

const filteredItemsForBounds = (bounds) => {
  const startTime = bounds.start ? bounds.start.getTime() : null;
  const endTime = bounds.end ? bounds.end.getTime() : null;

  return state.items.filter((item) => {
    const itemTime = new Date(`${normalizeDate(item.date)}T12:00:00`).getTime();
    if (
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      (itemTime < startTime || itemTime > endTime)
      ) {
      return false;
    }

    return matchesSharedFilters(item);
  });
};

const filteredItems = () => filteredItemsForBounds(periodBounds());

const sortItems = (items) => {
  const sorted = [...items];
  const dateValue = (item) => new Date(`${normalizeDate(item.date)}T12:00:00`).getTime();

  sorted.sort((a, b) => {
    switch (state.sortBy) {
      case "amount-desc":
        return Number(b.amount) - Number(a.amount);
      case "amount-asc":
        return Number(a.amount) - Number(b.amount);
      case "merchant-asc":
        return a.merchant.localeCompare(b.merchant);
      case "merchant-desc":
        return b.merchant.localeCompare(a.merchant);
      case "source-asc":
        return String(a.source || "").localeCompare(String(b.source || ""));
      case "source-desc":
        return String(b.source || "").localeCompare(String(a.source || ""));
      case "type-asc":
        return String(a.type || "").localeCompare(String(b.type || ""));
      case "type-desc":
        return String(b.type || "").localeCompare(String(a.type || ""));
      case "category-asc":
        return String(a.category || "").localeCompare(String(b.category || ""));
      case "category-desc":
        return String(b.category || "").localeCompare(String(a.category || ""));
      case "date-asc":
        return dateValue(a) - dateValue(b);
      default:
        return dateValue(b) - dateValue(a);
    }
  });

  return sorted;
};

const categoryToneForItem = (item) => {
  const type = normalizeText(item.type || "");
  if (type === "income") return "income";
  if (type === "transfer") return "transfer";
  return categoryDefinitionForLabel(item.category).tone;
};

const categoryClassForItem = (item) => categoryToneForItem(item);

const categoryIconForItem = (item) => {
  const type = normalizeText(item.type || "");
  if (type === "income") return "income";
  if (type === "transfer") return "transfer";
  return categoryDefinitionForLabel(item.category).icon;
};

const sourceToneForItem = (item) => {
  const source = normalizeText(item.source || "");
  if (!source || source === "cash") return "cash";
  if (source.includes("wise")) return "wise";
  if (source.includes("bpi")) return "bpi";
  if (source.includes("bdo")) return "bdo";
  if (source.includes("rcbc")) return "rcbc";
  if (source.includes("unionbank") || source.includes("union bank")) return "unionbank";
  if (source.includes("hsbc")) return "hsbc";
  if (source.includes("pnb") || source.includes("philippine national bank")) return "pnb";
  if (source.includes("ps bank") || source.includes("psbank")) return "psbank";
  if (source.includes("metrobank")) return "metrobank";
  if (source.includes("security bank")) return "securitybank";
  if (source.includes("landbank") || source.includes("land bank")) return "landbank";
  if (source.includes("eastwest") || source.includes("east west")) return "eastwest";
  if (source.includes("chinabank") || source.includes("china bank")) return "chinabank";
  if (source.includes("maybank")) return "maybank";
  if (source.includes("cimb")) return "cimb";
  if (source.includes("gcash")) return "gcash";
  if (source.includes("maya") || source.includes("paymaya")) return "maya";
  if (source.includes("paypal")) return "paypal";
  if (source.includes("grab")) return "grab";
  if (source.includes("shopee")) return "shopee";
  if (source.includes("lazada")) return "lazada";
  return "default";
};

const focusWarningItem = (id) => {
  const node = elements.list.querySelector(`[data-id="${id}"]`);
  if (node) {
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }
};

const getSourceOptions = () => {
  const sources = new Set(["Cash"]);
  for (const item of state.items) {
    const source = String(item.source || "").trim();
    if (source) sources.add(source);
  }
  return [...sources].sort((a, b) => a.localeCompare(b));
};

const getSourceSelectMarkup = (selectedSource = "Cash") => {
  const sources = getSourceOptions();
  const current = String(selectedSource || "Cash").trim() || "Cash";
  const options = [];
  const normalized = sources.map((source) => normalizeText(source));
  for (const source of sources) {
    options.push(`<option value="${escapeHtml(source)}"${normalizeText(source) === normalizeText(current) ? " selected" : ""}>${escapeHtml(source)}</option>`);
  }
  if (!normalized.includes(normalizeText(current))) {
    options.push(`<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`);
  }
  options.push('<option value="__custom__">Add source...</option>');
  return options.join("");
};

const getCategoryOptions = () => CATEGORY_DEFINITIONS.map((definition) => definition.label);

const syncSourceOptions = () => {
  const optionsMarkup = getSourceOptions()
    .map((source) => `<option value="${escapeHtml(source)}"></option>`)
    .join("");
  if (elements.sourceOptions) {
    elements.sourceOptions.innerHTML = optionsMarkup;
  }
  if (elements.sourceFilter) {
    elements.sourceFilter.innerHTML = ['<option value="all">All sources</option>', optionsMarkup].join("");
    if (state.sourceFilter && [...elements.sourceFilter.options].some((option) => option.value === state.sourceFilter)) {
      elements.sourceFilter.value = state.sourceFilter;
    }
  }
};

const positionColumnFilterTray = () => {
  if (!elements.columnFilterTray || elements.columnFilterTray.hidden) return;
  const panel = elements.columnFilterTray.closest(".transactions-table-panel");
  const active = state.activeColumnFilter || "";
  const anchor =
    active === "category"
      ? elements.categoryFilterButton?.closest(".line-item-header-cell--category-header") || elements.categorySortButton?.closest(".line-item-header-cell--category-header")
      : elements.accountFilterButton?.closest(".line-item-header-cell--account-header") || elements.accountSortButton?.closest(".line-item-header-cell--account-header");
  if (!(panel instanceof HTMLElement) || !(anchor instanceof HTMLElement)) return;

  const panelRect = panel.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const left = Math.max(12, anchorRect.left - panelRect.left - 6);
  const top = Math.max(0, anchorRect.bottom - panelRect.top + 8);
  const width = Math.min(560, Math.max(360, panelRect.right - anchorRect.left - 18));

  elements.columnFilterTray.style.position = "absolute";
  elements.columnFilterTray.style.left = `${left}px`;
  elements.columnFilterTray.style.top = `${top}px`;
  elements.columnFilterTray.style.width = `${width}px`;
};

const renderColumnFilterTray = () => {
  if (!elements.columnFilterTray) return;

  const active = state.activeColumnFilter || "";
  const closeButton = `<button class="icon-button icon-button--nav" type="button" data-column-filter-close aria-label="Close column filter">×</button>`;
  const trayBody = (() => {
    switch (active) {
      case "source": {
        const sources = getSourceOptions();
        const selectedSources = new Set(Array.isArray(state.sourceFilters) ? state.sourceFilters.map((source) => normalizeText(source)) : []);
        const isAllActive = selectedSources.size === 0;
        const sourceMarkup = sources
          .map((source) => {
            const selected = selectedSources.has(normalizeText(source));
            return `
              <label class="column-filter-check column-filter-check--source">
                <input type="checkbox" data-source-filter-value="${escapeHtml(source)}"${selected ? " checked" : ""} />
                <span class="source-chip source-chip--${sourceToneForItem({ source })}" style="${escapeHtml(sourceChipStyleForLabel(source))}">${escapeHtml(source)}</span>
              </label>
            `;
          })
          .join("");
        return `
          <div class="column-filter-actions">
            <button class="button button-secondary button-small" type="button" data-source-filter-select-all>Select all</button>
            <button class="button button-secondary button-small" type="button" data-source-filter-deselect-all>Deselect all</button>
          </div>
          <div class="column-filter-checks">
            ${sourceMarkup}
          </div>
        `;
      }
      case "type":
        return `
          <label class="column-filter field-inline">
            <span>Type</span>
            <select data-column-type-filter>
              <option value="all">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
            </select>
          </label>
        `;
      case "category": {
        const categories = getCategoryOptions();
        const selectedCategories = new Set(Array.isArray(state.categoryFilters) ? state.categoryFilters.map((category) => normalizeText(category)) : []);
        const categoryMarkup = categories
          .map((category) => {
            const selected = selectedCategories.has(normalizeText(category));
            return `
              <label class="column-filter-check column-filter-check--source">
                <input type="checkbox" data-category-filter-value="${escapeHtml(category)}"${selected ? " checked" : ""} />
                <span class="source-chip source-chip--default">${escapeHtml(category)}</span>
              </label>
            `;
          })
          .join("");
        return `
          <div class="column-filter-actions">
            <button class="button button-secondary button-small" type="button" data-category-filter-select-all>Select all</button>
            <button class="button button-secondary button-small" type="button" data-category-filter-deselect-all>Deselect all</button>
          </div>
          <div class="column-filter-checks">
            ${categoryMarkup}
          </div>
        `;
      }
      case "amount":
        return `
          <div class="column-filter-range">
            <label class="field-inline">
              <span>Min amount</span>
              <input data-column-amount-min type="number" step="0.01" min="0" placeholder="Min amount" />
            </label>
            <label class="field-inline">
              <span>Max amount</span>
              <input data-column-amount-max type="number" step="0.01" min="0" placeholder="Max amount" />
            </label>
          </div>
        `;
      default:
        return "";
    }
  })();

  if (!active) {
    elements.columnFilterTray.hidden = true;
    elements.columnFilterTray.innerHTML = "";
    return;
  }

  elements.columnFilterTray.hidden = false;
  elements.columnFilterTray.innerHTML = `
    <div class="column-filter-tray__inner">
      <div class="column-filter-tray__head">
        <strong>${escapeHtml(active[0].toUpperCase() + active.slice(1))} filter</strong>
        ${closeButton}
      </div>
      ${trayBody}
    </div>
  `;
  positionColumnFilterTray();

  const typeSelect = elements.columnFilterTray.querySelector("[data-column-type-filter]");
  const amountMin = elements.columnFilterTray.querySelector("[data-column-amount-min]");
  const amountMax = elements.columnFilterTray.querySelector("[data-column-amount-max]");
  const sourceSelectAll = elements.columnFilterTray.querySelector("[data-source-filter-select-all]");
  const sourceDeselectAll = elements.columnFilterTray.querySelector("[data-source-filter-deselect-all]");
  const categorySelectAll = elements.columnFilterTray.querySelector("[data-category-filter-select-all]");
  const categoryDeselectAll = elements.columnFilterTray.querySelector("[data-category-filter-deselect-all]");

  const selectedSources = () => Array.isArray(state.sourceFilters) ? [...state.sourceFilters] : [];
  const setSelectedSources = (sources) => {
    state.sourceFilters = [...new Set(sources.map((source) => String(source || "").trim()).filter(Boolean))];
    state.sourceFilter = state.sourceFilters[0] || "all";
    renderLineItems();
    renderDateFilterUI();
  };

  if (sourceSelectAll instanceof HTMLButtonElement) {
    sourceSelectAll.addEventListener("click", () => {
      setSelectedSources(getSourceOptions());
    });
  }
  if (sourceDeselectAll instanceof HTMLButtonElement) {
    sourceDeselectAll.addEventListener("click", () => {
      setSelectedSources([]);
    });
  }

  elements.columnFilterTray.querySelectorAll("[data-source-filter-value]").forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.addEventListener("change", () => {
      const value = checkbox.dataset.sourceFilterValue || "";
      const next = new Set(selectedSources());
      if (checkbox.checked) next.add(value);
      else next.delete(value);
      setSelectedSources([...next]);
    });
  });

  const selectedCategories = () => Array.isArray(state.categoryFilters) ? [...state.categoryFilters] : [];
  const setSelectedCategories = (categories) => {
    state.categoryFilters = [...new Set(categories.map((category) => normalizeCategoryLabel(category)).filter(Boolean))];
    state.categoryFilter = state.categoryFilters[0] || "all";
    if (elements.categoryFilter) {
      elements.categoryFilter.value = state.categoryFilter;
    }
    renderLineItems();
    renderDateFilterUI();
  };

  if (categorySelectAll instanceof HTMLButtonElement) {
    categorySelectAll.addEventListener("click", () => {
      setSelectedCategories(getCategoryOptions());
    });
  }
  if (categoryDeselectAll instanceof HTMLButtonElement) {
    categoryDeselectAll.addEventListener("click", () => {
      setSelectedCategories([]);
    });
  }

  elements.columnFilterTray.querySelectorAll("[data-category-filter-value]").forEach((checkbox) => {
    if (!(checkbox instanceof HTMLInputElement)) return;
    checkbox.addEventListener("change", () => {
      const value = checkbox.dataset.categoryFilterValue || "";
      const next = new Set(selectedCategories());
      if (checkbox.checked) next.add(value);
      else next.delete(value);
      setSelectedCategories([...next]);
    });
  });

  if (typeSelect instanceof HTMLSelectElement) {
    typeSelect.value = state.typeFilter || "all";
    typeSelect.addEventListener("change", () => {
      state.typeFilter = typeSelect.value || "all";
      renderLineItems();
    });
  }
  if (amountMin instanceof HTMLInputElement) {
    amountMin.value = state.amountMinFilter || "";
    amountMin.addEventListener("input", () => {
      state.amountMinFilter = amountMin.value || "";
      renderLineItems();
    });
  }
  if (amountMax instanceof HTMLInputElement) {
    amountMax.value = state.amountMaxFilter || "";
    amountMax.addEventListener("input", () => {
      state.amountMaxFilter = amountMax.value || "";
      renderLineItems();
    });
  }

  elements.columnFilterTray.querySelector("[data-column-filter-close]")?.addEventListener("click", () => {
    state.activeColumnFilter = "";
    renderDateFilterUI();
  });
};

const updateItemField = async (id, patch) => {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  pushHistorySnapshot();
  const previousCategory = item.category;
  Object.assign(item, patch);
  if (patch.type === "income" && (!patch.category || normalizeCategoryLabel(patch.category) === normalizeCategoryLabel(previousCategory))) {
    item.category = "Income";
  }
  if (patch.type === "transfer" && (!patch.category || normalizeCategoryLabel(patch.category) === normalizeCategoryLabel(previousCategory))) {
    item.category = "Transfers";
  }
  if (item.category && !item.category.trim()) item.category = defaultCategoryLabel;
  if (item.source !== undefined) {
    item.source = String(item.source || "").trim() || "Cash";
  }
  if (item.merchant !== undefined) {
    item.merchant = String(item.merchant || "").trim() || "Imported Item";
  }
  if (item.amount !== undefined) {
    item.amount = Math.max(0, Number(item.amount) || 0);
  }
  await saveItems();
  if (state.selectedItemId === id) {
    renderItemDetail(item);
  }
  renderAll();
};

const renderReviewBanner = () => {};

const renderDateFilterUI = () => {
  elements.sortHeaders.forEach((button) => {
    const field = button.dataset.sortField;
    const activeField = state.sortBy.split("-")[0];
    const activeDirection = state.sortBy.endsWith("asc") ? "asc" : "desc";
    button.classList.toggle("is-active", field === activeField);
    button.dataset.sortDirection = field === activeField ? activeDirection : "";
  });
  if (elements.dateFilterTrigger) {
    const bounds = periodBounds();
    if (elements.dateFilterTriggerLabel) {
      elements.dateFilterTriggerLabel.textContent = bounds.label;
    }
    elements.dateFilterTrigger.title = `Adjust date range. Current range: ${bounds.label}`;
    elements.dateFilterTrigger.setAttribute("aria-label", `Adjust date range. Current range: ${bounds.label}`);
  }
  if (elements.dateFilterSummary) {
    elements.dateFilterSummary.textContent = periodBounds().label;
  }
  if (elements.analyticsDateTrigger) {
    const bounds = periodBounds();
    if (elements.analyticsDateTriggerLabel) {
      elements.analyticsDateTriggerLabel.textContent = bounds.label;
    }
    elements.analyticsDateTrigger.title = `Adjust date range. Current range: ${bounds.label}`;
    elements.analyticsDateTrigger.setAttribute("aria-label", `Adjust date range. Current range: ${bounds.label}`);
  }
  if (elements.dateFilterPanel) {
    const isCustom = state.period === "custom";
    const relativeActive = !isCustom;
    const tabButtons = elements.dateFilterTabs;
    tabButtons.forEach((button) => {
      const active = button.dataset.dateTab === (isCustom ? "custom" : "relative");
      button.classList.toggle("is-active", active);
    });
    elements.dateFilterPanel.innerHTML = isCustom ? renderDateFilterCustomControls() : renderDateFilterRelativeControls();
    const currentModeButton = elements.dateFilterPanel.querySelector(`[data-period-choice="${state.period === "custom" ? state.periodBeforeCustom || "ltd" : state.period}"]`);
    if (currentModeButton) currentModeButton.classList.add("is-active");
    if (!relativeActive) {
      const customStart = elements.dateFilterPanel.querySelector("[data-custom-start]");
      if (customStart instanceof HTMLInputElement) customStart.focus({ preventScroll: true });
    }
  }
  if (elements.bulkDelete) {
    elements.bulkDelete.hidden = selectedCount() === 0;
  }
  if (elements.clearSelection) {
    elements.clearSelection.hidden = selectedCount() === 0;
  }
  if (elements.selectAll) {
    const allSelected = state.items.length > 0 && selectedCount() === state.items.length;
    const someSelected = selectedCount() > 0 && !allSelected;
    elements.selectAll.checked = allSelected;
    elements.selectAll.indeterminate = someSelected;
  }
  renderColumnFilterTray();
};

const openDateFilterModal = () => {
  renderDateFilterUI();
  if (elements.dateFilterModal) {
    elements.dateFilterModal.hidden = false;
    refreshModalState();
    window.setTimeout(() => {
      const activeChip =
        elements.dateFilterPanel?.querySelector(".date-filter-chip.is-active") ||
        elements.dateFilterPanel?.querySelector(".date-filter-chip");
      if (activeChip instanceof HTMLElement) activeChip.focus();
    }, 0);
  }
};

const closeDateFilterModal = () => {
  if (elements.dateFilterModal) {
    elements.dateFilterModal.hidden = true;
    refreshModalState();
  }
};

const resetDateFilter = () => {
  state.period = "ltd";
  state.periodBeforeCustom = "ltd";
  state.periodAnchor = "";
  state.periodYear = "";
  state.periodMonth = "";
  state.periodQuarter = "";
  state.periodWeekIndex = "";
  state.customStart = "";
  state.customEnd = "";
  renderAll();
};

const updateScrollTopFab = () => {
  if (!elements.scrollTopFab) return;
  const scroller = state.screen === "line-items" && elements.tableWrap ? elements.tableWrap : window;
  const scrollTop = scroller === window ? window.scrollY : scroller.scrollTop;
  const show = state.screen === "line-items" && scrollTop > 180;
  elements.scrollTopFab.hidden = !show;
};

const showPdfPasswordModal = (file, index = 1, total = 1) => {
  state.pendingPdfFile = file;
  state.pendingPdfQueueIndex = index;
  state.pendingPdfQueueTotal = total;
  elements.pdfPasswordError.hidden = true;
  elements.pdfPasswordError.textContent = "";
  elements.pdfPasswordCopy.textContent = `Enter the PDF password for ${file.name}.`;
  if (elements.pdfPasswordQueue) {
    elements.pdfPasswordQueue.hidden = false;
    elements.pdfPasswordQueue.textContent =
      total > 1 ? `Protected file ${index} of ${total} · ${file.name}` : `Protected file · ${file.name}`;
  }
  elements.pdfPasswordInput.value = "";
  elements.pdfPasswordModal.hidden = false;
  refreshModalState();
  window.setTimeout(() => elements.pdfPasswordInput.focus(), 0);
};

const showNextPendingPdf = () => {
  const nextFile = state.pendingPdfQueue.shift();
  if (nextFile) {
    const index = Math.max(1, state.pendingPdfQueueTotal - state.pendingPdfQueue.length);
    showPdfPasswordModal(nextFile, index, state.pendingPdfQueueTotal);
    return true;
  }
  return false;
};

const hidePdfPasswordModal = (clearQueue = true) => {
  state.pendingPdfFile = null;
  state.pendingPdfQueueIndex = 0;
  state.pendingPdfQueueTotal = 0;
  if (clearQueue) {
    state.pendingPdfQueue = [];
  }
  elements.pdfPasswordModal.hidden = true;
  elements.pdfPasswordError.hidden = true;
  elements.pdfPasswordError.textContent = "";
  if (elements.pdfPasswordQueue) {
    elements.pdfPasswordQueue.hidden = true;
    elements.pdfPasswordQueue.textContent = "";
  }
  elements.pdfPasswordInput.value = "";
  refreshModalState();
};

const showPdfPasswordError = (message) => {
  elements.pdfPasswordError.textContent = message;
  elements.pdfPasswordError.hidden = false;
};

const refreshModalState = () => {
  const open = [
    elements.pdfPasswordModal,
    elements.manualEntryModal,
    elements.itemDetailModal,
    elements.dateFilterModal,
    elements.bulkEditModal,
    elements.transactionsImportModal,
  ].some(
    (modal) => modal && !modal.hidden
  );
  document.body.classList.toggle("modal-open", open);
};

const positionSourcePopover = (anchor) => {
  if (!elements.sourceModal || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const popoverWidth = Math.max(220, Math.min(240, window.innerWidth - 24));
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - popoverWidth - 12));
  const top = Math.min(rect.bottom + 10, window.innerHeight - 24);
  elements.sourceModal.style.position = "fixed";
  elements.sourceModal.style.left = `${left}px`;
  elements.sourceModal.style.top = `${Math.max(12, top)}px`;
  elements.sourceModal.style.width = `${popoverWidth}px`;
};

const openSourceModal = (itemId, sourceValue = "Cash", anchor = null) => {
  state.pendingSourceTarget = {
    itemId,
    previousSource: sourceValue || "Cash",
  };
  if (elements.sourceInput) {
    elements.sourceInput.value = "";
    elements.sourceInput.placeholder = "Add source...";
    window.setTimeout(() => elements.sourceInput?.focus(), 0);
  }
  if (elements.sourceError) {
    elements.sourceError.hidden = true;
    elements.sourceError.textContent = "";
  }
  if (elements.sourceModal) {
    elements.sourceModal.hidden = false;
    window.setTimeout(() => positionSourcePopover(anchor), 0);
  }
};

const closeSourceModal = () => {
  state.pendingSourceTarget = null;
  if (elements.sourceModal) {
    elements.sourceModal.hidden = true;
    elements.sourceModal.style.left = "";
    elements.sourceModal.style.top = "";
    elements.sourceModal.style.width = "";
    refreshModalState();
  }
  if (elements.sourceInput) {
    elements.sourceInput.value = "";
  }
  if (elements.sourceError) {
    elements.sourceError.hidden = true;
    elements.sourceError.textContent = "";
  }
};

const populateForm = (item = null) => {
  if (!item) {
    elements.form.elements.date.value = localDate();
    elements.form.elements.type.value = "expense";
    elements.form.elements.source.value = "Cash";
    elements.form.elements.category.value = "Food & Dining";
    elements.form.elements.merchant.value = "";
    elements.form.elements.amount.value = "";
    elements.form.elements.notes.value = "";
    elements.form.dataset.editingId = "";
    state.editingId = null;
    elements.form.querySelector('button[type="submit"]').textContent = "Save line item";
    if (elements.manualEntryTitle) {
      elements.manualEntryTitle.textContent = "Add a line item";
    }
    return;
  }

  state.editingId = item.id;
  elements.form.dataset.editingId = item.id;
  elements.form.elements.date.value = item.date;
  elements.form.elements.type.value = item.type;
  elements.form.elements.merchant.value = item.merchant;
  elements.form.elements.source.value = item.source || "Cash";
  elements.form.elements.amount.value = item.amount;
  elements.form.elements.category.value = item.category;
  elements.form.elements.notes.value = item.notes || "";
  elements.form.querySelector('button[type="submit"]').textContent = "Update line item";
  if (elements.manualEntryTitle) {
    elements.manualEntryTitle.textContent = "Edit a line item";
  }
};

const openManualEntryModal = (item = null) => {
  populateForm(item);
  elements.manualEntryModal.hidden = false;
  refreshModalState();
  window.setTimeout(() => elements.form.elements.merchant.focus(), 0);
};

const closeManualEntryModal = () => {
  elements.manualEntryModal.hidden = true;
  refreshModalState();
  populateForm(null);
};

const renderItemDetail = (item) => {
  if (!item) return;

  elements.itemDetailTitle.textContent = item.merchant;
  elements.itemDetailAmount.textContent = `${item.type === "income" ? "+" : item.type === "transfer" ? "↔" : "-"} ${formatCurrency(
    Number(item.amount)
  )}`;
  elements.itemDetailAmount.className = `detail-amount ${item.type === "income" ? "positive" : item.type === "transfer" ? "neutral" : "negative"}`;
  if (elements.itemDetailMerchant) elements.itemDetailMerchant.value = item.merchant || "";
  if (elements.itemDetailDate) elements.itemDetailDate.value = item.date || "";
  if (elements.itemDetailType) elements.itemDetailType.value = item.type || "expense";
  if (elements.itemDetailSource) elements.itemDetailSource.value = item.source || "Cash";
  if (elements.itemDetailAmountInput) elements.itemDetailAmountInput.value = Number(item.amount) || 0;
  if (elements.itemDetailImportedFrom) {
    elements.itemDetailImportedFrom.textContent = item.importedFrom || "Manual entry";
  }
  if (elements.itemDetailImportedAt) {
    const importedAtDate = item.importedAt ? new Date(item.importedAt) : null;
    elements.itemDetailImportedAt.textContent =
      importedAtDate && !Number.isNaN(importedAtDate.getTime())
        ? new Intl.DateTimeFormat("en-PH", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(importedAtDate)
        : "Manual entry";
  }
  if (elements.itemDetailCategory) elements.itemDetailCategory.value = normalizeCategoryLabel(item.category);
  if (elements.itemDetailNotes) elements.itemDetailNotes.value = item.notes || "";
  if (elements.itemDetailImportEvidence) {
    elements.itemDetailImportEvidence.value = item.importEvidence || item.notes || "";
  }

  if (item.issue) {
    elements.itemDetailWarningWrap.hidden = false;
    elements.itemDetailWarning.textContent = item.issue.detail;
  } else {
    elements.itemDetailWarningWrap.hidden = true;
    elements.itemDetailWarning.textContent = "";
  }
};

const bindDetailEditors = () => {
  if (bindDetailEditors.bound) return;
  bindDetailEditors.bound = true;
  const detailCommit = (field, value) => {
    if (!state.selectedItemId) return;
    updateItemField(state.selectedItemId, { [field]: value });
  };

  elements.itemDetailMerchant?.addEventListener("change", () => detailCommit("merchant", elements.itemDetailMerchant.value));
  elements.itemDetailMerchant?.addEventListener("blur", () => detailCommit("merchant", elements.itemDetailMerchant.value));
  elements.itemDetailDate?.addEventListener("change", () => detailCommit("date", elements.itemDetailDate.value));
  elements.itemDetailSource?.addEventListener("change", () => detailCommit("source", elements.itemDetailSource.value));
  elements.itemDetailSource?.addEventListener("blur", () => detailCommit("source", elements.itemDetailSource.value));
  elements.itemDetailType?.addEventListener("change", () => detailCommit("type", elements.itemDetailType.value));
  elements.itemDetailCategory?.addEventListener("change", () => detailCommit("category", elements.itemDetailCategory.value));
  elements.itemDetailAmountInput?.addEventListener("change", () => detailCommit("amount", elements.itemDetailAmountInput.value));
  elements.itemDetailAmountInput?.addEventListener("blur", () => detailCommit("amount", elements.itemDetailAmountInput.value));
  elements.itemDetailNotes?.addEventListener("change", () => detailCommit("notes", elements.itemDetailNotes.value));
  elements.itemDetailNotes?.addEventListener("blur", () => detailCommit("notes", elements.itemDetailNotes.value));
  elements.itemDetailImportEvidence?.addEventListener("change", () => detailCommit("importEvidence", elements.itemDetailImportEvidence.value));
  elements.itemDetailImportEvidence?.addEventListener("blur", () => detailCommit("importEvidence", elements.itemDetailImportEvidence.value));
  elements.itemDetailWarningWrap?.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const actionButton = target.closest("[data-warning-action]");
    if (!(actionButton instanceof HTMLButtonElement)) return;
    const action = actionButton.dataset.warningAction;
    if (!state.selectedItemId) return;
    if (action === "accept") {
      await markReviewed(state.selectedItemId);
      focusAdjacentWarningItem(1);
      return;
    }
    if (action === "delete") {
      const nextId = state.selectedItemId;
      await deleteItem(nextId);
      focusAdjacentWarningItem(1);
      return;
    }
  });
};

const openItemDetailModal = (id) => {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  state.selectedItemId = id;
  renderItemDetail(item);
  elements.itemDetailModal.hidden = false;
  refreshModalState();
};

const closeItemDetailModal = () => {
  state.selectedItemId = null;
  elements.itemDetailModal.hidden = true;
  refreshModalState();
};

const deleteSelectedItems = async () => {
  if (!state.selectedItemIds.length) return;
  const removed = state.items
    .map((item, index) => ({ item: cloneItems([item])[0], index }))
    .filter(({ item }) => state.selectedItemIds.includes(item.id));
  const ids = new Set(state.selectedItemIds);
  pushHistorySnapshot();
  state.items = state.items.filter((entry) => !ids.has(entry.id));
  if (ids.has(state.editingId)) resetForm();
  if (ids.has(state.activeWarningId)) state.activeWarningId = null;
  if (state.selectedItemId && ids.has(state.selectedItemId)) closeItemDetailModal();
  clearSelectedItems();
  await saveItems();
  renderAll();
  recordActivity(
    {
      title: "Deleted selected items",
      detail: `${removed.length} item${removed.length === 1 ? "" : "s"} removed`,
      kind: "warning",
    },
    {
      undo: async () => {
        const restored = [...removed].sort((a, b) => a.index - b.index);
        const next = cloneItems(state.items);
        for (const entry of restored) {
          next.splice(Math.min(entry.index, next.length), 0, entry.item);
        }
        state.items = next;
        await saveItems();
        renderAll();
      },
    }
  );
};

const renderLineItems = () => {
  const items = sortItems(filteredItems());
  elements.list.innerHTML = "";
  syncTransactionsSearchControls();
  syncSourceOptions();

  for (const item of items) {
    const node = elements.template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.dataset.selected = state.selectedItemIds.includes(item.id) ? "true" : "false";
    node.classList.toggle("has-issue", Boolean(item.issue));
    node.classList.toggle("is-income", item.type === "income");
    node.classList.toggle("is-transfer", item.type === "transfer");
    node.classList.toggle("is-selected", state.selectedItemIds.includes(item.id));

    const checkbox = node.querySelector(".item-select");
    const avatar = node.querySelector(".item-avatar");
    const title = node.querySelector(".item-merchant");
    const dateCell = node.querySelector(".item-date");
    const dateInput = node.querySelector(".item-date-input");
    const sourceCell = node.querySelector(".item-source-select");
    const sourceBadge = node.querySelector(".item-source-badge");
    const typeCell = node.querySelector(".item-type");
    const categoryCell = node.querySelector(".item-category-select");
    const categoryBadge = node.querySelector(".item-category-badge");
    const amount = node.querySelector(".amount");
    const warningSlot = node.querySelector(".warning-slot");
    const detailsButton = node.querySelector(".item-details-button");

    checkbox.checked = state.selectedItemIds.includes(item.id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (event) => {
      event.stopPropagation();
      toggleSelectedItem(item.id, checkbox.checked);
      renderAll();
    });
    const avatarIcon = categoryIconForItem(item);
    avatar.className = `item-avatar avatar-${avatarIcon}`;
    avatar.innerHTML = `<img src="${iconPath(avatarIcon)}" alt="" aria-hidden="true" />`;
    title.value = item.merchant;
    title.className = "item-merchant";
    const dateValue = normalizeDate(item.date);
    if (dateCell instanceof HTMLButtonElement) {
      dateCell.textContent = formatDateLabel(item.date);
      dateCell.dataset.value = dateValue;
    }
    if (dateInput instanceof HTMLInputElement) {
      dateInput.value = dateValue;
    }
    dateCell.className = "item-date";
    sourceCell.innerHTML = getSourceSelectMarkup(item.source || "Cash");
    if (sourceBadge instanceof HTMLElement) {
      sourceBadge.textContent = sourceBadgeLabelFor(item.source || "Cash");
      sourceBadge.style.cssText = sourceChipStyleForLabel(item.source || "Cash");
    }
    sourceCell.setAttribute("aria-label", "Transaction account");
    sourceCell.title = "Account";
    typeCell.value = item.type;
    typeCell.className = `item-type ${item.type === "income" ? "positive" : item.type === "transfer" ? "neutral" : "negative"}`;
    categoryCell.value = item.category;
    if (categoryBadge instanceof HTMLElement) {
      const categoryIcon = iconPath(categoryIconForItem(item));
      categoryBadge.style.maskImage = `url("${categoryIcon}")`;
      categoryBadge.style.webkitMaskImage = `url("${categoryIcon}")`;
      categoryBadge.style.color = categoryToneColorForItem(item);
    }
    categoryCell.style.color = categoryToneColorForItem(item);
    categoryCell.className = "item-category-select";
    categoryCell.setAttribute("title", item.category);
    amount.value = formatAmountLabel(item.amount);
    amount.className = `amount ${item.type === "income" ? "positive" : item.type === "transfer" ? "neutral" : "negative"}`;
    amount.dataset.raw = String(normalizeAmount(item.amount));

    const commit = (field, value) => updateItemField(item.id, { [field]: value });
    title.addEventListener("change", () => commit("merchant", title.value));
    title.addEventListener("blur", () => commit("merchant", title.value));
    const openDatePicker = async () => {
      if (dateInput instanceof HTMLInputElement) {
        if (typeof dateInput.showPicker === "function") {
          try {
            dateInput.showPicker();
            return;
          } catch {
            // fall back to click below
          }
        }
        dateInput.click();
      }
    };
    dateCell.addEventListener("click", (event) => {
      event.stopPropagation();
      openDatePicker();
    });
    dateCell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDatePicker();
      }
    });
    dateInput?.addEventListener("change", () => {
      commit("date", dateInput.value);
      if (dateCell instanceof HTMLButtonElement) {
        dateCell.textContent = formatDateLabel(dateInput.value);
        dateCell.dataset.value = dateInput.value;
      }
    });
    sourceCell.addEventListener("change", () => {
      if (sourceCell.value === "__custom__") {
        sourceCell.value = item.source || "Cash";
        openSourceModal(item.id, item.source || "Cash", sourceCell);
        return;
      }
      if (sourceBadge instanceof HTMLElement) {
        sourceBadge.textContent = sourceBadgeLabelFor(sourceCell.value);
        sourceBadge.style.cssText = sourceChipStyleForLabel(sourceCell.value);
      }
      commit("source", sourceCell.value);
    });
    typeCell.addEventListener("change", () => commit("type", typeCell.value));
    categoryCell.addEventListener("change", () => {
      if (categoryBadge instanceof HTMLElement) {
        const nextIcon = iconPath(categoryIconForItem({ ...item, category: categoryCell.value }));
        categoryBadge.style.maskImage = `url("${nextIcon}")`;
        categoryBadge.style.webkitMaskImage = `url("${nextIcon}")`;
        categoryBadge.style.color = categoryToneColorForItem({ ...item, category: categoryCell.value });
      }
      categoryCell.style.color = categoryToneColorForItem({ ...item, category: categoryCell.value });
      commit("category", categoryCell.value);
    });
    const resetAmountDisplay = () => {
      amount.value = formatAmountLabel(amount.value);
    };
    amount.addEventListener("focus", () => {
      amount.value = normalizeAmount(amount.value).toFixed(2);
      amount.select();
    });
    amount.addEventListener("change", () => commit("amount", amount.value));
    amount.addEventListener("blur", () => {
      commit("amount", amount.value);
      resetAmountDisplay();
    });

    detailsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openItemDetailModal(item.id);
    });

    if (item.issue) {
      const warningButton = document.createElement("button");
      warningButton.type = "button";
      warningButton.className = "warning-chip warning-chip-inline";
      warningButton.title = item.issue.detail || "Potential issue";
      warningButton.setAttribute("aria-label", item.issue.detail || "Potential issue");
      warningButton.innerHTML = '<span class="warning-mark" aria-hidden="true"></span>';
      warningButton.addEventListener("click", (event) => {
        event.stopPropagation();
        state.activeWarningId = item.id;
        renderReviewBanner();
        openItemDetailModal(item.id);
      });
      warningSlot.appendChild(warningButton);
    }

    node.addEventListener("click", (event) => {
      if (event.target instanceof HTMLElement && event.target.closest("button, input, select, label, textarea")) return;
      openItemDetailModal(item.id);
    });

    elements.list.appendChild(node);
  }

  const periodSummary = computeSummary(items);
  const summary = computeSummary(items);
  const visibleWarningCount = items.filter((item) => Boolean(item.issue)).length;
  renderTransactionsSummary(items);
  syncTransactionsPanelState();
  elements.listSummary.textContent = `${items.length} items shown${selectedCount() ? `, ${selectedCount()} selected` : ""}`;
  if (elements.periodNet) {
    const netValue = formatCurrency(Math.abs(periodSummary.net));
    if (periodSummary.net > 0) {
      elements.periodNet.textContent = `Net gain ${netValue}`;
      elements.periodNet.className = "pill pill-neutral";
    } else if (periodSummary.net < 0) {
      elements.periodNet.textContent = `Net loss ${netValue}`;
      elements.periodNet.className = "pill pill-warn";
    } else {
      elements.periodNet.textContent = `Net even ${netValue}`;
      elements.periodNet.className = "pill pill-neutral";
    }
  }
  if (elements.warningSummary) {
    if (visibleWarningCount > 0) {
      elements.warningSummary.hidden = false;
      elements.warningSummary.style.display = "inline-flex";
      elements.warningSummary.title = `${visibleWarningCount} warning transaction${visibleWarningCount === 1 ? "" : "s"} available for review`;
      elements.warningSummary.setAttribute("aria-label", `${visibleWarningCount} warning transaction${visibleWarningCount === 1 ? "" : "s"} available for review`);
    } else {
      elements.warningSummary.hidden = true;
      elements.warningSummary.style.display = "none";
      elements.warningSummary.title = "No warnings";
      elements.warningSummary.setAttribute("aria-label", "No warnings");
    }
  }
  renderDateFilterUI();

  if (elements.overviewMetrics) {
    elements.overviewMetrics.querySelectorAll(".metric").forEach((metric, index) => {
      if (index === 0) {
        metric.querySelector("strong").textContent = formatCurrency(summary.income);
        metric.querySelector("small").textContent = `${summary.reviewCount} items need review`;
      } else if (index === 1) {
        metric.querySelector("strong").textContent = formatCurrency(summary.expenses);
        metric.querySelector("small").textContent = "Tracked by category and source";
      } else {
        metric.querySelector("strong").textContent = formatCurrency(summary.net);
        metric.querySelector("small").textContent = `${summary.savingsRate}% savings rate`;
      }
    });
  }

  renderReviewBanner();
};

const renderActivityPanel = () => {
  if (elements.overviewActivityCount) {
    elements.overviewActivityCount.textContent = `${state.activityLog.length} item${state.activityLog.length === 1 ? "" : "s"}`;
  }
  if (!elements.overviewActivity) return;

  const entries = state.activityLog.slice(0, 8);
  if (!entries.length) {
    elements.overviewActivity.innerHTML = `<div class="empty-state">No activity yet. Imports, edits, deletes, and saves will appear here.</div>`;
    return;
  }

  const formatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  elements.overviewActivity.innerHTML = entries
    .map(
      (entry) => `
        <div class="overview-activity-item">
          <strong>${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.detail || "Recent app activity")}</span>
          <small>${escapeHtml(
            formatter.format(Number.isNaN(new Date(entry.at).getTime()) ? new Date() : new Date(entry.at))
          )}</small>
        </div>
      `
    )
    .join("");
};

const renderOverview = () => {
  if (!elements.overviewInsights || !elements.overviewTips) return;

  const summary = computeSummary(state.items);
  const expenseRows = aggregateItems(state.items, (item) => normalizeCategoryLabel(item.category), (item) => item.type === "expense");
  const sourceRows = aggregateItems(state.items, (item) => item.source || "Cash");
  const merchantRows = aggregateItems(state.items, (item) => item.merchant || "Untitled item");
  const recurring = recurringRows(state.items);
  const topCategory = expenseRows[0];
  const topSource = sourceRows[0];
  const topMerchant = merchantRows[0];
  const topRecurring = recurring[0];
  const positiveNet = summary.net > 0;
  const hasWarnings = summary.reviewCount > 0;
  const overviewInsights = [
    {
      label: positiveNet ? "Net gain" : summary.net < 0 ? "Net loss" : "Net even",
      value: `${formatCurrency(Math.abs(summary.net))} across ${state.items.length} tracked items`,
    },
    {
      label: "Savings rate",
      value: `${summary.savingsRate}% of income remains after expenses`,
    },
    {
      label: "Top category",
      value: topCategory ? `${topCategory.label} at ${formatCurrency(topCategory.amount)}` : "No expense categories yet",
    },
    {
      label: "Top source",
      value: topSource ? `${topSource.label} leads ${topSource.count} item${topSource.count === 1 ? "" : "s"}` : "No sources yet",
    },
    {
      label: "Top merchant",
      value: topMerchant ? `${topMerchant.label} at ${formatCurrency(topMerchant.amount)}` : "No merchants yet",
    },
    {
      label: "Review load",
      value: hasWarnings ? `${summary.reviewCount} item${summary.reviewCount === 1 ? "" : "s"} need review` : "No warnings right now",
    },
    {
      label: "Recurring",
      value: topRecurring
        ? `${topRecurring.label} repeats ${topRecurring.count} times`
        : "No repeated patterns detected",
    },
  ];

  const overviewTips = [];
  if (state.items.length === 0) {
    overviewTips.push(
      { label: "Start small", value: "Add a few manual transactions or import a statement to unlock insights." },
      { label: "Capture sources", value: "Tag your first items with Cash, BPI, RCBC, or Wise so reporting stays clean." }
    );
  } else {
    if (summary.reviewCount > 0) {
      overviewTips.push({
        label: "Clear warnings",
        value: `Review ${summary.reviewCount} flagged item${summary.reviewCount === 1 ? "" : "s"} so duplicates and transfer pairs don't skew totals.`,
      });
    }

    if (summary.income > 0 && Number(summary.savingsRate) < 15) {
      overviewTips.push({
        label: "Protect margin",
        value: "Your savings rate is a bit tight. Trim the biggest expense category or delay non-essential spend.",
      });
    } else if (summary.income > 0) {
      overviewTips.push({
        label: "Healthy cushion",
        value: "You're keeping a decent amount of income after expenses. Consider moving more into savings or other goals.",
      });
    }

    if (topCategory && summary.expenses > 0 && topCategory.amount / summary.expenses > 0.4) {
      overviewTips.push({
        label: "Watch the leader",
        value: `${topCategory.label} takes a large share of expenses. A small cut here could meaningfully improve cashflow.`,
      });
    }

    if (topRecurring) {
      overviewTips.push({
        label: "Check repeats",
        value: `${topRecurring.label} repeats ${topRecurring.count} times. Confirm this is intentional and cancel what you no longer need.`,
      });
    }

    if (topSource && topSource.count > 0) {
      overviewTips.push({
        label: "Source concentration",
        value: `${topSource.label} is showing up often. That is fine, but it helps to verify the source field stays consistent.`,
      });
    }
  }

  elements.overviewInsights.innerHTML = overviewInsights
    .map(
      (item) => `
        <div class="overview-panel__item">
          <strong>${item.label}</strong>
          <span>${item.value}</span>
        </div>
      `
    )
    .join("");

  elements.overviewTips.innerHTML = overviewTips.length
    ? overviewTips
        .map(
          (item) => `
            <div class="overview-panel__item">
              <strong>${item.label}</strong>
              <span>${item.value}</span>
            </div>
          `
        )
        .join("")
    : `<div class="empty-state">No tips yet. Add more transactions to surface practical guidance.</div>`;
};

const renderAnalytics = () => {
  const bounds = periodBounds();
  const analyticsItems = filteredItemsForBounds(bounds);
  const summary = computeSummary(analyticsItems);
  const previousBounds = previousPeriodBounds(bounds);
  const previousItems = previousBounds ? filteredItemsForBounds(previousBounds) : [];
  const previousSummary = previousBounds ? computeSummary(previousItems) : null;
  const buckets = buildTrendBuckets(analyticsItems, bounds, state.analyticsTrendView || "month");
  const categoryRows = aggregateItems(
    analyticsItems,
    (item) => normalizeCategoryLabel(item.category),
    (item) => item.type === "expense"
  ).slice(0, 6);
  const merchantRows = aggregateItems(analyticsItems, (item) => item.merchant || "Untitled item").slice(0, 6);
  const sourceRows = aggregateItems(analyticsItems, (item) => item.source || "Cash").slice(0, 6);
  const recurring = recurringRows(analyticsItems);
  const categoryChanges = previousItems.length ? categoryChangeRows(analyticsItems, previousItems) : [];
  const warningItems = analyticsItems.filter((item) => item.issue);
  const billsPayments = billsPaymentRows(analyticsItems);
  const moneyFlows = buildSankeyFlowData(analyticsItems);
  const topExpenseCategory = categoryRows[0];
  const topMerchant = merchantRows[0];
  const topRecurring = recurring[0];
  const netLabel = summary.net > 0 ? "Net gain" : summary.net < 0 ? "Net loss" : "Net even";
  const netClass = summary.net > 0 ? "positive" : summary.net < 0 ? "negative" : "neutral";
  const rangeLabel = bounds.label;
  const totalCategorySpend = categoryRows.reduce((sum, row) => sum + row.amount, 0);
  const categorySegments = categoryRows
    .map((row, index) => {
      const percent = totalCategorySpend ? (row.amount / totalCategorySpend) * 100 : 0;
      const color = categoryColorPalette[index % categoryColorPalette.length];
      return {
        ...row,
        color,
        percent,
      };
    })
    .filter((row) => row.percent > 0);
  const segmentOffsets = categorySegments.reduce((offsets, row) => {
    const start = offsets.reduce((sum, value) => sum + value.percent, 0);
    offsets.push({ ...row, start, end: start + row.percent });
    return offsets;
  }, []);
  const donutGradient = segmentOffsets.length
    ? segmentOffsets
        .map((segment) => `${segment.color} ${segment.start.toFixed(2)}% ${segment.end.toFixed(2)}%`)
        .join(", ")
      : "rgba(3, 168, 192, 0.12) 0% 100%";
  const totalSourceAmount = sourceRows.reduce((sum, row) => sum + row.amount, 0);
  const sourceSegments = sourceRows
    .map((row, index) => {
      const percent = totalSourceAmount ? (row.amount / totalSourceAmount) * 100 : 0;
      const color = categoryColorPalette[(index + 2) % categoryColorPalette.length];
      return {
        ...row,
        color,
        percent,
      };
    })
    .filter((row) => row.percent > 0);
  const sourceOffsets = sourceSegments.reduce((offsets, row) => {
    const start = offsets.reduce((sum, value) => sum + value.percent, 0);
    offsets.push({ ...row, start, end: start + row.percent });
    return offsets;
  }, []);
  const sourceGradient = sourceOffsets.length
    ? sourceOffsets
        .map((segment) => `${segment.color} ${segment.start.toFixed(2)}% ${segment.end.toFixed(2)}%`)
        .join(", ")
    : "rgba(3, 168, 192, 0.12) 0% 100%";
  const comparison =
    previousSummary && previousSummary.net !== undefined
      ? summary.net - previousSummary.net
      : null;

  if (elements.analyticsRange) {
    elements.analyticsRange.forEach((pill) => {
      pill.textContent = rangeLabel;
    });
  }

  if (elements.analyticsTrendView) {
    elements.analyticsTrendView.value = state.analyticsTrendView || "month";
  }

  elements.analyticsStats.innerHTML = "";
  const cards = [
    [netLabel, formatCurrency(Math.abs(summary.net)), `${summary.savingsRate}% savings rate`, netClass],
    ["Income", formatCurrency(summary.income), "All tracked income in this period", "positive"],
    ["Expenses", formatCurrency(summary.expenses), `${analyticsItems.length} items in this period`, "negative"],
    ["Review items", `${summary.reviewCount}`, `${state.items.length} total tracked items`, summary.reviewCount ? "warning" : "neutral"],
  ];

  for (const [label, value, note, tone] of cards) {
    const card = document.createElement("article");
    card.className = `metric analytics-metric ${tone ? `analytics-metric--${tone}` : ""}`;
    card.innerHTML = `<span>${label}</span><strong>${value}</strong><small>${note}</small>`;
    elements.analyticsStats.appendChild(card);
  }

  if (elements.analyticsCashflow) {
    if (!buckets.length) {
      elements.analyticsCashflow.innerHTML = `<div class="empty-state">No transactions found for this period.</div>`;
    } else {
      elements.analyticsCashflow.innerHTML = renderTrendChart(buckets);
    }
  }

  if (elements.analyticsSourceDonut) {
    if (!sourceOffsets.length) {
      elements.analyticsSourceDonut.innerHTML = `
        <div class="pie-wrap">
          <div class="pie-chart">
            <div class="pie-chart__slice" style="background: conic-gradient(rgba(3, 168, 192, 0.16) 0% 100%);"></div>
          </div>
          <div class="chart-summary-row">
            <span>Source mix</span>
            <div class="chart-summary-row__value">
              <strong>No source data</strong>
              <small>Filtered period</small>
            </div>
          </div>
        </div>
      `;
    } else {
      const leader = sourceOffsets[0];
      elements.analyticsSourceDonut.innerHTML = `
        <div class="pie-wrap">
          <div class="pie-chart">
            <div class="pie-chart__slice" style="background: conic-gradient(${sourceGradient});"></div>
          </div>
          <div class="chart-summary-row">
            <span>Total volume</span>
            <div class="chart-summary-row__value">
              <strong>${formatCurrency(totalSourceAmount)}</strong>
              <small>${leader.label} leads with ${leader.percent.toFixed(1)}%</small>
            </div>
          </div>
        </div>
      `;
    }
  }

  if (elements.analyticsSources) {
    if (!sourceOffsets.length) {
      elements.analyticsSources.innerHTML = `<div class="empty-state">No sources in this period.</div>`;
    } else {
      elements.analyticsSources.innerHTML = sourceOffsets
        .map((row) => `
          <div class="analytics-category-row">
            <span class="analytics-category-row__swatch" style="--swatch-color:${row.color}"></span>
            <div class="analytics-category-row__meta">
              <strong>${row.label}</strong>
              <small>${row.count} item${row.count === 1 ? "" : "s"}</small>
            </div>
            <div class="analytics-category-row__amount">${formatCurrency(row.amount)}</div>
            <div class="analytics-category-row__percent">${row.percent.toFixed(1)}%</div>
          </div>
        `)
        .join("");
    }
  }

  if (elements.analyticsMoneyFlows) {
    elements.analyticsMoneyFlows.innerHTML = renderSankeyFlowChart(moneyFlows);
  }

  if (elements.analyticsCategoryDonut) {
    if (!segmentOffsets.length) {
      elements.analyticsCategoryDonut.innerHTML = `
        <div class="pie-wrap">
          <div class="pie-chart">
            <div class="pie-chart__slice" style="background: conic-gradient(rgba(3, 168, 192, 0.16) 0% 100%);"></div>
          </div>
          <div class="chart-summary-row">
            <span>Category mix</span>
            <div class="chart-summary-row__value">
              <strong>No expense data</strong>
              <small>Filtered period</small>
            </div>
          </div>
        </div>
      `;
    } else {
      const leader = segmentOffsets[0];
      elements.analyticsCategoryDonut.innerHTML = `
        <div class="pie-wrap">
          <div class="pie-chart">
            <div class="pie-chart__slice" style="background: conic-gradient(${donutGradient});"></div>
          </div>
          <div class="chart-summary-row">
            <span>Total spend</span>
            <div class="chart-summary-row__value">
              <strong>${formatCurrency(totalCategorySpend)}</strong>
              <small>${leader.label} leads with ${leader.percent.toFixed(1)}%</small>
            </div>
          </div>
        </div>
      `;
    }
  }

  if (elements.analyticsCategories) {
    if (!segmentOffsets.length) {
      elements.analyticsCategories.innerHTML = `<div class="empty-state">No expense categories in this period.</div>`;
    } else {
      elements.analyticsCategories.innerHTML = segmentOffsets
        .map((row) => {
          return `
            <div class="analytics-category-row">
              <span class="analytics-category-row__swatch" style="--swatch-color:${row.color}"></span>
              <div class="analytics-category-row__meta">
                <strong>${row.label}</strong>
                <small>${row.count} item${row.count === 1 ? "" : "s"}</small>
              </div>
              <div class="analytics-category-row__amount">${formatCurrency(row.amount)}</div>
              <div class="analytics-category-row__percent">${row.percent.toFixed(1)}%</div>
            </div>
          `;
        })
        .join("");
    }
  }

  renderAnalyticsBrowser();

  if (elements.analyticsInsights) {
    const insights = [
      {
        label: "Net result",
        value: `${netLabel} of ${formatCurrency(Math.abs(summary.net))}`,
      },
      {
        label: "Period change",
        value:
          comparison === null
            ? "No comparison available"
            : comparison === 0
              ? "Flat vs previous period"
              : `${comparison > 0 ? "Up" : "Down"} ${formatCurrency(Math.abs(comparison))} vs previous period`,
      },
      {
        label: "Top category",
        value: topExpenseCategory ? `${topExpenseCategory.label} at ${formatCurrency(topExpenseCategory.amount)}` : "No expense categories",
      },
      {
        label: "Top merchant",
        value: topMerchant ? `${topMerchant.label} at ${formatCurrency(topMerchant.amount)}` : "No merchants",
      },
      {
        label: "Review load",
        value: summary.reviewCount
          ? `${summary.reviewCount} warning${summary.reviewCount === 1 ? "" : "s"} in this period`
          : "No warnings in this period",
      },
      {
        label: "Recurring",
        value: topRecurring
          ? `${topRecurring.label} repeats ${topRecurring.count} times`
          : "No repeated patterns detected",
      },
    ];

    elements.analyticsInsights.innerHTML = insights
      .map(
        (insight) => `
          <div class="analytics-insight">
            <strong>${insight.label}</strong>
            <span>${insight.value}</span>
          </div>
        `
      )
      .join("");
  }

  if (elements.analyticsChanges) {
    if (!categoryChanges.length) {
      elements.analyticsChanges.innerHTML = `<div class="empty-state">No comparison available for this period.</div>`;
    } else {
      elements.analyticsChanges.innerHTML = categoryChanges
        .map((row) => {
          const direction = row.delta > 0 ? "up" : row.delta < 0 ? "down" : "flat";
          const label = row.delta > 0 ? "Increase" : row.delta < 0 ? "Decrease" : "No change";
          const amount = formatCurrency(Math.abs(row.delta));
          const current = formatCurrency(row.current);
          const previous = formatCurrency(row.previous);
          return `
            <div class="analytics-change-row ${direction}">
              <div class="analytics-change-row__icon" aria-hidden="true">${direction === "up" ? "↗" : direction === "down" ? "↘" : "→"}</div>
              <div class="analytics-change-row__meta">
                <strong>${row.label}</strong>
                <span>${previous} → ${current}</span>
              </div>
              <div class="analytics-change-row__amount">
                <strong>${label} ${amount}</strong>
                <small>${direction === "up" ? "Higher spend" : direction === "down" ? "Lower spend" : "Steady"}</small>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  if (elements.analyticsBillsPayments) {
    const totalMatchedAmount = billsPayments.matches.reduce((sum, match) => sum + (Number(match.rcbc.amountValue) || 0), 0);
    const totalPendingAmount =
      billsPayments.pendingRcbc.reduce((sum, item) => sum + (Number(item.amountValue) || Number(item.amount) || 0), 0) +
      billsPayments.pendingUnion.reduce((sum, item) => sum + (Number(item.amountValue) || Number(item.amount) || 0), 0);

    const renderBillRows = (rows, kind) => {
      if (!rows.length) {
        return `<div class="empty-state">No ${kind} bills payment entries.</div>`;
      }

      return rows
        .map((row) => {
          if (kind === "matched") {
            return `
              <div class="analytics-bills-row matched">
                <div class="analytics-bills-row__marker matched" aria-hidden="true">✓</div>
                <div class="analytics-bills-row__meta">
                  <strong>${row.rcbc.merchant}</strong>
                  <span>${row.union.source} · ${periodLabelForDate(row.union.date)} → ${periodLabelForDate(row.rcbc.date)} · ${row.lagDays} day${row.lagDays === 1 ? "" : "s"}</span>
                </div>
                <div class="analytics-bills-row__amount">
                  <strong>${formatCurrency(row.rcbc.amountValue)}</strong>
                  <small>${row.union.merchant || row.union.notes || "Bills payment"} matched</small>
                </div>
              </div>
            `;
          }

          const sourceText = normalizeText(row.source || "");
          return `
            <div class="analytics-bills-row pending">
              <div class="analytics-bills-row__marker pending" aria-hidden="true">!</div>
              <div class="analytics-bills-row__meta">
                <strong>${row.merchant}</strong>
                <span>${row.source} · ${periodLabelForDate(row.date)} · ${/rcbc/.test(sourceText) ? "No UnionBank payment found yet" : "No RCBC settlement found yet"}</span>
              </div>
              <div class="analytics-bills-row__amount">
                <strong>${formatCurrency(row.amountValue || row.amount)}</strong>
                <small>${/rcbc/.test(sourceText) ? "RCBC cash payment" : "UnionBank bill payment"}</small>
              </div>
            </div>
          `;
        })
        .join("");
    };

    const matchedRows = billsPayments.matches;
    const pendingRows = [...billsPayments.pendingUnion, ...billsPayments.pendingRcbc];
    elements.analyticsBillsPayments.innerHTML = `
      <div class="analytics-bills">
        <div class="analytics-bills-summary">
          <span class="analytics-bills-summary__pill matched">${matchedRows.length} matched</span>
          <span class="analytics-bills-summary__pill pending">${pendingRows.length} pending</span>
          <small>Across the selected period</small>
        </div>
        <div class="analytics-bills-section">
          <div class="analytics-bills-section__head">
            <p>Matched</p>
            <span>${formatCurrency(totalMatchedAmount)} settled</span>
          </div>
          <div class="analytics-bills-rows">
            ${renderBillRows(matchedRows, "matched")}
          </div>
        </div>
        <div class="analytics-bills-section">
          <div class="analytics-bills-section__head">
            <p>Pending</p>
            <span>${formatCurrency(totalPendingAmount)} not yet paired</span>
          </div>
          <div class="analytics-bills-rows">
            ${renderBillRows(pendingRows, "pending")}
          </div>
        </div>
      </div>
    `;
  }

  if (elements.analyticsWarnings) {
    if (!warningItems.length) {
      elements.analyticsWarnings.innerHTML = `<div class="empty-state">No warnings in the selected period.</div>`;
    } else {
      elements.analyticsWarnings.innerHTML = warningItems
        .map(
          (item) => `
            <button class="analytics-warning-row" type="button" data-warning-id="${item.id}">
              <span class="warning-chip warning-chip-inline" aria-hidden="true"><span class="warning-mark"></span></span>
              <span class="analytics-warning-row__meta">
                <strong>${item.merchant}</strong>
                <small>${item.issue?.detail || "Potential issue"}</small>
              </span>
            </button>
          `
        )
        .join("");

      elements.analyticsWarnings.querySelectorAll("[data-warning-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.warningId;
          if (id) openItemDetailModal(id);
        });
      });
    }
  }

  if (elements.analyticsRecurring) {
    if (!recurring.length) {
      elements.analyticsRecurring.innerHTML = `<div class="empty-state">No recurring transactions found in this period.</div>`;
    } else {
      elements.analyticsRecurring.innerHTML = recurring
        .map((row) => {
          const cadence = row.count >= 4 ? "Recurring" : "Repeated";
          const average = row.count ? row.amount / row.count : 0;
          const tone = row.type === "income" ? "positive" : row.type === "transfer" ? "neutral" : "negative";
          const marker = tone === "positive" ? "↗" : tone === "neutral" ? "↔" : "↘";
          return `
            <div class="analytics-recurring-row">
              <div class="analytics-recurring-row__marker ${tone}">
                <span aria-hidden="true">${marker}</span>
              </div>
              <div class="analytics-recurring-row__meta">
                <strong>${row.label}</strong>
                <span>${row.category} · ${cadence} ${row.count}x</span>
              </div>
              <div class="analytics-recurring-row__amount">
                <strong>${formatCurrency(row.amount)}</strong>
                <small>avg ${formatCurrency(average)}</small>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }
};

const renderAll = () => {
  updateTopbar();
  renderOverview();
  renderActivityPanel();
  renderLineItems();
  renderAnalytics();
  syncTransactionsPanelState();
  syncHistoryControls();
  updateScrollTopFab();
};

const resetForm = () => {
  populateForm(null);
};

const startEdit = (id) => {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  setScreen("line-items");
  openManualEntryModal(item);
};

const deleteItem = async (id) => {
  const index = state.items.findIndex((entry) => entry.id === id);
  const removedItem = index >= 0 ? cloneItems([state.items[index]])[0] : null;
  pushHistorySnapshot();
  state.items = state.items.filter((entry) => entry.id !== id);
  if (state.editingId === id) resetForm();
  if (state.activeWarningId === id) state.activeWarningId = null;
  if (state.selectedItemId === id) closeItemDetailModal();
  if (state.selectedItemIds.includes(id)) {
    setSelectedItems(state.selectedItemIds.filter((selectedId) => selectedId !== id));
  }
  await saveItems();
  renderAll();
  if (removedItem) {
    recordActivity(
      {
        title: "Deleted line item",
        detail: `${removedItem.merchant} · ${formatCurrency(Number(removedItem.amount) || 0)}`,
        kind: "warning",
      },
      {
        undo: async () => {
          const next = cloneItems(state.items);
          next.splice(Math.min(index, next.length), 0, removedItem);
          state.items = next;
          await saveItems();
          renderAll();
        },
      }
    );
  }
};

const markReviewed = async (id) => {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const previousIssue = item.issue ? { ...item.issue } : null;
  pushHistorySnapshot();
  item.issue = null;
  if (state.activeWarningId === id) state.activeWarningId = null;
  await saveItems();
  renderAll();
  if (state.selectedItemId === id) {
    renderItemDetail(item);
  }
  recordActivity(
    {
      title: "Marked reviewed",
      detail: item.merchant,
      kind: "info",
    },
    previousIssue
      ? {
          undo: async () => {
            const target = state.items.find((entry) => entry.id === id);
            if (target) {
              target.issue = previousIssue;
            }
            await saveItems();
            renderAll();
          },
        }
      : null
  );
};

const createOrUpdateItem = async (data) => {
  const wasEditing = Boolean(state.editingId);
  const existingIndex = state.editingId ? state.items.findIndex((item) => item.id === state.editingId) : -1;
  const previousItem = existingIndex >= 0 ? cloneItems([state.items[existingIndex]])[0] : null;
  const base = {
    id: state.editingId || uid(),
    date: normalizeDate(data.date),
    type: ["income", "transfer"].includes(data.type) ? data.type : "expense",
    merchant: String(data.merchant || "").trim() || "Untitled item",
    source: inferSource(data.source, "Cash", data.merchant || data.notes || ""),
    amount: normalizeAmount(data.amount),
    category: normalizeCategoryLabel(data.category),
    notes: String(data.notes || "").trim(),
    importedFrom: wasEditing ? previousItem?.importedFrom || "Manual entry" : "Manual entry",
    importedAt: wasEditing ? previousItem?.importedAt || "" : new Date().toISOString(),
    importEvidence: wasEditing ? previousItem?.importEvidence || "Manual entry" : "Manual entry",
    issue: null,
  };

  if (state.editingId) {
    const otherItems = state.items.filter((item) => item.id !== state.editingId);
    base.issue = buildIssue(base, otherItems);
    pushHistorySnapshot();
    if (existingIndex >= 0) state.items[existingIndex] = base;
  } else {
    base.issue = buildIssue(base, state.items);
    pushHistorySnapshot();
    state.items.unshift(base);
  }

  await saveItems();
  resetForm();
  closeManualEntryModal();
  renderAll();
  recordActivity(
    {
      title: wasEditing ? "Updated line item" : "Added line item",
      detail: `${base.merchant} · ${formatCurrency(Number(base.amount) || 0)}`,
      kind: "info",
    },
    {
      undo: async () => {
        if (wasEditing) {
          if (existingIndex >= 0 && previousItem) {
            state.items[existingIndex] = previousItem;
          }
        } else {
          state.items = state.items.filter((item) => item.id !== base.id);
        }
        await saveItems();
        renderAll();
      },
    }
  );
};

const importRows = (rows, sourceLabel) => {
  const imported = [];
  let reviewCount = 0;
  const importedAt = new Date().toISOString();

  for (const row of rows) {
    const source = inferSource(
      `${row.source || ""} ${row.merchant || ""} ${row.notes || ""}`,
      "Cash",
      sourceLabel || ""
    );
    const candidate = normalizeItem({
      ...row,
      source,
      importedFrom: sourceLabel || "statement",
      importedAt,
      importEvidence:
        String(row.importEvidence || row.description || row.memo || row.notes || row.merchant || row.name || "")
          .trim() || sourceLabel || "statement",
    });
    candidate.issue = buildIssue(candidate, [...imported, ...state.items]);
    if (candidate.issue) reviewCount += 1;
    imported.push(candidate);
  }

  pushHistorySnapshot();
  state.items = [...imported, ...state.items];
  state.importMessage = `Imported ${imported.length} line items from ${sourceLabel}. ${reviewCount} need review.`;
  if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
  saveItems().then(renderAll);
  recordActivity(
    {
      title: "Imported statement",
      detail: `${sourceLabel} · ${imported.length} item${imported.length === 1 ? "" : "s"}`,
      kind: reviewCount ? "warning" : "info",
    },
    {
      undo: async () => {
        const ids = new Set(imported.map((item) => item.id));
        state.items = state.items.filter((item) => !ids.has(item.id));
        await saveItems();
        renderAll();
      },
    }
  );
};

const splitDelimitedLine = (line, delimiter) => {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const inferType = (description, amount) => {
  if (amount < 0) return "expense";
  if (/(salary|payroll|refund|income|deposit|interest)/i.test(description)) return "income";
  return "expense";
};

const categoryRules = [
  {
    category: "Transfers",
    patterns: [/transfer from/i, /transfer to/i, /fund transfer/i, /interbank/i, /instapay/i, /pesonet/i, /bank transfer/i, /online fund transfer/i, /cash payment/i, /cash transfer/i, /payment to bank/i],
  },
  {
    category: "Travel & Lifestyle",
    patterns: [
      /jetstar/i,
      /cebu\s*air/i,
      /cebupacific/i,
      /qantas\s*air/i,
      /aero\s*dili/i,
      /ppass\s*lounge/i,
      /klook/i,
      /airline/i,
      /flight/i,
      /airport/i,
      /boarding/i,
      /ticket/i,
      /travel/i,
      /philippine airlines/i,
      /\bpal\b/i,
    ],
  },
  {
    category: "Transport",
    patterns: [/mitsukoshi\s+bgc\s+parking/i, /parking/i, /parkade/i, /petron/i, /transport/i, /grab/i, /taxi/i, /uber/i, /fuel/i, /ride/i, /car park/i, /mrt/i, /dotr/i, /lrt/i],
  },
  {
    category: "Food & Dining",
    patterns: [
      /single origin/i,
      /wholesome table/i,
      /bacolod chicken inasal/i,
      /mendokoro ramenba/i,
      /starbucks/i,
      /yardstick/i,
      /satchmigroup/i,
      /tomatito/i,
      /jollibee/i,
      /jco/i,
      /marugame/i,
      /auntie ann/i,
      /grocery/i,
      /groceries/i,
      /supermarket/i,
      /palengke/i,
      /market/i,
      /food/i,
      /restaurant/i,
      /coffee/i,
      /dining/i,
      /meal/i,
    ],
  },
  {
    category: "Housing",
    patterns: [/airbnb/i, /agoda/i, /housing/i, /rent/i, /mortgage/i, /apartment/i, /condo/i, /home/i, /house/i, /lodging/i, /hotel/i],
  },
  {
    category: "Shopping",
    patterns: [/decathlon/i, /flowerstore/i, /one bonifacio/i, /greenbelt/i, /shopping/i, /mall/i, /amazon/i, /lazada/i, /shopee/i, /ecommerce/i, /retail/i, /store/i],
  },
  {
    category: "Bills & Utilities",
    patterns: [/linkedin/i, /openai/i, /annual membership fee/i, /membership fee/i, /\bsubscription\b/i, /airalo/i, /utility/i, /electric/i, /water/i, /internet/i, /phone/i, /globe/i, /smart/i, /pldt/i, /converge/i],
  },
  {
    category: "Children",
    patterns: [/children/i, /child/i, /kid/i, /kids/i, /baby/i, /daycare/i, /childcare/i, /diaper/i, /toy/i, /school supplies/i],
  },
  {
    category: "Education",
    patterns: [/education/i, /tuition/i, /school/i, /college/i, /university/i, /training/i, /course/i, /class/i, /seminar/i, /certification/i, /\bbook(s)?\b/i, /tutorial/i],
  },
  {
    category: "Health & Wellness",
    patterns: [/medical/i, /clinic/i, /hospital/i, /pharmacy/i, /medicine/i, /drug/i, /health/i, /wellness/i, /doctor/i, /dentist/i, /lab/i, /therapy/i],
  },
  {
    category: "Financial",
    patterns: [/investment/i, /stock/i, /fund/i, /dividend/i, /pdax/i, /philippine digital asset exchange/i, /tr8 securities/i, /securities/i, /crypto/i, /trading/i, /broker/i],
  },
  {
    category: "Business",
    patterns: [/business/i, /consulting/i, /freelance/i, /invoice/i, /service fee/i, /professional fee/i, /\bcorp\b/i, /\binc\b/i, /\bcompany\b/i, /vendor/i, /supplier/i],
  },
  {
    category: "Gifts & Donations",
    patterns: [/gift/i, /donation/i, /donations/i, /charity/i, /tith(e|es)/i, /offering/i],
  },
];

const inferExpenseCategory = (description) => {
  const raw = normalizeText(description);
  for (const rule of categoryRules) {
    if (rule.patterns.some((pattern) => pattern.test(raw))) {
      return rule.category;
    }
  }

  return defaultCategoryLabel;
};

const inferCategory = (description, type) => {
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfers";
  return inferExpenseCategory(description);
};

const inferStatementType = (description, direction = "debit") => {
  const raw = normalizeText(description);
  const side = normalizeText(direction);
  const isCreditSide = side.includes("credit");
  const isSalaryLike = /(salary|payroll|deposit|interest|refund|credit|cash in|cash deposit|remittance)/i.test(raw);
  const isTransferLike = /(transfer|fund transfer|interbank|instapay|pesonet|bills payment|bill payment|online fund transfer|bank transfer|payment to bank|cash payment)/i.test(raw);
  const isPaymentTransfer = /(cash payment|bills payment|bill payment|online fund transfer)/i.test(raw);
  const isCashOutLike = /(atm withdrawal|cash withdrawal|cash advance)/i.test(raw);
  const isCashInLike = /(cash deposit|cash in)/i.test(raw);

  if (isCashOutLike) return "expense";

  if (isCreditSide) {
    if (isSalaryLike) return "income";
    if (isPaymentTransfer) return "transfer";
    return "income";
  }

  if (isTransferLike) return "transfer";
  if (isSalaryLike) return "income";
  return "expense";
};

const inferSource = (value, fallback = "Cash", context = "") => {
  const raw = normalizeText(value);
  if (!raw) return fallback;

  const bankPatterns = [
    [/union bank|unionbank/, "UnionBank"],
    [/\bhsbc\b|hongkong and shanghai banking corporation/, "HSBC"],
    [/philippine national bank|\bpnb\b/, "PNB"],
    [/\bbpi\b|bank of the philippine islands/, "BPI"],
    [/\bbdo\b/, "BDO"],
    [/\brcbc\b/, "RCBC"],
    [/\bps bank\b|\bpsbank\b/, "PS Bank"],
    [/\bmetrobank\b|metropolitan bank/, "Metrobank"],
    [/\bsecurity bank\b|\bsecuritybank\b/, "Security Bank"],
    [/\bland bank\b|\blandbank\b/, "LandBank"],
    [/\beast west\b|\beastwest\b/, "EastWest"],
    [/\bchina bank\b|\bchinabank\b/, "Chinabank"],
    [/\bmaybank\b/, "Maybank"],
    [/\bcimb\b/, "CIMB"],
  ];

  const sourcePatterns = [
    [/\bwise\b/, "Wise"],
    [/\bgcash\b/, "GCash"],
    [/\bg cash\b/, "GCash"],
    [/\bmaya\b|\bpaymaya\b/, "Maya"],
    [/\bgrab\b/, "Grab"],
    [/\bshopee\b/, "Shopee"],
    [/\blazada\b/, "Lazada"],
    [/\bpaypal\b/, "PayPal"],
    [/\bcash payment\b|\bcash\b/, "Cash"],
    [/\batm withdrawal\b|\bcash withdrawal\b/, "Cash"],
    [/\bemail\b|\bgmail\b/, "Email"],
    [/\binvestment\b|\bfund\b|\bstock\b/, "Investment"],
  ];

  const contextRaw = normalizeText(context);
  const contextSourceHint = (() => {
    if (!contextRaw) return "";
    if (/union bank|unionbank/.test(contextRaw)) return "UnionBank";
    if (/\bhsbc\b|hongkong and shanghai banking corporation/.test(contextRaw)) return "HSBC";
    if (/rcbc|visa platinum/.test(contextRaw)) return "RCBC";
    if (/philippine national bank|\bpnb\b/.test(contextRaw)) return "PNB";
    if (/\bbpi\b|bank of the philippine islands/.test(contextRaw)) return "BPI";
    if (/\bbdo\b/.test(contextRaw)) return "BDO";
    if (/\bps bank\b|\bpsbank\b/.test(contextRaw)) return "PS Bank";
    if (/\bmetrobank\b|metropolitan bank/.test(contextRaw)) return "Metrobank";
    if (/\bsecurity bank\b|\bsecuritybank\b/.test(contextRaw)) return "Security Bank";
    if (/\bland bank\b|\blandbank\b/.test(contextRaw)) return "LandBank";
    if (/\beast west\b|\beastwest\b/.test(contextRaw)) return "EastWest";
    if (/\bchina bank\b|\bchinabank\b/.test(contextRaw)) return "Chinabank";
    if (/\bmaybank\b/.test(contextRaw)) return "Maybank";
    if (/\bcimb\b/.test(contextRaw)) return "CIMB";
    if (/\bwise\b/.test(contextRaw)) return "Wise";
    if (/\bgcash\b|\bg cash\b/.test(contextRaw)) return "GCash";
    if (/\bmaya\b|\bpaymaya\b/.test(contextRaw)) return "Maya";
    if (/\bgrab\b/.test(contextRaw)) return "Grab";
    if (/\bshopee\b/.test(contextRaw)) return "Shopee";
    if (/\blazada\b/.test(contextRaw)) return "Lazada";
    if (/\bpaypal\b/.test(contextRaw)) return "PayPal";
    return "";
  })();

  for (const [pattern, label] of bankPatterns) {
    if (pattern.test(raw)) return label;
  }

  if (contextSourceHint) return contextSourceHint;

  for (const [pattern, label] of sourcePatterns) {
    if (pattern.test(raw)) return label;
  }

  if (/(bank transfer|transfer|bank|withdrawal|deposit|payment)/i.test(raw)) {
    const contextRaw = normalizeText(context);
    if (!contextRaw) return fallback;
    for (const [pattern, label] of bankPatterns) {
      if (pattern.test(contextRaw)) return label;
    }
    if (/wise/i.test(contextRaw)) return "Wise";
    if (/cash/i.test(contextRaw)) return "Cash";
  }

  const cleaned = String(value || "").trim();
  return cleaned || fallback;
};

const extractReceiptDate = (text) => {
  const raw = String(text || "");
  const match =
    raw.match(/\bDate:\s*(\d{1,2}[A-Za-z]{3}\d{4})\b/i) ||
    raw.match(/\bDate:\s*(\d{1,2}[A-Za-z]{3}\d{2})\b/i) ||
    raw.match(/\b(\d{1,2}[A-Za-z]{3}\d{4})\b/i);

  return match ? normalizeDate(match[1]) : null;
};

const extractReceiptAmount = (text) => {
  const raw = String(text || "");
  const amountPatterns = [
    /Total\s*\(VAT included\):\s*(USD|PHP|US\$|\$|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    /Total Amount:\s*(USD|PHP|US\$|\$|₱)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    /Fare:\s*(USD|PHP|US\$|\$|₱)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
    /Amount:\s*(USD|PHP|US\$|\$|₱)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = raw.match(pattern);
    if (!match) continue;

    const currency = String(match[1] || "").toUpperCase();
    const amount = normalizeAmount(match[2]);
    const converted =
      currency.includes("USD") || currency === "$" || currency === "US$"
        ? Math.round(amount * USD_TO_PHP_RATE * 100) / 100
        : amount;

    return { amount: converted, currency: currency || "PHP" };
  }

  return null;
};

const extractEmailOrderReceiptRows = (text, sourceLabel = "statement") => {
  const raw = String(text || "").trim();
  if (!raw || !/\.pdf$/i.test(String(sourceLabel || ""))) {
    return [];
  }

  const looksLikeOrderReceipt =
    /order being processed|thanks for shopping|we received your order|order #|payment for order|order details|shipping fee|total \(vat included\)|total payment|amount paid/i.test(raw);
  if (!looksLikeOrderReceipt) {
    return [];
  }

  const merchant =
    /shopee/i.test(raw) || /info@mail\.shopee\.ph/i.test(raw)
      ? "Shopee"
      : /lazada/i.test(raw)
        ? "Lazada"
        : inferMerchantFromDescription(raw) || "Imported Item";
  const totalMatch =
    raw.match(/Total Payment:\s*(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i) ||
    raw.match(/Amount Paid:\s*(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i) ||
    raw.match(/Total\s*\(VAT included\):\s*(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i) ||
    raw.match(/Total\s+Amount:\s*(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i) ||
    raw.match(/Total:\s*(?:PHP|₱|P)?\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  const amount = totalMatch ? normalizeAmount(totalMatch[1]) : 0;
  if (!amount) {
    return [];
  }

  const dateMatch =
    raw.match(/Order Date:\s*(\d{1,2} [A-Za-z]{3} \d{4})/i) ||
    raw.match(/Payment Date:\s*(\d{1,2} [A-Za-z]{3} \d{4})/i) ||
    raw.match(/received your order on (\d{1,2} [A-Za-z]+ \d{4})/i) ||
    raw.match(/\b(\d{1,2} [A-Za-z]+ \d{4})\b/i) ||
    raw.match(/\b(\d{1,2}[A-Za-z]{3}\d{4})\b/i);
  const date = dateMatch ? normalizeDate(dateMatch[1]) : normalizeDate(sourceLabel);
  const orderMatch = raw.match(/order\s*#\s*(\d{6,})/i);
  const itemMatch =
    raw.match(/\n\s*(?:\d+\.)?\s*([^\n]+?)\s+Variation:/i) ||
    raw.match(/Seller:\s*[^\n]+\s+(?:\d+\.)?\s*([^\n]+?)\s+Variation:/i);
  const notes = orderMatch ? `Order #${orderMatch[1]}` : itemMatch ? String(itemMatch[1]).trim().slice(0, 120) : "Order confirmation";

  return [
    {
      date,
      type: "expense",
      merchant,
      amount,
      category: inferCategoryFromStatement(`${merchant} ${raw}`, "expense"),
      notes,
    },
  ];
};

const extractReceiptMerchant = (text) => {
  const raw = String(text || "");
  if (/PHILIPPINE AIRLINES|(?:\bPAL\b)/i.test(raw)) return "Philippine Airlines";
  return null;
};

const extractPalReceiptRows = (text, sourceLabel = "statement") => {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const mainSection = raw.split(/ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT/i)[0] || raw;
  const sourceLooksLikePdf = /\.pdf$/i.test(String(sourceLabel || ""));
  const looksLikeAirlineReceipt =
    sourceLooksLikePdf && /ELECTRONIC TICKET RECEIPT|PHILIPPINE AIRLINES|(?:\bPAL\b)/i.test(mainSection);
  if (!looksLikeAirlineReceipt) {
    return [];
  }

  const rows = [];
  const merchant = extractReceiptMerchant(mainSection) || "Philippine Airlines";
  const baseDate = extractReceiptDate(mainSection) || normalizeDate(sourceLabel);
  const mainAmount = extractReceiptAmount(mainSection);
  if (mainAmount?.amount) {
    rows.push({
      date: baseDate,
      type: "expense",
      merchant,
      amount: mainAmount.amount,
      category: "Travel & Lifestyle",
      notes: "Flight ticket receipt",
    });
  }

  const emdPattern = /ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT \(EMD\)([\s\S]*?)(?=ELECTRONIC MISCELLANEOUS DOCUMENT RECEIPT \(EMD\)|LEGAL AND PASSENGER NOTICES|ELECTRONIC TICKET|$)/gi;
  for (const match of raw.matchAll(emdPattern)) {
    const block = match[1] || "";
    const serviceMatch = block.match(/\bService\s+\d+\s+(.+?)\s+\d{1,2}[A-Za-z]{3}\d{4}\b/i) || block.match(/\bService\s+\d+\s+(.+?)(?:\s+Fare Details|\s+Payment Details|\s+Total Amount:)/i);
    const service = serviceMatch ? serviceMatch[1].trim() : "Seat Reservation";
    const date = extractReceiptDate(block) || baseDate;
    const amountInfo = extractReceiptAmount(block);
    if (!amountInfo?.amount) continue;

    rows.push({
      date,
      type: "expense",
      merchant,
      amount: amountInfo.amount,
      category: "Travel & Lifestyle",
      notes: service,
    });
  }

  return rows;
};

const inferMerchantFromDescription = (description) => {
  const raw = String(description || "").trim();
  const normalized = normalizeText(raw);
  const namedMatches = [
    [/cash payment/i, "Cash Payment"],
    [/atm withdrawal/i, "ATM Withdrawal"],
    [/cash withdrawal/i, "Cash Withdrawal"],
    [/fund transfer/i, "ONLINE FUND TRANSFER"],
    [/bills payment/i, "BILLS PAYMENT"],
    [/online fund transfer/i, "ONLINE FUND TRANSFER"],
    [/philippine airlines|(?:\bPAL\b)/i, "Philippine Airlines"],
    [/xiamen airlines/i, "Xiamen Airlines"],
    [/china south/i, "China Southern Airlines"],
    [/grab/i, "Grab"],
    [/lazada/i, "Lazada"],
    [/shopee/i, "Shopee"],
    [/globe/i, "Globe"],
    [/tomoro coffee/i, "Tomoro Coffee"],
    [/toby.?s estate coffee/i, "Toby's Estate Coffee"],
    [/coffee academics/i, "Coffee Academics"],
    [/jollibee/i, "Jollibee"],
    [/jco/i, "JCO"],
    [/steamgames|steam purchase|steam/i, "Steam"],
    [/openai/i, "OpenAI"],
    [/linkedin/i, "LinkedIn"],
    [/marugame/i, "Marugame"],
    [/llaollao/i, "Llaollao"],
    [/auntie.?anne/i, "Auntie Anne's"],
    [/brunos barbers/i, "Brunos Barbers"],
    [/philippine digital asset exchange|pdax/i, "PDAX"],
    [/dx rt lab|d x rt lab/i, "DX RT Lab"],
    [/pickup/i, "PickUp"],
    [/gadc/i, "GADC"],
    [/kaokee/i, "Kaokee"],
    [/mall exit/i, "Mall Exit"],
  ];

  for (const [pattern, label] of namedMatches) {
    if (pattern.test(raw) || pattern.test(normalized)) return label;
  }

  return raw
    .replace(/\s{2,}/g, " ")
    .replace(/\b(?:PH|US|SG|DE|CH|HK)\b.*$/i, "")
    .trim() || "Imported Item";
};

const inferGcashType = (description) => {
  const raw = normalizeText(description);
  if (/^(received gcash from|cash in|transfer from)/i.test(raw)) return "income";
  if (/^(sent gcash to|transfer to|cash out|cash transfer out)/i.test(raw)) return "expense";
  if (/^(payment to|paid to)/i.test(raw)) {
    return "expense";
  }
  return "expense";
};

const extractGcashRows = (text, sourceLabel = "statement", pdfPages = []) => {
  const raw = String(text || "").trim();
  const sourceText = normalizeText(`${sourceLabel || ""} ${raw}`);
  if (!/gcash transaction history/i.test(sourceText)) return [];

  const rows = [];
  const parsePageText = (pageText) => {
    const matches = [...String(pageText || "").matchAll(
      /(?<date>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(?<desc>.+?)\s+(?<ref>\d{13})\s+(?<amount>[\d,]+(?:\.\d{2})?)\s+(?<balance>[\d,]+(?:\.\d{2})?)(?=\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}|$)/gs
    )];

    for (const match of matches) {
      const desc = String(match.groups?.desc || "").replace(/\s{2,}/g, " ").trim();
      const merchant = inferMerchantFromDescription(desc);
      const type = inferGcashType(desc);
      rows.push({
        date: normalizeDate(match.groups?.date || ""),
        type,
        merchant,
        amount: normalizeAmount(match.groups?.amount || ""),
        category: inferCategoryFromStatement(`${merchant} ${desc}`, type),
        source: "GCash",
        notes: desc || "Imported from statement",
      });
    }
  };

  if (Array.isArray(pdfPages) && pdfPages.length) {
    for (const page of pdfPages) {
      const pageText = Array.isArray(page?.items) && page.items.length
        ? page.items.map((item) => item.str || "").join(" ")
        : page?.text || "";
      if (pageText) parsePageText(pageText);
    }
  }

  if (!rows.length) {
    parsePageText(raw);
  }

  return rows;
};

const inferCategoryFromStatement = (description, type) => {
  const raw = String(description || "");
  if (type === "income") {
    if (/(transfer from|received gcash from)/i.test(raw)) return "Transfers";
    if (/(salary|payroll|wage|bonus|commission|allowance|direct deposit|interest|refund|cash in|remittance|bank transfer)/i.test(raw)) return "Income";
    return inferCategory(raw, type);
  }
  if (/(transfer to|sent gcash to|cash out|cash transfer out)/i.test(raw)) return "Transfers";
  if (type === "transfer") return "Transfers";
  return inferCategory(raw, type);
};

const extractRcbcVisaRows = (text, sourceLabel = "statement") => {
  const raw = String(text || "").trim();
  const sourceLooksLikePdf = /\.pdf$/i.test(String(sourceLabel || ""));
  if (!sourceLooksLikePdf || !/VISA PLATINUM|CARD NUMBER/i.test(raw) || !/AMOUNT DESCRIPTION POST DATE SALE DATE/i.test(raw)) {
    return [];
  }

  const pageTwo = raw.match(/IMPORTANT REMINDERS[\s\S]*?(?=PAGE 3 of 4|PAGE 4 of 4|$)/i)?.[0] || raw;
  const rowPattern =
    /(?<prefix>(?:\d[\d,]*\.\d{2}-?)(?:\s+[A-Z]{3}\s+\d[\d,]*\.\d{2})?(?:\s+\d[\d,]*\.\d{2})?)\s+(?<post>\d{2}\/\d{2}\/\d{2})\s+(?<sale>\d{2}\/\d{2}\/\d{2})\s+(?<desc>.*?)(?=(?:\s+\d[\d,]*\.\d{2}-?(?:\s+[A-Z]{3}\s+\d[\d,]*\.\d{2})?(?:\s+\d[\d,]*\.\d{2})?\s+\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2})|\s+BALANCE END|\s+PAGE 3 of 4|\s+PAGE 4 of 4|$)/gs;

  const rows = [];
  for (const match of pageTwo.matchAll(rowPattern)) {
    const prefix = String(match.groups?.prefix || "").trim();
    const postDate = normalizeDate(match.groups?.post || "");
    const saleDate = normalizeDate(match.groups?.sale || "");
    const description = String(match.groups?.desc || "").trim();
    const amountToken = prefix.split(/\s+/)[0] || "";
    const isCredit = /-$/.test(amountToken) || /cash payment/i.test(description);
    const amount = normalizeAmount(amountToken);
    const merchant = inferMerchantFromDescription(description);
    const type = /cash payment/i.test(description) ? "transfer" : "expense";
    const category = inferCategoryFromStatement(merchant + " " + description, type);

    rows.push({
      date: saleDate || postDate,
      type,
      merchant,
      amount,
      category,
      source: "RCBC",
      notes: description || "Imported from statement",
    });
  }

  return rows;
};

const extractUnionBankRows = (text, sourceLabel = "statement", pdfPages = []) => {
  const raw = String(text || "").trim();
  const sourceLooksLikePdf = /\.pdf$/i.test(String(sourceLabel || ""));
  if (!sourceLooksLikePdf || !/TRANSACTION HISTORY AS OF/i.test(raw) || !/Date\s+Check No\.\s+Ref\.\s+No\.\s+Description\s+Debit\s+Credit\s+Balance/i.test(raw)) {
    return [];
  }

  const structuredRows = [];
  if (Array.isArray(pdfPages) && pdfPages.length) {
    for (const page of pdfPages) {
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      if (!pageItems.length) continue;

      const pageText = normalizeText(page.text || pageItems.map((item) => item.str || "").join(" "));
      if (!/transaction history as of/i.test(pageText)) continue;

      const rowBuckets = new Map();
      for (const item of pageItems) {
        const str = String(item?.str || "").trim();
        if (!str) continue;
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        const key = Math.round(y * 2) / 2;
        if (!rowBuckets.has(key)) rowBuckets.set(key, []);
        rowBuckets.get(key).push({ str, x, y });
      }

      for (const rowItems of rowBuckets.values()) {
        const items = rowItems.sort((a, b) => a.x - b.x);
        const dateItem = items.find((item) => /^\d{2}\/\d{2}\/\d{2}$/.test(item.str));
        if (!dateItem) continue;

        const amountCandidates = items.filter((item) => /PHP\s*[\d,]+(?:\.\d{2})?/i.test(item.str) && item.x >= 300 && item.x < 470);
        if (!amountCandidates.length) continue;

        const amountItem = amountCandidates.sort((a, b) => a.x - b.x)[0];
        const amountColumn = amountItem.x >= 385 ? "credit" : "debit";
        const amount = normalizeAmount(amountItem.str);
        const description = items
          .filter((item) => item.x > 150 && item.x < 345)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim();

        if (!description) continue;

        const descText = normalizeText(description);
        const type = inferStatementType(descText, amountColumn);
        const merchant = amountColumn === "credit" && type === "income" && /not applicable/i.test(descText)
          ? "Income"
          : inferMerchantFromDescription(description);
        const category = inferCategoryFromStatement(`${merchant} ${description}`, type);

        structuredRows.push({
          date: normalizeDate(dateItem.str),
          type,
          merchant,
          amount,
          category,
          source: "UnionBank",
          notes: description || "Imported from statement",
        });
      }
    }
  }

  if (structuredRows.length) {
    return structuredRows;
  }

  const historySection = raw.match(/TRANSACTION HISTORY AS OF[\s\S]*?(?=For billing concerns|Page\s+\d+\s+of\s+\d+|$)/i)?.[0] || raw;
  const rowPattern =
    /(?<date>\d{2}\/\d{2}\/\d{2})\s+\S+\s+.*?(?=(?:\d{2}\/\d{2}\/\d{2}\s+\S+\s+)|For billing concerns|Page\s+\d+\s+of\s+\d+|$)/gs;

  const rows = [];
  for (const match of historySection.matchAll(rowPattern)) {
    const rowText = String(match[0] || "").trim();
    const date = normalizeDate(match.groups?.date || "");
    if (!date) continue;

    const moneyMatches = [...rowText.matchAll(/PHP\s*([\d,]+(?:\.\d{2})?)/g)];
    if (!moneyMatches.length) continue;

    const transactionAmount = normalizeAmount(moneyMatches[0][1]);
    const descPart = rowText
      .replace(/^\d{2}\/\d{2}\/\d{2}\s+\S+\s+/, "")
      .replace(/(?:PHP\s*[\d,]+\.\d{2}\s*)+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const merchant = inferMerchantFromDescription(descPart);
    const type = inferStatementType(descPart, /credit/i.test(rowText) ? "credit" : "debit");
    const category = inferCategoryFromStatement(merchant + " " + descPart, type);

    rows.push({
      date,
      type,
      merchant,
      amount: transactionAmount,
      category,
      source: "UnionBank",
      notes: descPart || "Imported from statement",
    });
  }

  return rows;
};

const extractGenericBankRows = (text, sourceLabel = "statement", pdfPages = []) => {
  const raw = String(text || "").trim();
  const sourceText = normalizeText(`${sourceLabel || ""} ${raw}`);
  const looksBankish =
    /(bank|hsbc|pnb|ps bank|psbank|bpi|bdo|rcbc|unionbank|security bank|metrobank|landbank|eastwest|chinabank|maybank|cimb|wise|gcash|maya)/i.test(sourceText);
  if (!looksBankish || /order being processed|thanks for shopping|electronic ticket receipt|invoice|receipt/i.test(raw)) {
    return [];
  }

  const source = inferSource(sourceLabel, "Cash", raw);
  const structuredRows = [];

  const parseRowFromText = (rowText) => {
    const normalizedRow = String(rowText || "").replace(/\s+/g, " ").trim();
    if (!normalizedRow) return null;
    const dateMatch =
      normalizedRow.match(/^(?<date>\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/) ||
      normalizedRow.match(/^(?<date>[A-Za-z]{3}\s+\d{1,2}(?:,\s+\d{4})?)\b/) ||
      normalizedRow.match(/^(?<date>\d{1,2}\s+[A-Za-z]{3}(?:\s+\d{4})?)\b/);
    if (!dateMatch?.groups?.date) return null;

    const amountMatches = [...normalizedRow.matchAll(/(?:PHP|₱|P|US\$|\$)?\s*(?<amount>[\d,]+(?:\.\d{2})?)(?<suffix>-?)/g)];
    if (!amountMatches.length) return null;

    const amountToken = `${amountMatches[0].groups?.amount || amountMatches[0][1] || ""}${amountMatches[0].groups?.suffix || amountMatches[0][2] || ""}`;
    const isCredit = /(credit|deposit|salary|payroll|interest|refund)/i.test(normalizedRow) ||
      /(?:credit|deposit)\s*[:\-]?\s*[\d,]+\.\d{2}/i.test(normalizedRow) ||
      /[\d,]+\.\d{2}\s*-\s*$/.test(normalizedRow);
    const type = inferStatementType(normalizedRow, isCredit ? "credit" : "debit");
    const amount = normalizeAmount(amountToken);
    const merchant = inferMerchantFromDescription(normalizedRow);

    return {
      date: normalizeDate(dateMatch.groups.date),
      type,
      merchant,
      amount,
      category: inferCategoryFromStatement(`${merchant} ${normalizedRow}`, type),
      source,
      notes: normalizedRow || "Imported from statement",
    };
  };

  if (Array.isArray(pdfPages) && pdfPages.length) {
    for (const page of pdfPages) {
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      if (!pageItems.length) continue;

      const pageText = normalizeText(page.text || pageItems.map((item) => item.str || "").join(" "));
      if (!/(debit|credit|withdrawal|deposit|balance|particulars|description|transaction history|account summary)/i.test(pageText)) continue;

      const rowBuckets = new Map();
      for (const item of pageItems) {
        const str = String(item?.str || "").trim();
        if (!str) continue;
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (Number.isNaN(x) || Number.isNaN(y)) continue;
        const key = Math.round(y * 2) / 2;
        if (!rowBuckets.has(key)) rowBuckets.set(key, []);
        rowBuckets.get(key).push({ str, x, y });
      }

      for (const rowItems of rowBuckets.values()) {
        const items = rowItems.sort((a, b) => a.x - b.x);
        const dateToken = items.find((item) => /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(item.str) || /^[A-Za-z]{3}\s+\d{1,2}(?:,\s+\d{4})?$/.test(item.str));
        if (!dateToken) continue;

        const amountCandidates = items.filter((item) => /[\d,]+(?:\.\d{2})?/.test(item.str) && item.x >= 260);
        if (!amountCandidates.length) continue;

        const amountItem = amountCandidates.sort((a, b) => a.x - b.x)[0];
        const description = items
          .filter((item) => item.x > 55 && item.x < 360)
          .map((item) => item.str)
          .join(" ")
          .replace(/\s{2,}/g, " ")
          .trim();
        const rowText = `${dateToken.str} ${description} ${amountItem.str}`;
        const parsed = parseRowFromText(rowText);
        if (!parsed) continue;

        structuredRows.push({
          ...parsed,
          source,
        });
      }
    }
  }

  if (structuredRows.length) {
    return structuredRows;
  }

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const parsed = parseRowFromText(line);
    if (parsed) structuredRows.push(parsed);
  }

  return structuredRows;
};

const parseStatementText = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") || raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed.transactions || parsed.items || [];
      return rows.map((row) => ({
        date: row.date || row.postedDate || row.transactionDate,
        type: row.type || row.transactionType,
        merchant: row.merchant || row.description || row.payee || row.name,
        amount: row.amount || row.value || row.total,
        category: row.category,
        notes: row.notes || row.memo || row.description || "",
      }));
    } catch {
      return [];
    }
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const header = lines[0];
  const delimiter = header.includes("\t") ? "\t" : header.includes("|") ? "|" : header.includes(";") ? ";" : ",";
  const isHeader = /(date|amount|description|merchant|payee|category)/i.test(header);

  if (isHeader) {
    const headers = splitDelimitedLine(lines[0], delimiter).map((value) => normalizeText(value));
    const indexFor = (patterns) => headers.findIndex((headerName) => patterns.some((pattern) => headerName.includes(pattern)));

    const dateIndex = indexFor(["date", "posted"]);
    const merchantIndex = indexFor(["merchant", "description", "payee", "name"]);
    const amountIndex = indexFor(["amount", "value", "debit", "credit", "total"]);
    const categoryIndex = indexFor(["category", "subcategory"]);
    const notesIndex = indexFor(["notes", "memo", "details", "reference"]);
    const typeIndex = indexFor(["type"]);

    return lines.slice(1).map((line) => {
      const columns = splitDelimitedLine(line, delimiter);
      return {
        date: columns[dateIndex],
        type: columns[typeIndex],
        merchant: columns[merchantIndex],
        amount: columns[amountIndex],
        category: columns[categoryIndex],
        notes: columns[notesIndex],
      };
    });
  }

  return lines
    .map((line) => {
      const parts = line.split(/\s*\|\s*|\s*;\s*|\t+/).filter(Boolean);
      if (parts.length < 3) {
        return null;
      }
      const amount = parts.find((part) => /-?\$?\d/.test(part)) || parts[parts.length - 1];
      const date = parts.find((part) => /\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(part)) || parts[0];
      const merchant = parts.find((part) => part !== date && part !== amount) || parts[1];
      return {
        date,
        merchant,
        amount,
        notes: line,
      };
    })
    .filter(Boolean);
};

const importStatementText = (text, sourceLabel = "statement", pdfPages = []) => {
  const palRows = extractPalReceiptRows(text, sourceLabel);
  if (palRows.length) {
    importRows(palRows, sourceLabel);
    return;
  }

  const unionBankRows = extractUnionBankRows(text, sourceLabel, pdfPages);
  if (unionBankRows.length) {
    importRows(unionBankRows, sourceLabel);
    return;
  }

  const bpiRows = extractBpiRows(text, sourceLabel, pdfPages);
  if (bpiRows.length) {
    importRows(bpiRows, sourceLabel);
    return;
  }

  const bdoRows = extractBdoRows(text, sourceLabel, pdfPages);
  if (bdoRows.length) {
    importRows(bdoRows, sourceLabel);
    return;
  }

  const rcbcRows = extractRcbcVisaRows(text, sourceLabel);
  if (rcbcRows.length) {
    importRows(rcbcRows, sourceLabel);
    return;
  }

  const gcashRows = extractGcashRows(text, sourceLabel, pdfPages);
  if (gcashRows.length) {
    importRows(gcashRows, sourceLabel);
    return;
  }

  const genericBankRows = extractGenericBankRows(text, sourceLabel, pdfPages);
  if (genericBankRows.length) {
    importRows(genericBankRows, sourceLabel);
    return;
  }

  const emailReceiptRows = extractEmailOrderReceiptRows(text, sourceLabel);
  if (emailReceiptRows.length) {
    importRows(emailReceiptRows, sourceLabel);
    return;
  }

  const rows = parseStatementText(text);
  if (!rows.length) {
    state.importMessage = `No line items found in ${sourceLabel}.`;
    if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    return;
  }

  const normalizedRows = rows.map((row) => {
    const amount = normalizeAmount(row.amount);
    const merchant = String(row.merchant || row.description || row.payee || row.name || "Imported item").trim();
    const notes = String(row.notes || row.memo || row.description || "").trim();
    const inferredType = row.type ? String(row.type).toLowerCase() : inferType(`${merchant} ${notes}`, amount);
    const finalType = /cash payment/i.test(`${merchant} ${notes}`) ? "transfer" : ["income", "transfer"].includes(inferredType) ? inferredType : "expense";
    const finalCategory = normalizeCategoryLabel(row.category || inferCategoryFromStatement(`${merchant} ${notes}`, finalType));
    const importEvidence = String(
      row.importEvidence || row.description || row.memo || row.payee || row.name || row.merchant || notes || merchant
    ).trim();

    return {
      id: uid(),
      date: normalizeDate(row.date),
      type: finalType,
      merchant,
      amount,
      category: finalCategory,
      notes,
      importedFrom: sourceLabel,
      importedAt: new Date().toISOString(),
      importEvidence,
      issue: null,
    };
  });

  importRows(normalizedRows, sourceLabel);
};

const importSpreadsheetFile = async (file) => {
  if (!window.XLSX) {
    state.importMessage = "Spreadsheet import is unavailable in this environment.";
    if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    return { ok: false, code: "UNAVAILABLE" };
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    state.importMessage = `No worksheet found in ${file.name}.`;
    if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    return { ok: false, code: "EMPTY_WORKBOOK" };
  }

  const sheet = workbook.Sheets[sheetName];
  const csv = window.XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  if (!csv.trim()) {
    state.importMessage = `No rows found in ${file.name}.`;
    if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    return { ok: false, code: "EMPTY_WORKSHEET" };
  }

  importStatementText(csv, file.name);
  return { ok: true };
};

const parsePdfBytes = async (bytes, password = "") => {
  let loadingTask;

  try {
    const pdfjs = await loadPdfModule();
    loadingTask = pdfjs.getDocument({
      data: bytes,
      password: password || undefined,
      disableWorker: true,
    });

    const pdf = await loadingTask.promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .map((item) => {
          const text = typeof item.str === "string" ? item.str.trim() : "";
          if (!text) return null;
          return {
            str: text,
            x: Number(item.transform?.[4] || 0),
            y: Number(item.transform?.[5] || 0),
          };
        })
        .filter(Boolean);
      const text = items.map((item) => item.str).join(" ");
      if (text.trim()) {
        pages.push({ pageNumber, text: text.trim(), items });
      }
    }

    return { ok: true, text: pages.map((page) => page.text).join("\n"), pages };
  } catch (error) {
    if (error?.message) {
      console.error("PDF import failed:", error);
    }
    if (error?.name === "PasswordException") {
      const pdfjs = window.pdfjsLib || (await loadPdfModule().catch(() => null));
      const incorrectPasswordCode = pdfjs?.PasswordResponses?.INCORRECT_PASSWORD;
      const code = error.code === incorrectPasswordCode ? "INCORRECT_PASSWORD" : "NEED_PASSWORD";
      const message = code === "INCORRECT_PASSWORD" ? "Incorrect password for this PDF." : "This PDF requires a password.";
      return { ok: false, code, message };
    }

    return { ok: false, code: "READ_ERROR", message: error.message || "Unable to read PDF file." };
  } finally {
    loadingTask.destroy?.();
  }
};

const importPdfStatement = async (file, password = "") => {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (typeof fm.parsePdfStatementBytes === "function") {
    const result = await fm.parsePdfStatementBytes(bytes, password);
    if (!result.ok) {
      return result;
    }

    importStatementText(result.text, file.name, result.pages || []);
    return { ok: true };
  }

  const result = await parsePdfBytes(bytes, password);
  if (!result.ok) {
    return result;
  }

  importStatementText(result.text, file.name, result.pages || []);
  return { ok: true };
};

const readFileAsText = async (file) => {
  if (typeof file.text === "function") {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read file"));
    reader.readAsText(file);
  });
};

const processStatementFiles = async (files) => {
  const inputFiles = Array.from(files || []);
  if (!inputFiles.length) return;
  closeTransactionsImportModal();

  const passwordQueue = [];
  const notes = [];

  const isPdfFile = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  const isSpreadsheetFile = (file) =>
    /\.xls$/i.test(file.name || "") ||
    /\.xlsx$/i.test(file.name || "") ||
    file.type === "application/vnd.ms-excel" ||
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  try {
    for (const file of inputFiles) {
      const fileName = file.name || "";
      try {
        if (isPdfFile(file)) {
          const result = await importPdfStatement(file);
          if (result.ok) {
            notes.push(`Imported ${fileName}.`);
            continue;
          }

          if (result.code === "NEED_PASSWORD" || result.code === "INCORRECT_PASSWORD") {
            passwordQueue.push(file);
            continue;
          }

          notes.push(result.message || `Could not open ${fileName}.`);
          continue;
        }

        if (isSpreadsheetFile(file)) {
          const result = await importSpreadsheetFile(file);
          if (!result.ok) {
            notes.push(result.message || `Could not open ${fileName}.`);
          } else {
            notes.push(`Imported ${fileName}.`);
          }
          continue;
        }

        const text = await readFileAsText(file);
        importStatementText(text, fileName);
        notes.push(`Imported ${fileName}.`);
      } catch (error) {
        notes.push(`Could not read ${fileName}. Please use CSV, TSV, TXT, JSON, PDF, XLS, XLSX, OFX, QFX, or HTML files.`);
      }
    }

    if (passwordQueue.length) {
      state.pendingPdfQueueTotal = passwordQueue.length;
      state.pendingPdfQueue = passwordQueue.slice(1);
      showPdfPasswordModal(passwordQueue[0], 1, passwordQueue.length);
    }

    if (notes.length) {
      state.importMessage = notes.join(" ");
      if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    }
  } finally {
    elements.statementUpload.value = "";
  }
};

const handleStatementUpload = async () => {
  await processStatementFiles(elements.statementUpload.files || []);
};

const openTransactionsImportPicker = async () => {
  closeTransactionsImportModal();

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.accept =
    ".csv,.tsv,.txt,.json,.pdf,.xls,.xlsx,.ofx,.qfx,.xml,.html,.htm,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  input.className = "hidden-file-input";
  input.setAttribute("aria-hidden", "true");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.top = "-9999px";

  const cleanupTimer = window.setTimeout(() => input.remove(), 30000);
  const cleanup = () => {
    window.clearTimeout(cleanupTimer);
    input.remove();
  };

  input.addEventListener(
    "change",
    async () => {
      try {
        await processStatementFiles(input.files || []);
      } finally {
        cleanup();
      }
    },
    { once: true }
  );

  document.body.appendChild(input);
  input.click();
};

const submitPdfPassword = async (event) => {
  event.preventDefault();
  const file = state.pendingPdfFile;
  if (!file) return;

  const password = elements.pdfPasswordInput.value;
  const result = await importPdfStatement(file, password);
  if (!result.ok) {
    if (result.code === "NEED_PASSWORD" || result.code === "INCORRECT_PASSWORD") {
      showPdfPasswordError(result.message || "That password did not work. Please try again.");
      return;
    }

    state.importMessage = result.message || `Could not open ${file.name}.`;
    if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
    hidePdfPasswordModal();
    return;
  }

  hidePdfPasswordModal(false);
  if (showNextPendingPdf()) {
    // The next modal invocation already shows the generic prompt and queue item.
  }
};

const handlePrimaryAction = () => {
  setScreen("line-items");
  openManualEntryModal();
};

const handleSecondaryAction = () => {
  if (state.screen === "overview") {
    setScreen("analytics");
    document.querySelector("[data-screen-panel='analytics']").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (state.screen === "line-items") {
    openTransactionsImportModal();
    return;
  }

  if (state.screen === "analytics") {
    renderAll();
    return;
  }

  setScreen("overview");
};

const init = async () => {
  const loaded = typeof fm.loadState === "function" ? await fm.loadState() : loadLocalItems();
  state.items = loaded ? normalizeItems(loaded) : cloneItems(seedItems);
  const loadedActivity = loadActivityLog();
  state.activityLog = Array.isArray(loadedActivity)
    ? loadedActivity
        .map((entry) => ({
          id: entry.id || uid(),
          at: entry.at || new Date().toISOString(),
          title: entry.title || "Activity",
          detail: entry.detail || "",
          kind: entry.kind || "info",
          undoable: Boolean(entry.undoable),
        }))
        .slice(0, 20)
    : [];
  const loadedViews = loadSavedViews();
  state.savedViews = Array.isArray(loadedViews)
    ? loadedViews
        .map((view) => ({
          ...view,
          id: view.id || uid(),
          name: view.name || "Saved view",
        }))
        .slice(0, 12)
    : [];
  if (!state.periodAnchor) {
    state.periodAnchor = localDate();
  }
  ensurePeriodDefaults();
  if (!loaded) {
    await saveItems();
  }

  elements.form.elements.date.value = localDate();
  if (elements.searchInput) {
    elements.searchInput.value = state.query;
  }
  syncTransactionsSearchControls();
  syncTransactionsAddMenu();
  if (elements.categoryFilter) {
    elements.categoryFilter.value = state.categoryFilter;
  }
  if (elements.importStatus) elements.importStatus.textContent = state.importMessage;
  renderAll();
  setScreen(state.screen);
  refreshSavedViewSelect();
  resetForm();
};

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const screenButton = target.closest("[data-screen]");
  if (screenButton) {
    setScreen(screenButton.dataset.screen);
    return;
  }

  const filterButton = target.closest("[data-filter]");
  if (filterButton) {
    setFilter(filterButton.dataset.filter);
    return;
  }

  const accountHeader = target.closest(".line-item-header-cell--account-header");
  if (accountHeader) {
    const accountFilterButton = target.closest("[data-column-filter-field]");
    if (accountFilterButton) {
      const field = accountFilterButton.dataset.columnFilterField;
      if (field) {
        state.activeColumnFilter = state.activeColumnFilter === field ? "" : field;
        renderDateFilterUI();
      }
    } else {
      setSortField("source");
    }
    return;
  }

  const columnFilterButton = target.closest("[data-column-filter-field]");
  if (columnFilterButton) {
    const field = columnFilterButton.dataset.columnFilterField;
    if (field) {
      state.activeColumnFilter = state.activeColumnFilter === field ? "" : field;
      renderDateFilterUI();
    }
    return;
  }

  const sortButton = target.closest("[data-sort-field]");
  if (sortButton) {
    setSortField(sortButton.dataset.sortField);
    return;
  }

  if (state.screen === "line-items" && elements.transactionsSearchPopover) {
    const clickedSearchTrigger = target.closest("#transactions-search-trigger");
    const clickedInsideSearch = target.closest("#transactions-search-popover");
    if (clickedSearchTrigger) {
      if (state.transactionsSearchOpen) {
        closeTransactionsSearchPopover();
      } else {
        openTransactionsSearchPopover();
      }
      return;
    }
    if (state.transactionsSearchOpen && !clickedInsideSearch) {
      closeTransactionsSearchPopover();
    }
  }

  if (state.screen === "line-items" && elements.transactionsAddMenu) {
    const clickedInsideAddMenu = target.closest(".transactions-add-menu");
    if (state.transactionsAddMenuOpen && !clickedInsideAddMenu) {
      closeTransactionsAddMenu();
    }
  }

  if (state.screen === "line-items" && elements.transactionsDownloadMenu) {
    const clickedDownloadToggle = target.closest("#transactions-download");
    const clickedInsideDownloadMenu = target.closest(".transactions-download-menu");
    if (clickedDownloadToggle) {
      toggleTransactionsDownloadMenu();
      return;
    }
    if (state.transactionsDownloadMenuOpen && !clickedInsideDownloadMenu) {
      closeTransactionsDownloadMenu();
    }
  }

  if (
    elements.sourceModal &&
    !elements.sourceModal.hidden &&
    !target.closest(".source-popover") &&
    !target.closest(".item-source")
  ) {
    closeSourceModal();
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.form).entries());
  await createOrUpdateItem(data);
});

elements.form.addEventListener("reset", () => window.setTimeout(resetForm, 0));
elements.primaryAction?.addEventListener("click", handlePrimaryAction);
elements.secondaryAction?.addEventListener("click", handleSecondaryAction);
elements.heroStart?.addEventListener("click", handlePrimaryAction);
elements.heroAnalytics?.addEventListener("click", () => setScreen("analytics"));
elements.transactionsSearchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    setQuery(elements.transactionsSearchInput.value);
    closeTransactionsSearchPopover();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeTransactionsSearchPopover();
  }
});
elements.transactionsSearchClear?.addEventListener("click", () => {
  setQuery("");
  elements.transactionsSearchInput?.focus();
});
elements.transactionsSearchApply?.addEventListener("click", () => {
  if (!(elements.transactionsSearchInput instanceof HTMLInputElement)) return;
  setQuery(elements.transactionsSearchInput.value);
  closeTransactionsSearchPopover();
});
elements.transactionsSearchCancel?.addEventListener("click", () => {
  syncTransactionsSearchControls();
  closeTransactionsSearchPopover();
});
elements.transactionsAdd?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (state.screen !== "line-items") return;
  toggleTransactionsAddMenu();
});
elements.transactionsDownload?.addEventListener("click", () => {
  if (state.screen !== "line-items") return;
  toggleTransactionsDownloadMenu();
});
elements.transactionsDownloadCsv?.addEventListener("click", () => {
  closeTransactionsDownloadMenu();
  exportTransactionsCsv(sortItems(filteredItems()), `clover-transactions-${localDate()}.csv`);
  recordActivity({ title: "Exported CSV", detail: "Transactions report downloaded", kind: "info" });
});
  elements.transactionsDownloadPdf?.addEventListener("click", () => {
    closeTransactionsDownloadMenu();
    exportTransactionsPdf(sortItems(filteredItems()), `clover-transactions-${localDate()}.pdf`);
    recordActivity({ title: "Exported PDF", detail: "Transactions report downloaded", kind: "info" });
  });
elements.transactionsAddTransaction?.addEventListener("click", () => {
  closeTransactionsAddMenu();
  handlePrimaryAction();
});
elements.transactionsImportFiles?.addEventListener("click", () => {
  closeTransactionsAddMenu();
  openTransactionsImportPicker();
});
elements.transactionsUndo?.addEventListener("click", undoLastChange);
elements.transactionsRedo?.addEventListener("click", redoLastChange);
elements.transactionsSummaryToggle?.addEventListener("click", () => {
  closeTransactionsAddMenu();
  closeTransactionsSearchPopover();
  closeTransactionsDownloadMenu();
  state.transactionsSummaryOpen = !state.transactionsSummaryOpen;
  syncTransactionsPanelState();
});
elements.transactionsImportChoose?.addEventListener("click", () => {
  openTransactionsImportPicker();
});
elements.transactionsImportClose?.addEventListener("click", closeTransactionsImportModal);
elements.transactionsImportCancel?.addEventListener("click", closeTransactionsImportModal);
elements.transactionsImportModal?.addEventListener("click", (event) => {
  if (event.target === elements.transactionsImportModal) closeTransactionsImportModal();
});
elements.transactionsDateTrigger?.addEventListener("click", () => {
  setScreen("line-items");
  openDateFilterModal();
});
elements.transactionsFiltersTrigger?.addEventListener("click", () => {
  setScreen("line-items");
  state.activeColumnFilter = state.activeColumnFilter === "category" ? "" : "category";
  renderLineItems();
});
elements.transactionsBulkEdit?.addEventListener("click", openBulkEditModal);
elements.summaryDownloadTransactions?.addEventListener("click", () => {
  exportTransactionsCsv(sortItems(filteredItems()), `clover-transactions-${localDate()}.csv`);
  recordActivity({ title: "Exported CSV", detail: "Transactions summary downloaded", kind: "info" });
});
elements.warningSummary?.addEventListener("click", () => {
  focusNextWarningItem();
});
elements.statementUpload?.addEventListener("change", handleStatementUpload);
elements.pdfPasswordForm?.addEventListener("submit", submitPdfPassword);
elements.pdfPasswordCancel?.addEventListener("click", hidePdfPasswordModal);
elements.pdfPasswordModal?.addEventListener("click", (event) => {
  if (event.target === elements.pdfPasswordModal) hidePdfPasswordModal();
});
elements.bulkEditForm?.addEventListener("submit", submitBulkEdit);
elements.bulkEditClose?.addEventListener("click", closeBulkEditModal);
elements.bulkEditCancel?.addEventListener("click", closeBulkEditModal);
elements.bulkEditModal?.addEventListener("click", (event) => {
  if (event.target === elements.bulkEditModal) closeBulkEditModal();
});
elements.sourceForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const source = String(elements.sourceInput?.value || "").trim();
  const targetId = state.pendingSourceTarget?.itemId;
  if (!source) {
    if (elements.sourceError) {
      elements.sourceError.hidden = false;
      elements.sourceError.textContent = "Enter a source name to continue.";
    }
    elements.sourceInput?.focus();
    return;
  }
  if (!targetId) {
    closeSourceModal();
    return;
  }
  await updateItemField(targetId, { source });
  closeSourceModal();
});
elements.sourceCancel?.addEventListener("click", closeSourceModal);
elements.manualEntryModal?.addEventListener("click", (event) => {
  if (event.target === elements.manualEntryModal) closeManualEntryModal();
});
elements.itemDetailModal?.addEventListener("click", (event) => {
  if (event.target === elements.itemDetailModal) closeItemDetailModal();
});
elements.manualEntryClose?.addEventListener("click", closeManualEntryModal);
elements.itemDetailClose?.addEventListener("click", closeItemDetailModal);
elements.itemDetailDelete?.addEventListener("click", async () => {
  if (state.selectedItemId) {
    const id = state.selectedItemId;
    closeItemDetailModal();
    await deleteItem(id);
  }
});
elements.bulkDelete?.addEventListener("click", deleteSelectedItems);
elements.clearSelection?.addEventListener("click", () => {
  clearSelectedItems();
  renderAll();
});
elements.selectAll?.addEventListener("change", () => {
  const shouldSelectAll = Boolean(elements.selectAll.checked);
  setSelectedItems(shouldSelectAll ? state.items.map((item) => item.id) : []);
  renderAll();
});
elements.dateFilterTrigger?.addEventListener("click", openDateFilterModal);
elements.dateFilterClose?.addEventListener("click", closeDateFilterModal);
elements.dateFilterDone?.addEventListener("click", closeDateFilterModal);
elements.dateFilterReset?.addEventListener("click", resetDateFilter);
elements.dateFilterModal?.addEventListener("click", (event) => {
  if (event.target === elements.dateFilterModal) closeDateFilterModal();
});
elements.dateFilterTabs?.forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.dateTab;
    if (tab === "custom") {
      setPeriod("custom");
    } else {
      setPeriod(state.periodBeforeCustom || "ltd");
    }
    renderDateFilterUI();
  });
});
elements.dateFilterPanel?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("[data-period-choice]")) {
    setPeriod(target.dataset.periodChoice || "ltd");
    renderDateFilterUI();
  }
});
elements.dateFilterPanel?.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("[data-period-day]")) {
    state.periodAnchor = target.value;
    if (state.period === "day") renderLineItems();
  }
});
elements.dateFilterPanel?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("[data-period-year]")) {
    state.periodYear = target.value;
    if (state.period === "week") {
      state.periodWeekIndex = currentWeekIndexForYear(state.periodYear, state.periodAnchor || localDate());
    }
    if (["week", "month", "quarter", "year"].includes(state.period)) renderLineItems();
    return;
  }
  if (target.matches("[data-period-month]")) {
    state.periodMonth = target.value;
    if (state.period === "month") renderLineItems();
    return;
  }
  if (target.matches("[data-period-quarter]")) {
    state.periodQuarter = target.value;
    if (state.period === "quarter") renderLineItems();
    return;
  }
  if (target.matches("[data-period-week]")) {
    state.periodWeekIndex = target.value;
    if (state.period === "week") renderLineItems();
    return;
  }
  if (target.matches("[data-custom-start]")) {
    state.customStart = target.value;
    if (state.period === "custom") renderLineItems();
    return;
  }
  if (target.matches("[data-custom-end]")) {
    state.customEnd = target.value;
    if (state.period === "custom") renderLineItems();
  }
});
elements.analyticsDateTrigger?.addEventListener("click", openDateFilterModal);
elements.analyticsTrendView?.addEventListener("change", () => {
  state.analyticsTrendView = elements.analyticsTrendView.value || "month";
  renderAnalytics();
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof HTMLElement)) return;
  if (state.screen === "line-items" && state.activeColumnFilter) {
    const clickedInsideFilter = event.target.closest(".line-item-header, .column-filter-tray");
    if (!clickedInsideFilter && !event.target.closest("[data-sort-field]")) {
      state.activeColumnFilter = "";
      renderDateFilterUI();
    }
  }
  if (state.screen === "analytics" && elements.searchInput && !elements.searchInput.contains(event.target)) {
    if (state.analyticsCatalogOpen) {
      state.analyticsCatalogOpen = false;
      renderAnalyticsBrowser();
    }
  }
});
const topbarSearchInput = elements.searchInput;
topbarSearchInput?.addEventListener("focus", () => {
  if (state.screen === "analytics") {
    state.analyticsCatalogOpen = true;
    renderAnalyticsBrowser();
  }
});
topbarSearchInput?.addEventListener("input", () => {
  if (!(topbarSearchInput instanceof HTMLInputElement)) return;
  if (state.screen === "analytics") {
    state.analyticsSearch = topbarSearchInput.value;
    state.analyticsCatalogOpen = true;
    renderAnalyticsBrowser();
    return;
  }
  setQuery(topbarSearchInput.value);
});
topbarSearchInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !(topbarSearchInput instanceof HTMLInputElement)) return;
  if (state.screen === "analytics") {
    state.analyticsCatalogOpen = false;
    state.analyticsSearch = "";
    topbarSearchInput.value = "";
    renderAnalyticsBrowser();
    return;
  }
  topbarSearchInput.value = "";
  setQuery("");
});
elements.categoryFilter?.addEventListener("change", () => setCategoryFilter(elements.categoryFilter.value));
elements.accountSortButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setSortField("source");
});
elements.accountFilterButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  state.activeColumnFilter = state.activeColumnFilter === "source" ? "" : "source";
  renderDateFilterUI();
});
elements.categorySortButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setSortField("category");
});
elements.categoryFilterButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  state.activeColumnFilter = state.activeColumnFilter === "category" ? "" : "category";
  renderDateFilterUI();
});
  elements.sourceFilter?.addEventListener("change", () => {
  state.sourceFilter = elements.sourceFilter.value || "all";
  state.sourceFilters = state.sourceFilter !== "all" ? [state.sourceFilter] : [];
  renderLineItems();
});
elements.typeFilter?.addEventListener("change", () => {
  state.typeFilter = elements.typeFilter.value || "all";
  renderLineItems();
});
elements.amountMinFilter?.addEventListener("input", () => {
  state.amountMinFilter = elements.amountMinFilter.value || "";
  renderLineItems();
});
elements.amountMaxFilter?.addEventListener("input", () => {
  state.amountMaxFilter = elements.amountMaxFilter.value || "";
  renderLineItems();
});
elements.savedViewSelect?.addEventListener("change", () => {
  const value = elements.savedViewSelect.value;
  if (!value) return;
  if (value.startsWith("preset:")) {
    applyPresetView(value.slice("preset:".length));
    elements.savedViewSelect.value = value;
    return;
  }
  const view = state.savedViews.find((entry) => entry.id === value);
  if (!view) return;
  applySavedView(view);
});
elements.saveViewButton?.addEventListener("click", saveCurrentView);
elements.scrollTopFab?.addEventListener("click", () => {
  if (state.screen === "line-items" && elements.tableWrap) {
    elements.tableWrap.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
});
elements.tableWrap?.addEventListener("scroll", updateScrollTopFab, { passive: true });
window.addEventListener("scroll", updateScrollTopFab, { passive: true });

window.financeManager = window.financeManager || fm;
window.financeManager.importStatementText = importStatementText;
window.financeManager.importSpreadsheetFile = importSpreadsheetFile;

bindDetailEditors();
setFilter("all");
init();
