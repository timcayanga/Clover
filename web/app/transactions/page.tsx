"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  currency: string;
};

type Category = {
  id: string;
  name: string;
  type: "income" | "expense" | "transfer";
};

type Transaction = {
  id: string;
  accountId: string;
  accountName: string;
  categoryId: string | null;
  categoryName: string | null;
  date: string;
  amount: string;
  currency: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string | null;
  description?: string | null;
  isTransfer: boolean;
  isExcluded: boolean;
};

type ImportFile = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
};

type DateFilterMode = "ltd" | "day" | "week" | "month" | "quarter" | "year" | "custom";

type ManualTransactionForm = {
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  merchantRaw: string;
  merchantClean: string;
  description: string;
};

type BulkEditForm = {
  accountId: string;
  categoryId: string;
  type: "" | "income" | "expense" | "transfer";
  description: string;
  isExcluded: "" | "include" | "exclude";
  isTransfer: "" | "true" | "false";
};

type TransactionDetailDraft = {
  merchantRaw: string;
  merchantClean: string;
  date: string;
  accountId: string;
  categoryId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  description: string;
  isExcluded: boolean;
  isTransfer: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const todayIso = new Date().toISOString().slice(0, 10);

const createEmptyManualForm = (accountId = ""): ManualTransactionForm => ({
  date: todayIso,
  accountId,
  categoryId: "",
  amount: "",
  type: "expense",
  merchantRaw: "",
  merchantClean: "",
  description: "",
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const downloadTextFile = (filename: string, contents: string, mimeType: string) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const dateAtNoon = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00`);

const startOfWeekIso = (value: string) => {
  const date = dateAtNoon(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return toIsoDate(date);
};

const endOfWeekIso = (value: string) => {
  const date = dateAtNoon(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() + (6 - day));
  return toIsoDate(date);
};

const startOfMonthIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setDate(1);
  return toIsoDate(date);
};

const endOfMonthIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(date.getMonth() + 1, 0);
  return toIsoDate(date);
};

const startOfQuarterIso = (value: string) => {
  const date = dateAtNoon(value);
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  date.setMonth(quarterStartMonth, 1);
  return toIsoDate(date);
};

const endOfQuarterIso = (value: string) => {
  const date = dateAtNoon(value);
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  date.setMonth(quarterStartMonth + 3, 0);
  return toIsoDate(date);
};

const startOfYearIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(0, 1);
  return toIsoDate(date);
};

const endOfYearIso = (value: string) => {
  const date = dateAtNoon(value);
  date.setMonth(11, 31);
  return toIsoDate(date);
};

const getDateFilterLabel = (mode: DateFilterMode, anchor: string, customStart: string, customEnd: string) => {
  switch (mode) {
    case "day":
      return "Today";
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "quarter":
      return "This quarter";
    case "year":
      return "This year";
    case "custom":
      return customStart && customEnd ? `${formatDate(customStart)} - ${formatDate(customEnd)}` : "Custom range";
    default:
      return "Lifetime to date";
  }
};

const dateMatchesFilter = (dateValue: string, mode: DateFilterMode, anchor: string, customStart: string, customEnd: string) => {
  const date = dateValue.slice(0, 10);
  if (mode === "ltd") {
    return true;
  }
  if (mode === "day") {
    return date === anchor.slice(0, 10);
  }
  if (mode === "week") {
    return date >= startOfWeekIso(anchor) && date <= endOfWeekIso(anchor);
  }
  if (mode === "month") {
    return date >= startOfMonthIso(anchor) && date <= endOfMonthIso(anchor);
  }
  if (mode === "quarter") {
    return date >= startOfQuarterIso(anchor) && date <= endOfQuarterIso(anchor);
  }
  if (mode === "year") {
    return date >= startOfYearIso(anchor) && date <= endOfYearIso(anchor);
  }
  if (mode === "custom") {
    if (!customStart && !customEnd) {
      return true;
    }
    if (customStart && date < customStart) {
      return false;
    }
    if (customEnd && date > customEnd) {
      return false;
    }
    return true;
  }
  return true;
};

const createEmptyBulkEditForm = (): BulkEditForm => ({
  accountId: "",
  categoryId: "",
  type: "",
  description: "",
  isExcluded: "",
  isTransfer: "",
});

const createDetailDraft = (transaction: Transaction): TransactionDetailDraft => ({
  merchantRaw: transaction.merchantRaw,
  merchantClean: transaction.merchantClean ?? "",
  date: transaction.date.slice(0, 10),
  accountId: transaction.accountId,
  categoryId: transaction.categoryId ?? "",
  amount: transaction.amount,
  type: transaction.type,
  description: transaction.description ?? "",
  isExcluded: transaction.isExcluded,
  isTransfer: transaction.isTransfer,
});

function ActionIcon({
  name,
}: {
  name: "plus" | "chevron-down" | "undo" | "redo" | "search" | "calendar" | "filters" | "summary" | "save" | "download";
}) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case "undo":
      return (
        <svg {...common}>
          <path d="M9 7H5v4" />
          <path d="M5 11c1.8-3 5-5 8.5-5 4.4 0 8 3.6 8 8s-3.6 8-8 8c-3.1 0-5.8-1.7-7.1-4.2" />
        </svg>
      );
    case "redo":
      return (
        <svg {...common}>
          <path d="M15 7h4v4" />
          <path d="M19 11c-1.8-3-5-5-8.5-5-4.4 0-8 3.6-8 8s3.6 8 8 8c3.1 0 5.8-1.7 7.1-4.2" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="5.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M4 9h16" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 7h16" />
          <path d="M7 12h10" />
          <path d="M10 17h4" />
        </svg>
      );
    case "summary":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="16" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v5h8V5" />
          <path d="M9 19v-6h6v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TransactionsPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [imports, setImports] = useState<ImportFile[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [message, setMessage] = useState("Select a workspace to review transactions.");
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [detailDraft, setDetailDraft] = useState<TransactionDetailDraft | null>(null);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("ltd");
  const [dateFilterAnchor, setDateFilterAnchor] = useState(todayIso);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(createEmptyBulkEditForm());
  const [manualForm, setManualForm] = useState<ManualTransactionForm>(createEmptyManualForm());
  const [isSaving, setIsSaving] = useState(false);

  const workspace = workspaces.find((entry) => entry.id === selectedWorkspaceId) ?? null;

  const loadWorkspaces = async () => {
    const response = await fetch("/api/workspaces");
    if (!response.ok) return;
    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => current || items[0]?.id || "");
  };

  const loadWorkspaceData = async (workspaceId: string) => {
    if (!workspaceId) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setImports([]);
      return;
    }

    const [accountsResponse, categoriesResponse, transactionsResponse, importResponse] = await Promise.all([
      fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/categories?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`),
      fetch(`/api/imports?workspaceId=${encodeURIComponent(workspaceId)}`),
    ]);

    if (accountsResponse.ok) {
      const payload = await accountsResponse.json();
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
    }

    if (categoriesResponse.ok) {
      const payload = await categoriesResponse.json();
      setCategories(Array.isArray(payload.categories) ? payload.categories : []);
    }

    if (transactionsResponse.ok) {
      const payload = await transactionsResponse.json();
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    }

    if (importResponse.ok) {
      const payload = await importResponse.json();
      setImports(Array.isArray(payload.importFiles) ? payload.importFiles : []);
    }
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    void loadWorkspaceData(selectedWorkspaceId);
    setSelectedTransactionIds([]);
    setSelectedTransaction(null);
    setDetailDraft(null);
  }, [selectedWorkspaceId]);

  const ensureDefaultAccount = async (workspaceId: string) => {
    if (accounts.length > 0) {
      return accounts[0].id;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: "Imported transactions",
        institution: "Source upload",
        type: "bank",
        currency: "PHP",
        source: "upload",
      }),
    });

    if (!response.ok) {
      throw new Error("Unable to create a default account for this workspace.");
    }

    const data = await response.json();
    const accountId = data.account?.id as string | undefined;

    if (!accountId) {
      throw new Error("Default account was not created.");
    }

    setAccounts([data.account]);
    return accountId;
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const term = query.trim().toLowerCase();
      const matchesQuery =
        !term ||
        transaction.merchantRaw.toLowerCase().includes(term) ||
        (transaction.merchantClean ?? "").toLowerCase().includes(term) ||
        (transaction.description ?? "").toLowerCase().includes(term);
      const matchesCategory = categoryFilter === "all" || transaction.categoryId === categoryFilter;
      const matchesAccount = accountFilter === "all" || transaction.accountId === accountFilter;
      const matchesType = typeFilter === "all" || transaction.type === typeFilter;
      const matchesDate = dateMatchesFilter(transaction.date, dateFilterMode, dateFilterAnchor, customStart, customEnd);
      return matchesQuery && matchesCategory && matchesAccount && matchesType && matchesDate;
    });
  }, [transactions, query, categoryFilter, accountFilter, typeFilter, dateFilterMode, dateFilterAnchor, customStart, customEnd]);

  const duplicateLookup = useMemo(() => {
    const counts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const signature = [
        transaction.date.slice(0, 10),
        Number(transaction.amount).toFixed(2),
        (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
      ].join("|");

      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }

    return counts;
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (accumulator, transaction) => {
        const amount = Math.abs(Number(transaction.amount));
        const signature = [
          transaction.date.slice(0, 10),
          Number(transaction.amount).toFixed(2),
          (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
        ].join("|");
        const hasReviewIssue =
          transaction.isExcluded ||
          transaction.isTransfer ||
          !transaction.categoryId ||
          (duplicateLookup.get(signature) ?? 0) > 1;

        if (transaction.isExcluded) {
          if (hasReviewIssue) {
            accumulator.review += 1;
          }
          return accumulator;
        }

        if (transaction.type === "income") {
          accumulator.income += amount;
        } else {
          accumulator.expense += amount;
        }

        if (hasReviewIssue) {
          accumulator.review += 1;
        }

        return accumulator;
      },
      { income: 0, expense: 0, review: 0 }
    );
  }, [filteredTransactions, duplicateLookup]);

  const importSummary = useMemo(() => {
    return imports.reduce(
      (accumulator, file) => {
        if (file.status === "processing") {
          accumulator.processing += 1;
        } else if (file.status === "done") {
          accumulator.done += 1;
        } else if (file.status === "failed") {
          accumulator.failed += 1;
        }
        return accumulator;
      },
      { processing: 0, done: 0, failed: 0 }
    );
  }, [imports]);

  const summaryData = useMemo(() => {
    const topCategories = new Map<string, number>();
    const topAccounts = new Map<string, number>();

    for (const transaction of filteredTransactions) {
      const amount = Math.abs(Number(transaction.amount));
      topCategories.set(transaction.categoryName ?? "Unassigned", (topCategories.get(transaction.categoryName ?? "Unassigned") ?? 0) + amount);
      topAccounts.set(transaction.accountName, (topAccounts.get(transaction.accountName) ?? 0) + amount);
    }

    const topCategory = Array.from(topCategories.entries()).sort((a, b) => b[1] - a[1])[0];
    const topAccount = Array.from(topAccounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const sortedDates = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstTransaction = sortedDates[0];
    const lastTransaction = sortedDates[sortedDates.length - 1];

    return {
      topCategory,
      topAccount,
      firstTransaction,
      lastTransaction,
    };
  }, [filteredTransactions]);

  const warningReasonFor = (transaction: Transaction) => {
    const signature = [
      transaction.date.slice(0, 10),
      Number(transaction.amount).toFixed(2),
      (transaction.merchantClean ?? transaction.merchantRaw).trim().toLowerCase(),
    ].join("|");

    if (transaction.isExcluded) {
      return "Excluded from totals";
    }

    if (transaction.isTransfer) {
      return "Marked as transfer";
    }

    if (!transaction.categoryId) {
      return "Needs category review";
    }

    if ((duplicateLookup.get(signature) ?? 0) > 1) {
      return "Possible duplicate";
    }

    return null;
  };

  const openTransactionDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setDetailDraft(createDetailDraft(transaction));
  };

  const closeTransactionDetail = () => {
    setSelectedTransaction(null);
    setDetailDraft(null);
  };

  const toggleSelectedTransaction = (transactionId: string, selected: boolean) => {
    setSelectedTransactionIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(transactionId);
      } else {
        next.delete(transactionId);
      }
      return Array.from(next);
    });
  };

  const clearSelection = () => {
    setSelectedTransactionIds([]);
  };

  const openBulkEdit = () => {
    setBulkEditForm(createEmptyBulkEditForm());
    setBulkEditOpen(true);
  };

  const openManualAdd = async () => {
    setAddMenuOpen(false);

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    try {
      const accountId = await ensureDefaultAccount(selectedWorkspaceId);
      setManualForm(createEmptyManualForm(accountId));
      setManualOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to prepare transaction form.");
    }
  };

  const saveManualTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedWorkspaceId) {
      setMessage("Choose a workspace first.");
      return;
    }

    setIsSaving(true);
    try {
      const accountId = manualForm.accountId || (await ensureDefaultAccount(selectedWorkspaceId));

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          accountId,
          categoryId: manualForm.categoryId || null,
          date: manualForm.date,
          amount: manualForm.amount,
          currency: "PHP",
          type: manualForm.type,
          merchantRaw: manualForm.merchantRaw,
          merchantClean: manualForm.merchantClean.trim() || null,
          description: manualForm.description.trim() || null,
          isTransfer: manualForm.type === "transfer",
          isExcluded: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create transaction.");
      }

      const payload = await response.json();
      const created = payload.transaction as Transaction;
      setTransactions((current) => [created, ...current]);
      setManualOpen(false);
      setMessage(`Transaction "${created.merchantRaw}" added.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const updateTransaction = async (transactionId: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Unable to update transaction.");
    }

    const payload = await response.json();
    const updated = payload.transaction as Transaction;
    setTransactions((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
  };

  const applyBulkEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedTransactionIds.length) {
      setMessage("Select transactions first.");
      return;
    }

    setIsSaving(true);
    try {
      const updates = selectedTransactionIds.map((transactionId) =>
        updateTransaction(transactionId, {
          accountId: bulkEditForm.accountId || undefined,
          categoryId: bulkEditForm.categoryId || undefined,
          type: bulkEditForm.type || undefined,
          description: bulkEditForm.description ? bulkEditForm.description : undefined,
          isExcluded:
            bulkEditForm.isExcluded === ""
              ? undefined
              : bulkEditForm.isExcluded === "exclude",
          isTransfer:
            bulkEditForm.isTransfer === ""
              ? undefined
              : bulkEditForm.isTransfer === "true",
        })
      );

      await Promise.all(updates);
      setBulkEditOpen(false);
      clearSelection();
      setMessage(`${selectedTransactionIds.length} transaction${selectedTransactionIds.length === 1 ? "" : "s"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transactions.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveDetailDraft = async () => {
    if (!selectedTransaction || !detailDraft) {
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        merchantRaw: detailDraft.merchantRaw,
        merchantClean: detailDraft.merchantClean || null,
        date: detailDraft.date,
        accountId: detailDraft.accountId,
        categoryId: detailDraft.categoryId || null,
        amount: detailDraft.amount,
        type: detailDraft.type,
        description: detailDraft.description || null,
        isExcluded: detailDraft.isExcluded,
        isTransfer: detailDraft.isTransfer,
      };

      await updateTransaction(selectedTransaction.id, payload);
      setMessage("Transaction details updated.");
      closeTransactionDetail();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update transaction.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveView = () => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "clover.transactions.view",
      JSON.stringify({
        workspaceId: selectedWorkspaceId,
        query,
        categoryFilter,
        accountFilter,
        typeFilter,
      })
    );
    setMessage("Current view saved.");
  };

  const downloadCsv = () => {
    const header = ["Name", "Date", "Account", "Category", "Amount", "Type", "Notes", "Warning"];
    const rows = filteredTransactions.map((transaction) => [
      transaction.merchantClean ?? transaction.merchantRaw,
      formatDate(transaction.date),
      transaction.accountName,
      transaction.categoryName ?? "Unassigned",
      transaction.amount,
      transaction.type,
      transaction.description ?? "",
      warningReasonFor(transaction) ?? "",
    ]);

    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll("\"", '""')}"`)
          .join(",")
      )
      .join("\n");

    downloadTextFile("clover-transactions.csv", csv, "text/csv;charset=utf-8;");
  };

  const downloadPdf = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const netGain = totals.income - totals.expense;
  const hasReviewItems = totals.review > 0;
  const dateFilterLabel = getDateFilterLabel(dateFilterMode, dateFilterAnchor, customStart, customEnd);

  return (
    <CloverShell active="transactions" title="Transactions" showTopbar={false}>
      <section className={`transactions-layout ${summaryOpen ? "transactions-layout--summary-open" : ""}`}>
        <div className="glass table-panel table-panel--full transactions-table-panel transactions-main-panel">
          <div className="transactions-topbar">
            <div className="transactions-top-actions">
              <div className="transactions-add-menu" id="transactions-add-menu">
                <button
                  className="button button-primary button-small transactions-action-button transactions-add-menu__toggle"
                  type="button"
                  onClick={() => setAddMenuOpen((current) => !current)}
                  aria-expanded={addMenuOpen}
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="plus" />
                  </span>
                  <span>Add</span>
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="chevron-down" />
                  </span>
                </button>
                <div className="transactions-add-menu__panel" hidden={!addMenuOpen}>
                  <button className="transactions-add-menu__item" type="button" onClick={openManualAdd}>
                    Add transaction
                  </button>
                  <button className="transactions-add-menu__item" type="button" onClick={() => router.push("/imports")}>
                    Import files
                  </button>
                </div>
              </div>

              {selectedTransactionIds.length > 0 ? (
                <button
                  className="button button-secondary button-small transactions-action-button"
                  type="button"
                  title={`Bulk edit ${selectedTransactionIds.length} selected transaction${selectedTransactionIds.length === 1 ? "" : "s"}`}
                  onClick={openBulkEdit}
                >
                  <span className="button-icon" aria-hidden="true">
                    ☰
                  </span>
                  <span>Bulk edit ({selectedTransactionIds.length})</span>
                </button>
              ) : null}

              <button className="button button-secondary button-small transactions-action-button" type="button" title="Undo">
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="undo" />
                </span>
                Undo
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" title="Redo">
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="redo" />
                </span>
                Redo
              </button>
            </div>

            <div className="transactions-top-actions transactions-top-actions--right">
              <button
                className="button button-secondary button-small transactions-action-button transactions-search-trigger"
                type="button"
                onClick={() => searchInputRef.current?.focus()}
                title="Search"
              >
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="search" />
                </span>
                <span>Search</span>
              </button>
              <button
                className="button button-secondary button-small transactions-action-button"
                type="button"
                title={dateFilterLabel}
                onClick={() => setDateFilterOpen(true)}
              >
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="calendar" />
                </span>
                <span>Date</span>
              </button>
              <button
                className="button button-secondary button-small transactions-action-button"
                type="button"
                title="Filters"
                onClick={() => setFilterOpen(true)}
              >
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="filters" />
                </span>
                <span>Filters</span>
              </button>
              <button
                className="button button-secondary button-small transactions-action-button transactions-summary-toggle-button"
                type="button"
                aria-pressed={summaryOpen}
                onClick={() => setSummaryOpen((current) => !current)}
                title="Summary"
              >
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="summary" />
                </span>
                <span>Summary</span>
              </button>
              <button className="button button-secondary button-small transactions-action-button" type="button" onClick={saveView} title="Save view">
                <span className="button-icon" aria-hidden="true">
                  <ActionIcon name="save" />
                </span>
                <span>Save View</span>
              </button>
              <div className="transactions-download-menu" id="transactions-download-menu">
                <button
                  className="button button-secondary button-small transactions-action-button transactions-download-menu__toggle"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={downloadMenuOpen}
                  onClick={() => setDownloadMenuOpen((current) => !current)}
                  title="Download"
                >
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="download" />
                  </span>
                  <span>Download</span>
                  <span className="button-icon" aria-hidden="true">
                    <ActionIcon name="chevron-down" />
                  </span>
                </button>
                <div className="transactions-download-menu__panel" hidden={!downloadMenuOpen}>
                  <button className="transactions-download-menu__item" type="button" onClick={downloadCsv}>
                    CSV
                  </button>
                  <button className="transactions-download-menu__item" type="button" onClick={downloadPdf}>
                    PDF
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="transactions-filter-strip">
            <div className="transactions-filter-grid">
              <label>
                Workspace
                <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
                  <option value="">Choose workspace</option>
                  {workspaces.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Merchant, note, or alias"
                />
              </label>
              <label>
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                  <option value="all">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
            </div>
          </div>

          <div className="transactions-status-line">
            <span className="pill pill-neutral">
              {workspace ? `${workspace.name}` : "No workspace selected"} · {filteredTransactions.length} items shown
            </span>
            <div className="transactions-status-line__meta">
              {selectedTransactionIds.length > 0 ? (
                <button className="pill pill-neutral transactions-clear-selection" type="button" onClick={clearSelection}>
                  {selectedTransactionIds.length} selected · clear
                </button>
              ) : null}
              <span className="pill pill-neutral">{imports.length} import file{imports.length === 1 ? "" : "s"}</span>
              <span className="pill pill-neutral">{dateFilterLabel}</span>
            </div>
          </div>

          <div className="line-item-header" role="row" aria-label="Transaction columns">
            <span className="line-item-header-cell line-item-header-cell--select" aria-hidden="true" />
            <button className="line-item-header-cell line-item-header-cell--name" type="button">
              Name
            </button>
            <button className="line-item-header-cell" type="button">
              Date
            </button>
            <button className="line-item-header-cell" type="button">
              Account
            </button>
            <button className="line-item-header-cell" type="button">
              Category
            </button>
            <button className="line-item-header-cell line-item-header-cell--amount" type="button">
              Amount
            </button>
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
            <span className="line-item-header-cell line-item-header-cell--spacer" aria-hidden="true" />
          </div>

          <div className="table-wrap transactions-table-wrap">
            {filteredTransactions.length > 0 ? (
              filteredTransactions.map((transaction) => {
                const warningReason = warningReasonFor(transaction);
                const amount = Number(transaction.amount);
                const isPositive = transaction.type === "income";
                return (
                  <div
                    key={transaction.id}
                    className={`line-item ${transaction.isExcluded ? "is-muted" : ""} ${
                      selectedTransactionIds.includes(transaction.id) ? "is-selected" : ""
                    }`}
                  >
                    <label className="transaction-select-cell">
                      <input
                        type="checkbox"
                        checked={selectedTransactionIds.includes(transaction.id)}
                        onChange={(event) => toggleSelectedTransaction(transaction.id, event.target.checked)}
                        aria-label={`Select ${transaction.merchantRaw}`}
                      />
                    </label>
                    <div className="transaction-name-cell">
                      <button type="button" className="transaction-name-button" onClick={() => openTransactionDetail(transaction)}>
                        {transaction.merchantClean || transaction.merchantRaw}
                      </button>
                      <small className="transaction-subtext">
                        {transaction.description || transaction.merchantClean ? transaction.merchantRaw : transaction.accountName}
                      </small>
                    </div>
                    <div className="transaction-date-cell">{formatDate(transaction.date)}</div>
                    <div className="transaction-account-cell">{transaction.accountName}</div>
                    <div className="transaction-category-cell">
                      <select
                        className="transaction-category-select"
                        value={transaction.categoryId ?? ""}
                        onChange={(event) =>
                          void updateTransaction(transaction.id, {
                            categoryId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Unassigned</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={`transaction-amount-cell ${isPositive ? "positive" : "negative"}`}>
                      {currencyFormatter.format(amount)}
                    </div>
                    <div className="transaction-notes-cell">
                      <button
                        type="button"
                        className="button button-secondary button-small transaction-note-button"
                        onClick={() => openTransactionDetail(transaction)}
                      >
                        Notes
                      </button>
                    </div>
                    <div className="transaction-warning-cell">
                      {warningReason ? (
                        <button
                          type="button"
                          className="warning-chip"
                          title={warningReason}
                          onClick={() => openTransactionDetail(transaction)}
                        >
                          <span className="warning-mark warning-mark--small" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">No transactions match the current filters.</div>
            )}
          </div>

          <div className="transactions-footer">
            <div className="table-footer__summary">
              <span className="pill pill-neutral">{filteredTransactions.length} transactions</span>
              {hasReviewItems ? (
                <button
                  type="button"
                  className="warning-summary-button"
                  title={`${totals.review} transaction${totals.review === 1 ? "" : "s"} still need review`}
                >
                  <span className="warning-mark warning-mark--small" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <span className={`pill transactions-net-pill ${netGain >= 0 ? "is-positive" : "is-negative"}`}>
              {netGain >= 0 ? "Net gain" : "Net loss"} {currencyFormatter.format(Math.abs(netGain))}
            </span>
          </div>
        </div>

        <aside className={`transactions-summary-panel glass ${summaryOpen ? "" : "is-hidden"}`} aria-label="Transaction summary">
          <div className="transactions-summary-panel__head">
            <p className="eyebrow">Summary</p>
            <h4>Overview</h4>
          </div>

          <dl className="transactions-summary-list">
            <div>
              <dt>Total transactions</dt>
              <dd>{filteredTransactions.length}</dd>
            </div>
            <div>
              <dt>Income</dt>
              <dd className="positive">{currencyFormatter.format(totals.income)}</dd>
            </div>
            <div>
              <dt>Spending</dt>
              <dd className="negative">{currencyFormatter.format(totals.expense)}</dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd className={netGain >= 0 ? "positive" : "negative"}>{currencyFormatter.format(netGain)}</dd>
            </div>
            <div>
              <dt>Review items</dt>
              <dd>{totals.review}</dd>
            </div>
            <div>
              <dt>Top category</dt>
              <dd>{summaryData.topCategory ? `${summaryData.topCategory[0]} · ${currencyFormatter.format(summaryData.topCategory[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>Top source</dt>
              <dd>{summaryData.topAccount ? `${summaryData.topAccount[0]} · ${currencyFormatter.format(summaryData.topAccount[1])}` : "—"}</dd>
            </div>
            <div>
              <dt>First transaction</dt>
              <dd>{summaryData.firstTransaction ? formatDate(summaryData.firstTransaction.date) : "—"}</dd>
            </div>
            <div>
              <dt>Last transaction</dt>
              <dd>{summaryData.lastTransaction ? formatDate(summaryData.lastTransaction.date) : "—"}</dd>
            </div>
          </dl>

          <button className="transactions-summary-panel__download" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </aside>
      </section>

      {dateFilterOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDateFilterOpen(false)}>
          <section
            className="modal-card modal-card--wide date-filter-card glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="date-filter-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="date-filter-title">Date filter</h4>
                <p className="modal-copy">{dateFilterLabel}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDateFilterOpen(false)} aria-label="Close date filter">
                ×
              </button>
            </div>

            <div className="date-filter-tabs" role="tablist" aria-label="Date filter mode">
              {[
                ["ltd", "Lifetime"],
                ["day", "Today"],
                ["week", "Week"],
                ["month", "Month"],
                ["quarter", "Quarter"],
                ["year", "Year"],
                ["custom", "Custom"],
              ].map(([mode, label]) => (
                <button
                  key={mode}
                  className={`date-filter-tab ${dateFilterMode === mode ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setDateFilterMode(mode as DateFilterMode)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="date-filter-panel">
              {dateFilterMode === "ltd" ? (
                <div className="date-filter-empty">Lifetime to date includes every transaction up to today.</div>
              ) : null}
              {dateFilterMode === "day" ? (
                <label className="date-filter-field">
                  <span>On</span>
                  <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                </label>
              ) : null}
              {dateFilterMode === "week" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfWeekIso(dateFilterAnchor))} - {formatDate(endOfWeekIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "month" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfMonthIso(dateFilterAnchor))} - {formatDate(endOfMonthIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "quarter" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfQuarterIso(dateFilterAnchor))} - {formatDate(endOfQuarterIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "year" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Anchor</span>
                    <input type="date" value={dateFilterAnchor} onChange={(event) => setDateFilterAnchor(event.target.value)} />
                  </label>
                  <div className="date-filter-empty">
                    {formatDate(startOfYearIso(dateFilterAnchor))} - {formatDate(endOfYearIso(dateFilterAnchor))}
                  </div>
                </div>
              ) : null}
              {dateFilterMode === "custom" ? (
                <div className="date-filter-fields date-filter-fields--two">
                  <label className="date-filter-field">
                    <span>Start</span>
                    <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
                  </label>
                  <label className="date-filter-field">
                    <span>End</span>
                    <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="form-actions date-filter-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setDateFilterMode("ltd");
                  setDateFilterAnchor(todayIso);
                  setCustomStart("");
                  setCustomEnd("");
                }}
              >
                Reset
              </button>
              <button className="button button-primary" type="button" onClick={() => setDateFilterOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {filterOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFilterOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-filters-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="transaction-filters-title">Filters</h4>
                <p className="modal-copy">Refine what appears in the transaction review table.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setFilterOpen(false)} aria-label="Close filters">
                ×
              </button>
            </div>

            <div className="form-grid">
              <label className="span-2">
                Search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Merchant, note, or alias"
                />
              </label>
              <label>
                Workspace
                <select value={selectedWorkspaceId} onChange={(event) => setSelectedWorkspaceId(event.target.value)}>
                  <option value="">Choose workspace</option>
                  {workspaces.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account
                <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                  <option value="all">All accounts</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Type
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="all">All types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setQuery("");
                  setCategoryFilter("all");
                  setAccountFilter("all");
                  setTypeFilter("all");
                }}
              >
                Reset
              </button>
              <button className="button button-primary" type="button" onClick={() => setFilterOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {bulkEditOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setBulkEditOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-edit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="bulk-edit-title">Bulk edit</h4>
                <p className="modal-copy">{selectedTransactionIds.length} selected · apply the same changes to all rows.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setBulkEditOpen(false)} aria-label="Close bulk edit">
                ×
              </button>
            </div>

            <form className="manual-form" onSubmit={applyBulkEdit}>
              <div className="form-grid">
                <label>
                  Account
                  <select value={bulkEditForm.accountId} onChange={(event) => setBulkEditForm((current) => ({ ...current, accountId: event.target.value }))}>
                    <option value="">Leave unchanged</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select value={bulkEditForm.categoryId} onChange={(event) => setBulkEditForm((current) => ({ ...current, categoryId: event.target.value }))}>
                    <option value="">Leave unchanged</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select
                    value={bulkEditForm.type}
                    onChange={(event) => setBulkEditForm((current) => ({ ...current, type: event.target.value as BulkEditForm["type"] }))}
                  >
                    <option value="">Leave unchanged</option>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </label>
                <label>
                  Review state
                  <select
                    value={bulkEditForm.isExcluded}
                    onChange={(event) =>
                      setBulkEditForm((current) => ({ ...current, isExcluded: event.target.value as BulkEditForm["isExcluded"] }))
                    }
                  >
                    <option value="">Leave unchanged</option>
                    <option value="include">Include in totals</option>
                    <option value="exclude">Exclude from totals</option>
                  </select>
                </label>
                <label>
                  Transfer state
                  <select
                    value={bulkEditForm.isTransfer}
                    onChange={(event) =>
                      setBulkEditForm((current) => ({ ...current, isTransfer: event.target.value as BulkEditForm["isTransfer"] }))
                    }
                  >
                    <option value="">Leave unchanged</option>
                    <option value="true">Mark as transfer</option>
                    <option value="false">Clear transfer</option>
                  </select>
                </label>
                <label className="span-2">
                  Notes
                  <textarea
                    value={bulkEditForm.description}
                    onChange={(event) => setBulkEditForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Leave blank to keep existing notes"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={() => setBulkEditOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Apply changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {manualOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setManualOpen(false)}>
          <section
            className="modal-card modal-card--wide glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-transaction-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transactions</p>
                <h4 id="add-transaction-title">Add transaction</h4>
                <p className="modal-copy">Add a manual transaction or keep it as a quick review note.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setManualOpen(false)} aria-label="Close add transaction dialog">
                ×
              </button>
            </div>

            <form onSubmit={saveManualTransaction}>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={manualForm.merchantRaw}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantRaw: event.target.value }))}
                    placeholder="Merchant or payee"
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={manualForm.date}
                    onChange={(event) => setManualForm((current) => ({ ...current, date: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Account
                  <select
                    value={manualForm.accountId}
                    onChange={(event) => setManualForm((current) => ({ ...current, accountId: event.target.value }))}
                  >
                    <option value="">Choose account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={manualForm.categoryId}
                    onChange={(event) => setManualForm((current) => ({ ...current, categoryId: event.target.value }))}
                  >
                    <option value="">Unassigned</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))}
                    placeholder="0.00"
                    required
                  />
                </label>
                <label>
                  Type
                  <select
                    value={manualForm.type}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        type: event.target.value as ManualTransactionForm["type"],
                      }))
                    }
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </label>
                <label className="span-2">
                  Merchant alias
                  <input
                    value={manualForm.merchantClean}
                    onChange={(event) => setManualForm((current) => ({ ...current, merchantClean: event.target.value }))}
                    placeholder="Optional cleaned-up merchant name"
                  />
                </label>
                <label className="span-2">
                  Notes
                  <textarea
                    value={manualForm.description}
                    onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional note or review context"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={() => setManualOpen(false)}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add transaction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedTransaction ? (
        <div className="modal-backdrop" role="presentation" onClick={closeTransactionDetail}>
          <section
            className="modal-card modal-card--wide transaction-drawer glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-notes-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transaction details</p>
                <h4 id="transaction-notes-title">{detailDraft?.merchantClean || detailDraft?.merchantRaw || selectedTransaction.merchantRaw}</h4>
                <p className="modal-copy">Edit the transaction, add notes, and resolve warnings in one place.</p>
              </div>
              <button className="icon-button" type="button" onClick={closeTransactionDetail} aria-label="Close notes dialog">
                ×
              </button>
            </div>

            <div className="transaction-notes-grid">
              <div className="transaction-note-meta">
                <span>Date</span>
                <strong>{formatDate(detailDraft?.date ?? selectedTransaction.date)}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Account</span>
                <strong>{selectedTransaction.accountName}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Category</span>
                <strong>{detailDraft?.categoryId ? categories.find((category) => category.id === detailDraft.categoryId)?.name ?? "Unassigned" : "Unassigned"}</strong>
              </div>
              <div className="transaction-note-meta">
                <span>Amount</span>
                <strong>{currencyFormatter.format(Number(detailDraft?.amount ?? selectedTransaction.amount))}</strong>
              </div>
            </div>

            <div className="form-grid transaction-drawer-grid">
              <label className="span-2">
                Name
                <input
                  value={detailDraft?.merchantRaw ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, merchantRaw: event.target.value } : current))}
                />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={detailDraft?.date ?? todayIso}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, date: event.target.value } : current))}
                />
              </label>
              <label>
                Account
                <select
                  value={detailDraft?.accountId ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, accountId: event.target.value } : current))}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  value={detailDraft?.categoryId ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, categoryId: event.target.value } : current))}
                >
                  <option value="">Unassigned</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  type="number"
                  step="0.01"
                  value={detailDraft?.amount ?? selectedTransaction.amount}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, amount: event.target.value } : current))}
                />
              </label>
              <label>
                Type
                <select
                  value={detailDraft?.type ?? selectedTransaction.type}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current
                        ? {
                            ...current,
                            type: event.target.value as TransactionDetailDraft["type"],
                          }
                        : current
                    )
                  }
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="transfer">Transfer</option>
                </select>
              </label>
              <label className="span-2">
                Merchant alias
                <input
                  value={detailDraft?.merchantClean ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, merchantClean: event.target.value } : current))}
                />
              </label>
              <label className="span-2">
                Notes
                <textarea
                  value={detailDraft?.description ?? ""}
                  onChange={(event) => setDetailDraft((current) => (current ? { ...current, description: event.target.value } : current))}
                  placeholder="Optional context, receipt notes, or review comments"
                />
              </label>
            </div>

            {warningReasonFor(selectedTransaction) ? (
              <div className="detail-warning-box">
                <span>Review warning</span>
                <p>{warningReasonFor(selectedTransaction)}</p>
                <div className="detail-warning-actions">
                  <button
                    className="button button-primary button-small"
                    type="button"
                    onClick={async () => {
                      await updateTransaction(selectedTransaction.id, {
                        isExcluded: false,
                        isTransfer: false,
                      });
                      setMessage("Warning accepted.");
                      closeTransactionDetail();
                    }}
                  >
                    Accept
                  </button>
                  <button
                    className="button button-secondary button-small detail-warning-delete"
                    type="button"
                    onClick={async () => {
                      await updateTransaction(selectedTransaction.id, {
                        isExcluded: true,
                      });
                      setMessage("Transaction excluded.");
                      closeTransactionDetail();
                    }}
                  >
                    Exclude
                  </button>
                </div>
              </div>
            ) : null}

            <div className="form-actions detail-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={async () => {
                  await updateTransaction(selectedTransaction.id, {
                    isExcluded: true,
                  });
                  setMessage("Transaction excluded.");
                  closeTransactionDetail();
                }}
              >
                Exclude
              </button>
              <button className="button button-primary" type="button" disabled={isSaving} onClick={saveDetailDraft}>
                {isSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
