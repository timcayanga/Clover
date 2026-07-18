import { toBalanceString } from "@/lib/import-upload-summary";

type SettledVisibilityParams = {
  importFileId?: string | null;
  accountId: string | null;
  importedRows: number;
  expectedBalance: string | null;
  timeoutMs?: number;
};

type ImportStatusSnapshot = {
  confirmedTransactionsCount?: number | null;
  parsedRowsCount?: number | null;
  visibleImportComplete?: boolean | null;
  confirmationStatus?: string | null;
  receiptTransaction?: unknown;
  receiptDocument?: unknown;
};

type AccountPayload = {
  account?: {
    id?: string;
    balance?: unknown;
  };
} | null;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const normalizeBalance = (value: unknown) => {
  const text = toBalanceString(value);
  if (!text) {
    return null;
  }

  const numeric = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
};

const fetchAccountPayload = async (accountId: string) => {
  const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }

  return (await response.json().catch(() => null)) as AccountPayload;
};

const accountLooksSettled = (params: {
  account: { id?: unknown; balance?: unknown } | null;
  accountId: string;
  expectedBalance: string | null;
}) => {
  const { account, accountId, expectedBalance } = params;
  const accountBalance = normalizeBalance(account?.balance);
  const accountLooksReady = Boolean(account && typeof account.id === "string" && account.id === accountId);
  const balanceLooksReady =
    expectedBalance === null ? true : accountBalance !== null && normalizeBalance(expectedBalance) === accountBalance;

  return accountLooksReady && balanceLooksReady;
};

const waitWithStatusStream = async (params: {
  accountId: string;
  importFileId?: string | null;
  importedRows: number;
  expectedBalance: string | null;
  timeoutMs: number;
  pollDelayMs: number;
}) => {
  if (!params.importFileId || typeof EventSource === "undefined") {
    return null;
  }

  const eventUrl = `/api/imports/${encodeURIComponent(params.importFileId)}/events`;
  const latestStatusRef = { current: null as null | ImportStatusSnapshot };

  return await new Promise<boolean | null>((resolve) => {
    let cleanup = () => undefined;
    const timeout = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, params.timeoutMs);
    const source = new EventSource(eventUrl);
    let finished = false;

    cleanup = () => {
      if (finished) {
        return;
      }

      finished = true;
      window.clearTimeout(timeout);
      window.clearInterval(accountPoll);
      try {
        source.close();
      } catch {
        // Ignore close errors and let the fallback poll continue.
      }
    };

    const evaluate = (account: { id?: unknown; balance?: unknown } | null) => {
      if (
        !accountLooksSettled({
          account,
          accountId: params.accountId,
          expectedBalance: params.expectedBalance,
        })
      ) {
        return false;
      }

      if (params.importedRows > 0 && params.importFileId) {
        const confirmedTransactionsCount = Number(latestStatusRef.current?.confirmedTransactionsCount ?? 0);
        const parsedRowsCount = Number(latestStatusRef.current?.parsedRowsCount ?? 0);
        const hasVisibleReceiptOrImport =
          latestStatusRef.current?.visibleImportComplete === true ||
          latestStatusRef.current?.confirmationStatus === "confirmed" ||
          Boolean(latestStatusRef.current?.receiptTransaction) ||
          Boolean(latestStatusRef.current?.receiptDocument);
        return confirmedTransactionsCount >= params.importedRows || parsedRowsCount >= params.importedRows || hasVisibleReceiptOrImport;
      }

      return true;
    };

    const captureStatusSnapshot = (payload: ImportStatusSnapshot) => {
      latestStatusRef.current = {
        confirmedTransactionsCount: Number(payload.confirmedTransactionsCount ?? 0),
        parsedRowsCount: Number(payload.parsedRowsCount ?? 0),
        visibleImportComplete: payload.visibleImportComplete === true,
        confirmationStatus: typeof payload.confirmationStatus === "string" ? payload.confirmationStatus : null,
        receiptTransaction: payload.receiptTransaction ?? null,
        receiptDocument: payload.receiptDocument ?? null,
      };
    };

    source.addEventListener("snapshot", (event) => {
      try {
        captureStatusSnapshot(JSON.parse((event as MessageEvent<string>).data) as ImportStatusSnapshot);
      } catch {
        // Ignore malformed payloads and keep the fallback poll running.
      }
    });

    source.addEventListener("complete", (event) => {
      try {
        captureStatusSnapshot(JSON.parse((event as MessageEvent<string>).data) as ImportStatusSnapshot);
      } catch {
        // Ignore malformed payloads.
      }
    });

    source.addEventListener("visible", () => {
      void (async () => {
        try {
          const payload = await fetchAccountPayload(params.accountId);
          if (evaluate(payload?.account ?? null)) {
            cleanup();
            resolve(true);
          }
        } catch {
          // Fall back to the regular poll loop.
        }
      })();
    });

    source.onerror = () => {
      cleanup();
      resolve(null);
    };

    const accountPoll = window.setInterval(async () => {
      try {
        const payload = await fetchAccountPayload(params.accountId);
        if (evaluate(payload?.account ?? null)) {
          cleanup();
          resolve(true);
        }
      } catch {
        // Keep waiting until timeout or a later poll succeeds.
      }
    }, params.pollDelayMs);
  });
};

