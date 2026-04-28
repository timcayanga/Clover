export type BankFileLike = {
  status: string;
  runCount: number;
  parsedRowsCount: number | null;
  confirmedTransactionsCount: number | null;
};

export const isStaleBankFile = (file: BankFileLike) =>
  file.status !== "processing" &&
  file.status !== "queued" &&
  file.runCount === 0 &&
  (!file.parsedRowsCount || file.parsedRowsCount === 0) &&
  (!file.confirmedTransactionsCount || file.confirmedTransactionsCount === 0);

export const normalizeFileNameKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const dedupeBankFilesByName = <T extends { fileName: string; latestRunAt: string | null; updatedAt?: string | null }>(
  files: T[]
) => {
  const byName = new Map<string, T[]>();

  for (const file of files) {
    const key = normalizeFileNameKey(file.fileName);
    const current = byName.get(key);
    if (current) {
      current.push(file);
    } else {
      byName.set(key, [file]);
    }
  }

  return Array.from(byName.values()).map((group) =>
    group.slice().sort((left, right) => {
      const leftTime = left.latestRunAt ? new Date(left.latestRunAt).getTime() : left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
      const rightTime = right.latestRunAt ? new Date(right.latestRunAt).getTime() : right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    })[0]
  );
};
