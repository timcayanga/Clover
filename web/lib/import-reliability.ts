export type ReliabilityFile = {
  id: string; uploadedAt: string; availableAt: string | null; hasTransactions?: boolean; completedWithoutMeasuredAttempt?: boolean;
  attempts: Array<{ attemptNumber: number; startedAt: string; endedAt?: string;
    leaseExpiresAt: string; outcome: string; historicalAttemptsUnknown?: boolean; transactionObservedAt?: string }>;
};
const elapsed = (from: string, to: string) => Math.max(0, Date.parse(to) - Date.parse(from));
const distribution = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a,b)=>a-b);
  const percentile = (p: number) => sorted.length ? sorted[Math.ceil(p*sorted.length)-1] : null;
  return { count: sorted.length, p50Ms: percentile(.5), p90Ms: percentile(.9), p95Ms: percentile(.95) };
};

/** Aggregate every uploaded file, including files that never reached a worker.
 * Database availability is deliberately not described as on-screen rendering. */
export function summarizeImportReliability(files: ReliabilityFile[], now = new Date()) {
  const firstOutcomes: Record<string,number> = {};
  let knownFirstAttempts = 0, firstAttemptSuccesses = 0, repeatedFiles = 0, extraAttempts = 0;
  let firstAttemptTransactionDeliveries = 0;
  let uninstrumentedFiles = 0, legacyFiles = 0, staleRunningAttempts = 0, under10s = 0, eligible10s = 0;
  let filesWithTransactions = 0, unknownTimingUploads = 0, unmeasuredCompletedUploads = 0;
  const availability: number[] = [], nonSuccess: number[] = [];
  for (const file of files) {
    const attempts = [...file.attempts].sort((a,b)=>a.attemptNumber-b.attemptNumber);
    if (!attempts.length) uninstrumentedFiles++;
    if (!attempts.length && file.completedWithoutMeasuredAttempt) unmeasuredCompletedUploads++;
    if (attempts.length > 1) repeatedFiles++;
    extraAttempts += Math.max(0,attempts.length-1);
    const first = attempts[0];
    if (first?.historicalAttemptsUnknown) legacyFiles++;
    for (const a of attempts) if (a.outcome === "running" && Date.parse(a.leaseExpiresAt) <= now.getTime()) staleRunningAttempts++;
    if (first && first.attemptNumber === 1 && !first.historicalAttemptsUnknown) {
      knownFirstAttempts++;
      const outcome = first.outcome === "running" && Date.parse(first.leaseExpiresAt) <= now.getTime() ? "interrupted" : first.outcome;
      firstOutcomes[outcome] = (firstOutcomes[outcome] ?? 0) + 1;
      if (outcome === "transaction_available" || outcome === "completed_without_transaction") firstAttemptSuccesses++;
      else if (first.endedAt) nonSuccess.push(elapsed(file.uploadedAt,first.endedAt));
      if (outcome === "transaction_available") firstAttemptTransactionDeliveries++;
    }
    const latency = file.availableAt ? elapsed(file.uploadedAt,file.availableAt) : null;
    // A retained availability audit remains evidence of successful delivery
    // even if the user later removes the underlying account/transactions.
    if (file.hasTransactions || latency !== null) filesWithTransactions++;
    if (latency !== null) availability.push(latency);
    // A slow/failed/missing-worker file remains in this denominator. Very new
    // uploads have not yet had their ten-second observation window.
    if (now.getTime()-Date.parse(file.uploadedAt) >= 10_000) {
      eligible10s++;
      if (latency === null && (file.hasTransactions || (!attempts.length && file.completedWithoutMeasuredAttempt))) unknownTimingUploads++;
      if (latency !== null && latency <= 10_000) under10s++;
    }
  }
  return { measurementVersion: 1, boundary: "server_upload_accepted_to_transaction_observed",
    uploadedFiles: files.length, knownFirstAttempts, firstAttemptSuccesses,
    firstAttemptSuccessRate: knownFirstAttempts ? firstAttemptSuccesses/knownFirstAttempts : null,
    firstAttemptTransactionDeliveries,
    firstAttemptTransactionDeliveryRate: knownFirstAttempts ? firstAttemptTransactionDeliveries/knownFirstAttempts : null,
    firstOutcomes, uninstrumentedFiles, unmeasuredCompletedUploads, legacyFiles, repeatedFiles, extraAttempts, staleRunningAttempts,
    filesWithTransactions, filesWithoutTransactions: files.length-filesWithTransactions,
    filesWithTransactionsWithoutObservedTiming: filesWithTransactions-availability.length,
    availableWithin10Seconds: { successes: under10s, eligibleUploads: eligible10s,
      rate: eligible10s && unknownTimingUploads === 0 ? under10s/eligible10s : null },
    unknownTimingUploads,
    uploadToDatabaseAvailability: distribution(availability), uploadToFirstNonSuccessOutcome: distribution(nonSuccess) };
}