export const waitForImportSettledVisibility = async (params: SettledVisibilityParams) => {
  const accountId = params.accountId && !params.accountId.startsWith("optimistic-") ? params.accountId : null;
  if (!accountId) {
    return true;
  }

  const expectedBalance = toBalanceString(params.expectedBalance);
  const timeoutMs = params.timeoutMs ?? 10_000;
  const startedAt = Date.now();
  // Status snapshots fan out to several database reads. Keep client polling
  // comfortably below the server's stream cadence to avoid connection storms.
  const pollDelayMs = 1_500;

  const streamResult = await waitWithStatusStream({
    accountId,
    importFileId: params.importFileId ?? null,
    importedRows: params.importedRows,
    expectedBalance,
    timeoutMs,
    pollDelayMs,
  });
  if (streamResult !== null) {
    return streamResult;
  }

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const accountResponsePromise = fetchAccountPayload(accountId);
      const statusResponsePromise =
        params.importedRows > 0 && params.importFileId
          ? fetch(`/api/imports/${encodeURIComponent(params.importFileId)}/status`, {
              cache: "no-store",
            })
          : null;
      const transactionsResponsePromise =
        params.importedRows > 0 && !params.importFileId
          ? fetch(
              `/api/accounts/${encodeURIComponent(accountId)}/transactions?page=1&pageSize=${Math.min(Math.max(params.importedRows, 25), 100)}`,
              {
                cache: "no-store",
              }
            )
          : null;

      const [accountPayload, statusResponse, transactionsResponse] = await Promise.all([
        accountResponsePromise,
        statusResponsePromise ?? Promise.resolve(null),
        transactionsResponsePromise ?? Promise.resolve(null),
      ]);

      if (
        !accountLooksSettled({
          account: accountPayload?.account ?? null,
          accountId,
          expectedBalance,
        })
      ) {
        await sleep(pollDelayMs);
        continue;
      }

      const [statusPayload, transactionPayload] = await Promise.all([
        statusResponse && statusResponse.ok ? statusResponse.json().catch(() => null) : Promise.resolve(null),
        transactionsResponse && transactionsResponse.ok ? transactionsResponse.json().catch(() => null) : Promise.resolve(null),
      ]);

      if (params.importedRows > 0 && params.importFileId) {
        const confirmedTransactionsCount = Number(statusPayload?.confirmedTransactionsCount ?? 0);
        const parsedRowsCount = Number(statusPayload?.parsedRowsCount ?? 0);
        const hasVisibleReceiptOrImport =
          statusPayload?.visibleImportComplete === true ||
          statusPayload?.confirmationStatus === "confirmed" ||
          Boolean(statusPayload?.receiptTransaction) ||
          Boolean(statusPayload?.receiptDocument);
        if (confirmedTransactionsCount < params.importedRows && parsedRowsCount < params.importedRows && !hasVisibleReceiptOrImport) {
          await sleep(pollDelayMs);
          continue;
        }
      } else if (params.importedRows > 0) {
        const totalCount = Number(transactionPayload?.totalCount ?? 0);
        if (totalCount < params.importedRows) {
          await sleep(pollDelayMs);
          continue;
        }
      }

      return true;
    } catch {
      await sleep(pollDelayMs);
    }
  }

  return false;
};
