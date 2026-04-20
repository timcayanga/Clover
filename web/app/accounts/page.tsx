"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { deriveReconciledBalance } from "@/lib/account-balance";
import { ImportFilesModal } from "@/components/import-files-modal";
import { UploadInsightsToast, type UploadInsightsSummary } from "@/components/upload-insights-toast";
import { useOnboardingAccess } from "@/lib/use-onboarding-access";
import { inferAccountTypeFromStatement } from "@/lib/import-parser";
import { chooseWorkspaceId, persistSelectedWorkspaceId } from "@/lib/workspace-selection";

type Workspace = {
  id: string;
  name: string;
  type: string;
};

type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: "bank" | "wallet" | "credit_card" | "cash" | "investment" | "other";
  currency: string;
  source: string;
  balance: string | null;
  updatedAt: string;
  createdAt: string;
};

type AccountRule = {
  accountId: string | null;
  accountName: string;
  institution: string | null;
  accountType: string;
};

type Transaction = {
  id: string;
  accountId: string;
  amount: string;
  type: "income" | "expense" | "transfer";
  date: string;
  merchantRaw: string;
  merchantClean: string | null;
  categoryName: string | null;
  description: string | null;
  isExcluded: boolean;
};

type StatementCheckpoint = {
  id: string;
  statementStartDate: string | null;
  statementEndDate: string | null;
  openingBalance: string | null;
  endingBalance: string | null;
  status: "pending" | "reconciled" | "mismatch";
  mismatchReason: string | null;
  rowCount: number;
  createdAt: string;
  updatedAt: string;
};

type SummaryMode = "totals" | "percent";
type AccountSort = "name" | "balance_desc" | "updated_desc";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseAmount = (value: string | null | undefined) => Number(value ?? 0);

const getEffectiveAccountType = (account: Account) =>
  inferAccountTypeFromStatement(account.institution, account.name, account.type);

const getAccountDisplayType = (account: Account) => {
  const effectiveType = getEffectiveAccountType(account);
  if (effectiveType === "credit_card") return "Credit Card";
  if (effectiveType === "cash") return "Cash";
  if (effectiveType === "investment") return "Investment";
  if (effectiveType === "wallet") return "Wallet";
  if (effectiveType === "bank" && account.institution === "Checking") return "Checking";
  if (effectiveType === "bank" && account.institution === "Savings") return "Savings";
  if (effectiveType === "other") return "-";
  return "Bank";
};

const getAccountTone = (account: Account) => (getEffectiveAccountType(account) === "credit_card" ? "liability" : "asset");

const getAccountWarning = (account: Account, duplicateCount: number) => {
  if (duplicateCount > 1) return "Possible duplicate";
  if (account.source === "imported" && !account.institution) return "Needs category";
  if (account.balance === null) return "Add balance";
  return null;
};

function ActionIcon({
  name,
}: {
  name:
    | "plus"
    | "filters"
    | "refresh"
    | "calendar"
    | "chart"
    | "save"
    | "download"
    | "chevron-down"
    | "search"
    | "edit"
    | "upload"
    | "history"
    | "chevron-right"
    | "warning";
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
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="m20 20-4.2-4.2" />
        </svg>
      );
    case "filters":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 12a8 8 0 1 1-2.34-5.66" />
          <path d="M20 4v6h-6" />
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
    case "chart":
      return (
        <svg {...common}>
          <path d="M4 19h16" />
          <path d="M6 16V9" />
          <path d="M11 16V5" />
          <path d="M16 16v-7" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M5 5h11l3 3v11H5z" />
          <path d="M8 5v6h8V5" />
          <path d="M8 19v-6h8v6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v10" />
          <path d="m8 9 4 4 4-4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 21V11" />
          <path d="m8 15 4-4 4 4" />
          <path d="M5 5h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M14.5 5.5 18.5 9.5" />
          <path d="M6 18l1.5-4.5L15 6l3 3-7.5 7.5L6 18z" />
        </svg>
      );
    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v6l4 2" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    default:
      return null;
  }
}

export default function AccountsPage() {
  const onboardingStatus = useOnboardingAccess();

  useEffect(() => {
    document.title = "Clover | Accounts";
  }, []);

  if (onboardingStatus !== "ready") {
    return (
      <CloverShell
        active="accounts"
        title="Checking your setup..."
        kicker="One moment"
        subtitle="We’re confirming your onboarding status before opening Accounts."
        showTopbar={false}
      >
        <section className="empty-state">Checking your setup...</section>
      </CloverShell>
    );
  }

  return <AccountsPageContent />;
}

function AccountsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const addRef = useRef<HTMLDivElement>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountRules, setAccountRules] = useState<AccountRule[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statementCheckpoints, setStatementCheckpoints] = useState<StatementCheckpoint[]>([]);
  const [message, setMessage] = useState("Select a workspace to review accounts.");
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [drawerAccountId, setDrawerAccountId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<AccountSort>("updated_desc");
  const [summaryMode, setSummaryMode] = useState<SummaryMode>("totals");
  const [manualType, setManualType] = useState<Account["type"]>("bank");
  const [manualName, setManualName] = useState("");
  const [manualBalance, setManualBalance] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [accountEditName, setAccountEditName] = useState("");
  const [accountEditInstitution, setAccountEditInstitution] = useState("");
  const [accountEditType, setAccountEditType] = useState<Account["type"]>("bank");
  const [accountEditCurrency, setAccountEditCurrency] = useState("PHP");
  const [accountEditBalance, setAccountEditBalance] = useState("");
  const [accountEditSource, setAccountEditSource] = useState("manual");
  const [accountEditBusy, setAccountEditBusy] = useState(false);
  const [accountDeleteBusy, setAccountDeleteBusy] = useState(false);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [drawerNotice, setDrawerNotice] = useState<string | null>(null);
  const [uploadInsightsSummary, setUploadInsightsSummary] = useState<UploadInsightsSummary | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const downloadMenuRef = useRef<HTMLDivElement>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );

  const reconciledAccounts = useMemo(
    () =>
      accounts.map((account) => {
        const accountTransactions = transactions.filter((transaction) => transaction.accountId === account.id);
        const accountCheckpoints = drawerAccountId === account.id ? statementCheckpoints : [];
        const effectiveType = getEffectiveAccountType(account);
        const reconciledBalance = deriveReconciledBalance({
          balance: account.balance,
          transactions: accountTransactions,
          checkpoints: accountCheckpoints,
        });

        return {
          ...account,
          type: effectiveType,
          balance: reconciledBalance ?? account.balance,
        };
      }),
    [accounts, drawerAccountId, statementCheckpoints, transactions]
  );

  const loadWorkspaces = async () => {
    setWorkspacesLoading(true);
    const response = await fetch("/api/workspaces");
    if (!response.ok) {
      setMessage("Unable to load workspaces.");
      setWorkspacesLoading(false);
      setAccountsLoading(false);
      return;
    }

    const data = await response.json();
    const items = Array.isArray(data.workspaces) ? data.workspaces : [];
    setWorkspaces(items);
    setSelectedWorkspaceId((current) => chooseWorkspaceId(items, current));
    setWorkspacesLoading(false);
  };

  const loadWorkspaceData = async (workspaceId: string) => {
    if (!workspaceId) {
      setAccounts([]);
      setAccountRules([]);
      setTransactions([]);
      setAccountsLoading(false);
      return;
    }

    setAccountsLoading(true);
    setAccounts([]);
    setTransactions([]);

    const accountsRequest = fetch(`/api/accounts?workspaceId=${encodeURIComponent(workspaceId)}`);
    const transactionsRequest = fetch(`/api/transactions?workspaceId=${encodeURIComponent(workspaceId)}`);

    const accountsResponse = await accountsRequest;
    if (accountsResponse.ok) {
      const payload = await accountsResponse.json();
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setAccountRules(Array.isArray(payload.accountRules) ? payload.accountRules : []);
    }

    setAccountsLoading(false);

    void transactionsRequest.then(async (transactionsResponse) => {
      if (!transactionsResponse.ok) {
        return;
      }

      const payload = await transactionsResponse.json();
      setTransactions(Array.isArray(payload.transactions) ? payload.transactions : []);
    });
  };

  useEffect(() => {
    void loadWorkspaces();
  }, []);

  useEffect(() => {
    persistSelectedWorkspaceId(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      setImportOpen(true);
      router.replace("/accounts");
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!selectedWorkspaceId) {
      return;
    }

    void loadWorkspaceData(selectedWorkspaceId);
  }, [selectedWorkspaceId]);

  useEffect(() => {
    let cancelled = false;

    const loadStatementCheckpoints = async () => {
      if (!drawerAccountId) {
        setStatementCheckpoints([]);
        return;
      }

      try {
        const response = await fetch(`/api/accounts/${drawerAccountId}/statement-checkpoints`);
        if (!response.ok) {
          if (!cancelled) {
            setStatementCheckpoints([]);
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setStatementCheckpoints(Array.isArray(payload.checkpoints) ? (payload.checkpoints as StatementCheckpoint[]) : []);
        }
      } catch {
        if (!cancelled) {
          setStatementCheckpoints([]);
        }
      }
    };

    void loadStatementCheckpoints();

    return () => {
      cancelled = true;
    };
  }, [drawerAccountId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddOpen(false);
        setImportOpen(false);
        setDrawerAccountId(null);
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!downloadMenuRef.current) {
        return;
      }

      if (!downloadMenuRef.current.contains(event.target as Node)) {
        setDownloadMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of reconciledAccounts) {
      const key = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [reconciledAccounts]);

  const searchedAccounts = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const base = term
      ? reconciledAccounts.filter((account) => {
          const haystack = [account.name, account.institution ?? "", account.source, getEffectiveAccountType(account)].join(" ").toLowerCase();
          return haystack.includes(term);
        })
      : reconciledAccounts;

    return [...base].sort((left, right) => {
      if (sortBy === "name") {
        return left.name.localeCompare(right.name);
      }

      if (sortBy === "balance_desc") {
        return parseAmount(right.balance) - parseAmount(left.balance);
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [reconciledAccounts, searchQuery, sortBy]);

  const totals = useMemo(() => {
    return reconciledAccounts.reduce(
      (accumulator, account) => {
        const rawValue = parseAmount(account.balance);
        const isLiability = getEffectiveAccountType(account) === "credit_card";
        const signedValue = isLiability ? -Math.abs(rawValue) : rawValue;
        if (signedValue >= 0) {
          accumulator.assets += signedValue;
        } else {
          accumulator.liabilities += Math.abs(signedValue);
        }
        accumulator.netWorth += signedValue;
        return accumulator;
      },
      { assets: 0, liabilities: 0, netWorth: 0 }
    );
  }, [reconciledAccounts]);

  const accountGroups = useMemo(() => {
    const groups = [
      {
        title: "Banks & savings",
        tone: "assets",
        rows: searchedAccounts.filter((account) => {
          const effectiveType = getEffectiveAccountType(account);
          return effectiveType === "bank" || effectiveType === "wallet" || effectiveType === "investment";
        }),
      },
      {
        title: "Credit cards",
        tone: "liability",
        rows: searchedAccounts.filter((account) => getEffectiveAccountType(account) === "credit_card"),
      },
      {
        title: "Imported & other",
        tone: "neutral",
        rows: searchedAccounts.filter((account) => getEffectiveAccountType(account) === "other"),
      },
      {
        title: "Cash",
        tone: "cash",
        rows: searchedAccounts.filter((account) => getEffectiveAccountType(account) === "cash"),
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        total: group.rows.reduce(
          (sum, account) => sum + (getEffectiveAccountType(account) === "credit_card" ? -Math.abs(parseAmount(account.balance)) : parseAmount(account.balance)),
          0
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [searchedAccounts]);

  const selectedAccount = useMemo(
    () => reconciledAccounts.find((account) => account.id === drawerAccountId) ?? null,
    [drawerAccountId, reconciledAccounts]
  );

  const selectedAccountTransactions = useMemo(
    () =>
      selectedAccount
        ? transactions.filter(
            (transaction) =>
              transaction.accountId === selectedAccount.id &&
              (!transaction.isExcluded || transaction.merchantRaw === "Beginning balance")
          )
        : [],
    [selectedAccount, transactions]
  );

  const needsReviewCount = useMemo(() => {
    return reconciledAccounts.filter((account) => {
      const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
      const duplicate = (duplicateCounts.get(duplicateKey) ?? 0) > 1;
      const missingInstitution = account.source === "imported" && !account.institution;
      const missingBalance = account.balance === null;
      return duplicate || missingInstitution || missingBalance;
    }).length;
  }, [duplicateCounts, reconciledAccounts]);

  const accountHistoryEntries = useMemo(() => {
    if (!selectedAccount) return [];
    return selectedAccountTransactions.slice(0, 5).map((transaction) => ({
      id: transaction.id,
      title: transaction.merchantRaw,
      subtitle: transaction.categoryName ?? "Uncategorized",
      value: transaction.amount,
      date: transaction.date,
      kind: transaction.type,
    }));
  }, [selectedAccount, selectedAccountTransactions]);

  const openingBalanceEntry = useMemo(
    () => selectedAccountTransactions.find((transaction) => transaction.merchantRaw === "Beginning balance") ?? null,
    [selectedAccountTransactions]
  );

  const latestCheckpoint = useMemo(() => statementCheckpoints[0] ?? null, [statementCheckpoints]);

  const refreshAll = async () => {
    if (!selectedWorkspaceId) return;
    await loadWorkspaceData(selectedWorkspaceId);
    setMessage(`Workspace "${selectedWorkspace?.name ?? "selected"}" refreshed.`);
  };

  const openImportFiles = () => {
    setAddOpen(false);
    setImportOpen(true);
  };

  const openAccountDrawer = (account: Account) => {
    setDrawerAccountId(account.id);
    setDrawerNotice(null);
    setAccountEditName(account.name);
    setAccountEditInstitution(account.institution ?? "");
    setAccountEditType(getEffectiveAccountType(account));
    setAccountEditCurrency(account.currency);
    setAccountEditBalance(account.balance?.toString() ?? "");
    setAccountEditSource(account.source);
    setBalanceDraft(account.balance?.toString() ?? "");
  };

  const openFullAccountPage = () => {
    if (!selectedAccount) return;
    router.push(`/accounts/${selectedAccount.id}`);
  };

  const openDrawerForWarning = (account: Account, warning: string) => {
    openAccountDrawer(account);
    setDrawerNotice(warning);
  };

  const saveAccountChanges = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedWorkspaceId || !selectedAccount) return;

    const name = accountEditName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    setAccountEditBusy(true);
    try {
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: accountEditInstitution.trim() || null,
          type: accountEditType,
          currency: accountEditCurrency || "PHP",
          source: accountEditSource || selectedAccount.source,
          balance: accountEditBalance.trim() ? Number(accountEditBalance) : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to update account.");
      }

      const payload = await response.json();
      if (payload.account) {
        setAccounts((current) => current.map((account) => (account.id === selectedAccount.id ? payload.account : account)));
        setMessage(`Account "${name}" updated.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update account.");
    } finally {
      setAccountEditBusy(false);
    }
  };

  const deleteAccount = async () => {
    if (!selectedWorkspaceId || !selectedAccount) return;
    if (!window.confirm(`Delete ${selectedAccount.name}? This cannot be undone.`)) return;

    setAccountDeleteBusy(true);
    try {
      const response = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to delete account.");
      }

      setAccounts((current) => current.filter((account) => account.id !== selectedAccount.id));
      setTransactions((current) => current.filter((transaction) => transaction.accountId !== selectedAccount.id));
      setDrawerAccountId(null);
      setMessage(`Account "${selectedAccount.name}" deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to delete account.");
    } finally {
      setAccountDeleteBusy(false);
    }
  };

  const createManualAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWorkspaceId) {
      setMessage("Select a workspace first.");
      return;
    }

    const name = manualName.trim();
    if (!name) {
      setMessage("Account name is required.");
      return;
    }

    const hasCashAccount = accounts.some((account) => account.type === "cash");
    if (manualType === "cash" && hasCashAccount) {
      setMessage("Cash already appears automatically in this workspace. Rename the existing Cash account instead.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspaceId,
          name,
          institution: null,
          type: manualType,
          currency: "PHP",
          source: "manual",
          balance: manualBalance ? Number(manualBalance) : 0,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to create account.");
      }

      const data = await response.json();
      if (data.account) {
        setAccounts((current) => [data.account, ...current]);
      }
      setManualName("");
      setManualBalance("");
      setManualType("bank");
      setAddOpen(false);
      setMessage(`Account "${name}" created.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create account.");
    } finally {
      setIsSaving(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Amount", "Last updated", "Source"],
      ...searchedAccounts.map((account) => [
        account.name,
        getAccountDisplayType(account),
        currencyFormatter.format(parseAmount(account.balance)),
        formatDate(account.updatedAt),
        account.source,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedWorkspace?.name ?? "accounts"}-summary.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const report = window.open("", "_blank", "width=980,height=780");
    if (!report) return;
    report.document.write(`
      <html>
        <head>
          <title>${selectedWorkspace?.name ?? "Accounts"} summary</title>
          <style>
            body { font-family: Inter, Arial, sans-serif; padding: 32px; color: #111; }
            h1 { margin: 0 0 10px; }
            .muted { color: #66727b; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { text-align: left; border-bottom: 1px solid #e2e8ec; padding: 10px 8px; }
          </style>
        </head>
        <body>
          <h1>${selectedWorkspace?.name ?? "Accounts"} summary</h1>
          <p class="muted">Net worth ${currencyFormatter.format(totals.netWorth)} · Assets ${currencyFormatter.format(totals.assets)} · Liabilities ${currencyFormatter.format(totals.liabilities)}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Amount</th><th>Last updated</th></tr>
            </thead>
            <tbody>
              ${searchedAccounts
                .map(
                  (account) => `
                    <tr>
                      <td>${account.name}</td>
                      <td>${getAccountDisplayType(account)}</td>
                      <td>${currencyFormatter.format(parseAmount(account.balance))}</td>
                      <td>${formatDate(account.updatedAt)}</td>
                    </tr>`
                )
                .join("")}
            </tbody>
          </table>
          <script>window.print();</script>
        </body>
      </html>
    `);
    report.document.close();
  };

  const downloadSummary = (format: "csv" | "pdf") => {
    setDownloadMenuOpen(false);
    if (format === "csv") {
      exportCsv();
      return;
    }

    exportPdf();
  };

  return (
    <CloverShell active="accounts" title="Accounts" showTopbar={false}>
      <div className="accounts-page">
        <div className="accounts-page__sticky">
          <div className="accounts-page__headline">
            <div className="accounts-page__headline-copy">
              <h1>Accounts</h1>
            </div>
            <div className="accounts-page__headline-actions">
              <button className="button button-primary button-small accounts-toolbar-add" type="button" onClick={() => setAddOpen(true)}>
                <ActionIcon name="plus" />
                <span>Add account</span>
              </button>
              <button className="button button-secondary button-small accounts-toolbar-button" type="button" onClick={openImportFiles}>
                <ActionIcon name="upload" />
                <span>Import files</span>
              </button>
            </div>
          </div>

          <section className="accounts-overview-grid">
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Net worth</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.netWorth)}</strong>
              <span>
                {accountsLoading
                  ? "Loading accounts"
                  : `${accounts.length} accounts across ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`}
              </span>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Assets</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.assets)}</strong>
              <span>Cash, savings, and invested balances</span>
            </article>
            <article className="accounts-overview-card glass">
              <p className="eyebrow">Liabilities</p>
              <strong>{accountsLoading ? "Loading..." : currencyFormatter.format(totals.liabilities)}</strong>
              <span>Credit cards and other negative balances</span>
            </article>
          </section>
        </div>

        <section className="accounts-main-grid">
          <div className="accounts-list-column">
            <div className="accounts-list-head">
              <div>
                <p className="eyebrow">Account list</p>
              </div>
              <div className="accounts-list-controls">
                <label className="accounts-search">
                  <ActionIcon name="search" />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search accounts" />
                </label>
                <label>
                  Sort
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value as AccountSort)}>
                    <option value="updated_desc">Latest updated</option>
                    <option value="name">Name</option>
                    <option value="balance_desc">Balance</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="accounts-sections">
              {accountsLoading ? (
                <div className="empty-state">Loading accounts...</div>
              ) : accounts.length === 0 ? (
                <div className="empty-state accounts-empty-state">
                  <strong>It's quiet in here.</strong>
                  <p>Add your first account to start seeing balances, history, and helpful review flags.</p>
                  <div className="accounts-empty-state__actions">
                    <button className="button button-primary button-small" type="button" onClick={() => setAddOpen(true)}>
                      Add account
                    </button>
                    <button className="button button-secondary button-small" type="button" onClick={openImportFiles}>
                      Import files
                    </button>
                  </div>
                </div>
              ) : accountGroups.length > 0 ? (
                accountGroups.map((group) => (
                  <article key={group.title} className="accounts-group glass">
                    <div className="accounts-group__head">
                      <div>
                        <h5>{group.title}</h5>
                        <p>
                          {group.rows.length} account{group.rows.length === 1 ? "" : "s"} ·{" "}
                          {currencyFormatter.format(group.total)}
                        </p>
                      </div>
                      <span className={`accounts-group__tone accounts-group__tone--${group.tone}`}>{group.title}</span>
                    </div>

                      <div className="accounts-table" role="table" aria-label={`${group.title} accounts`}>
                      <div className="accounts-table__header" role="row">
                        <span role="columnheader">Name</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader">Amount</span>
                        <span role="columnheader">Last updated</span>
                        <span role="columnheader">Status</span>
                      </div>
                      {group.rows.map((account) => {
                        const value = parseAmount(account.balance);
                        const isLiability = getEffectiveAccountType(account) === "credit_card";
                        const duplicateKey = `${account.name.trim().toLowerCase()}::${(account.institution ?? "").trim().toLowerCase()}`;
                        const warning = getAccountWarning(account, duplicateCounts.get(duplicateKey) ?? 0);
                        return (
                          <div key={account.id} className="accounts-table__row" role="row">
                            <div className="accounts-table__cell accounts-table__cell--name" role="cell">
                              <strong>{account.name}</strong>
                              <span>
                                {account.institution ?? "No institution"} ·{" "}
                                <span className="accounts-source">{account.source === "manual" ? "Manual" : "Imported"}</span>
                              </span>
                            </div>
                            <div className="accounts-table__cell" role="cell">
                              <span className={`accounts-type-tag ${getAccountTone(account) === "liability" ? "is-liability" : ""}`}>
                                {getAccountDisplayType(account)}
                              </span>
                            </div>
                            <div className={`accounts-table__cell accounts-table__cell--amount ${isLiability ? "is-liability" : "is-asset"}`} role="cell">
                              {currencyFormatter.format(isLiability ? -Math.abs(value) : value)}
                            </div>
                            <div className="accounts-table__cell" role="cell">
                              {formatDate(account.updatedAt)}
                            </div>
                            <div className="accounts-table__cell accounts-table__cell--status" role="cell">
                              {warning ? (
                                <span className="accounts-warning-wrap">
                                  <button
                                    className="accounts-warning-icon"
                                    type="button"
                                    onClick={() => openDrawerForWarning(account, warning)}
                                    title={warning}
                                    aria-label={warning}
                                  >
                                    <span aria-hidden="true">⚠</span>
                                  </button>
                                  <span className="accounts-warning-tooltip" role="tooltip">
                                    {warning}
                                  </span>
                                </span>
                              ) : (
                                <span className="accounts-view-pill">Ready</span>
                              )}
                              <button className="button button-secondary button-small accounts-row-button" type="button" onClick={() => openAccountDrawer(account)} aria-label={`Open ${account.name} drawer`}>
                                <span aria-hidden="true">&gt;</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No matches right now.</strong>
                  <p>Try clearing your search or sorting, or open a different account group to keep browsing.</p>
                </div>
              )}
            </div>
          </div>

          <aside className="accounts-summary-column glass">
            <div className="accounts-summary-column__head">
              <div>
                <p className="eyebrow">Summary</p>
                <h4>Assets vs liabilities</h4>
              </div>
              <div className="accounts-summary-tabs">
                <button
                  type="button"
                  className={summaryMode === "totals" ? "is-active" : ""}
                  onClick={() => setSummaryMode("totals")}
                >
                  Totals
                </button>
                <button
                  type="button"
                  className={summaryMode === "percent" ? "is-active" : ""}
                  onClick={() => setSummaryMode("percent")}
                >
                  Percent
                </button>
              </div>
            </div>

            {summaryMode === "totals" ? (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets</span>
                  <strong>{currencyFormatter.format(totals.assets)}</strong>
                </div>
                <div className="accounts-summary-bar">
                  <span style={{ width: `${Math.max((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities</span>
                  <strong>{currencyFormatter.format(totals.liabilities)}</strong>
                </div>
                <div className="accounts-summary-bar accounts-summary-bar--liability">
                  <span style={{ width: `${Math.max((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100, 12)}%` }} />
                </div>
                <div className="accounts-summary-item">
                  <span>Needs review</span>
                  <strong>{needsReviewCount}</strong>
                </div>
              </div>
            ) : (
              <div className="accounts-summary-list">
                <div className="accounts-summary-item">
                  <span>Assets share</span>
                  <strong>{Math.round((totals.assets / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Liabilities share</span>
                  <strong>{Math.round((totals.liabilities / Math.max(totals.assets + totals.liabilities, 1)) * 100)}%</strong>
                </div>
                <div className="accounts-summary-item">
                  <span>Net worth</span>
                  <strong>{currencyFormatter.format(totals.netWorth)}</strong>
                </div>
              </div>
            )}

            <div className="accounts-summary-group">
              <p className="eyebrow">Import shortcuts</p>
              <div className="accounts-summary-actions">
                <button className="button button-secondary button-small accounts-summary-download" type="button" onClick={openImportFiles}>
                  <ActionIcon name="upload" />
                  <span>Import files</span>
                </button>
              </div>
            </div>

            <div className="accounts-summary-actions" ref={downloadMenuRef}>
              <button
                className="button button-secondary button-small accounts-summary-download"
                type="button"
                onClick={() => setDownloadMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={downloadMenuOpen}
              >
                <ActionIcon name="download" />
                <span>Download</span>
                <ActionIcon name="chevron-down" />
              </button>
              {downloadMenuOpen ? (
                <div className="accounts-summary-dropdown" role="menu" aria-label="Download options">
                  <button type="button" role="menuitem" onClick={() => downloadSummary("csv")}>
                    Download CSV
                  </button>
                  <button type="button" role="menuitem" onClick={() => downloadSummary("pdf")}>
                    Download PDF
                  </button>
                </div>
              ) : null}
            </div>
          </aside>
        </section>
      </div>

      {selectedAccount ? (
        <div className="accounts-drawer-backdrop" role="presentation" onClick={() => setDrawerAccountId(null)}>
          <aside className="accounts-drawer glass" role="dialog" aria-modal="true" aria-labelledby="account-drawer-title" onClick={(event) => event.stopPropagation()}>
            <div className="accounts-drawer__head">
              <div>
                <p className="eyebrow">Account drawer</p>
                <h4 id="account-drawer-title">{accountEditName || selectedAccount.name}</h4>
                <p>{getAccountDisplayType(selectedAccount)} · {selectedAccount.source === "manual" ? "Manual" : "Imported"}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setDrawerAccountId(null)} aria-label="Close account drawer">
                ×
              </button>
            </div>

            <div className="accounts-drawer__overview">
              <div>
                <span>Current balance</span>
                <strong>{currencyFormatter.format(parseAmount(selectedAccount.balance))}</strong>
              </div>
              <div>
                <span>Last updated</span>
                <strong>{formatDate(selectedAccount.updatedAt)}</strong>
              </div>
              {getEffectiveAccountType(selectedAccount) !== "cash" ? (
                <div>
                  <span>Institution</span>
                  <strong>{selectedAccount.institution ?? "No institution"}</strong>
                </div>
              ) : null}
              <div>
                <span>Status</span>
                <strong>{getAccountWarning(selectedAccount, duplicateCounts.get(`${selectedAccount.name.trim().toLowerCase()}::${(selectedAccount.institution ?? "").trim().toLowerCase()}`) ?? 0) ?? "Ready"}</strong>
              </div>
            </div>

            {drawerNotice ? (
              <div className="accounts-drawer__notice">
                <strong>Needs review</strong>
                <p>{drawerNotice}</p>
              </div>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Edit account</h5>
                <ActionIcon name="edit" />
              </div>
              <form className="accounts-drawer__form" onSubmit={saveAccountChanges}>
                <label>
                  Name
                  <input value={accountEditName} onChange={(event) => setAccountEditName(event.target.value)} />
                </label>
                <label>
                  Institution
                  <input value={accountEditInstitution} onChange={(event) => setAccountEditInstitution(event.target.value)} placeholder="Bank or wallet name" />
                </label>
                <label>
                  Type
                  <select value={accountEditType} onChange={(event) => setAccountEditType(event.target.value as Account["type"])}>
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="investment">Investment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Balance
                  <input value={accountEditBalance} onChange={(event) => setAccountEditBalance(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <button className="button button-primary" type="submit" disabled={accountEditBusy}>
                  {accountEditBusy ? "Saving..." : "Save changes"}
                </button>
              </form>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Add balance</h5>
                <ActionIcon name="plus" />
              </div>
              <div className="accounts-drawer__mini-form">
                <label>
                  Balance
                  <input value={balanceDraft} onChange={(event) => setBalanceDraft(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    setAccountEditBalance(balanceDraft);
                    void saveAccountChanges();
                  }}
                >
                  Update balance
                </button>
              </div>
            </section>

            {openingBalanceEntry ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>Opening balance</h5>
                  <ActionIcon name="history" />
                </div>
                <div className="accounts-drawer__note">
                  <strong>{formatDate(openingBalanceEntry.date)}</strong>
                  <span>{currencyFormatter.format(parseAmount(openingBalanceEntry.amount))}</span>
                </div>
              </section>
            ) : null}

            {latestCheckpoint ? (
              <section className="accounts-drawer__section">
                <div className="accounts-drawer__section-head">
                  <h5>Latest statement checkpoint</h5>
                  <ActionIcon name="calendar" />
                </div>
                <div className="accounts-drawer__note">
                  <strong>{latestCheckpoint.statementEndDate ? formatDate(latestCheckpoint.statementEndDate) : "Unknown date"}</strong>
                  <span>
                    {latestCheckpoint.status === "mismatch"
                      ? latestCheckpoint.mismatchReason ?? "Mismatch detected"
                      : latestCheckpoint.status === "reconciled"
                        ? "Reconciled"
                        : "Pending"}
                  </span>
                  <span>{currencyFormatter.format(parseAmount(latestCheckpoint.endingBalance))}</span>
                </div>
              </section>
            ) : null}

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Import files</h5>
                <ActionIcon name="upload" />
              </div>
              <p className="accounts-drawer__note">Bring in CSV or PDF support files to map balances and transactions back to this account.</p>
              <div className="accounts-drawer__actions">
                <button className="button button-secondary button-small" type="button" onClick={openImportFiles}>
                  Import files
                </button>
                <button className="button button-secondary button-small" type="button" onClick={openFullAccountPage} disabled={!selectedAccount}>
                  Open account page
                </button>
              </div>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Delete account</h5>
                <ActionIcon name="warning" />
              </div>
              <p className="accounts-drawer__note">This removes the account and its linked transactions from the workspace.</p>
              <button className="button button-secondary button-small accounts-drawer__delete" type="button" onClick={() => void deleteAccount()} disabled={accountDeleteBusy}>
                Delete account
              </button>
            </section>

            <section className="accounts-drawer__section">
              <div className="accounts-drawer__section-head">
                <h5>Recent transactions</h5>
                <ActionIcon name="history" />
              </div>
              <div className="accounts-drawer__transactions">
                {selectedAccountTransactions.length > 0 ? (
                  selectedAccountTransactions.slice(0, 5).map((transaction) => (
                    <div key={transaction.id} className="accounts-drawer__transaction">
                      <div>
                        <strong>{transaction.merchantRaw}</strong>
                        <span>{formatDate(transaction.date)} · {transaction.type}</span>
                      </div>
                      <strong>{currencyFormatter.format(parseAmount(transaction.amount))}</strong>
                    </div>
                  ))
                ) : (
                  <p className="accounts-drawer__note">No recent transactions are linked to this account yet.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {addOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAddOpen(false)}>
          <section
            className="modal-card modal-card--wide accounts-add-modal glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-account-title"
            ref={addRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Accounts</p>
                <h4 id="add-account-title">Add an account</h4>
                <p className="modal-copy">Create a manual account with a name, type, and starting balance.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setAddOpen(false)} aria-label="Close add account">
                ×
              </button>
            </div>

            <div className="accounts-add-grid">
              <form className="accounts-manual-form" onSubmit={createManualAccount}>
                <label>
                  Name
                  <input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Example: BDO Savings" />
                </label>
                <label>
                  Type
                  <select value={manualType} onChange={(event) => setManualType(event.target.value as Account["type"])}>
                    <option value="bank">Bank</option>
                    <option value="wallet">Wallet</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="cash">Cash</option>
                    <option value="investment">Investment</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label>
                  Balance
                  <input
                    value={manualBalance}
                    onChange={(event) => setManualBalance(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <button className="button button-primary" type="submit" disabled={isSaving || (manualType === "cash" && accounts.some((account) => account.type === "cash"))}>
                  {isSaving ? "Saving..." : "Create account"}
                </button>
                {manualType === "cash" && accounts.some((account) => account.type === "cash") ? (
                  <p className="modal-copy">Cash already appears automatically in this workspace.</p>
                ) : null}
              </form>
            </div>
          </section>
        </div>
      ) : null}

      <ImportFilesModal
        open={importOpen}
        workspaceId={selectedWorkspaceId}
        accounts={accounts}
        accountRules={accountRules}
        defaultAccountId={selectedAccount?.id ?? accounts[0]?.id ?? null}
        onClose={() => setImportOpen(false)}
        onImported={async (summary) => {
          setUploadInsightsSummary(summary);
          await refreshAll();
          setMessage("Import complete. Insights are ready.");
        }}
      />
      {uploadInsightsSummary ? (
        <UploadInsightsToast summary={uploadInsightsSummary} onClose={() => setUploadInsightsSummary(null)} />
      ) : null}
    </CloverShell>
  );
}
