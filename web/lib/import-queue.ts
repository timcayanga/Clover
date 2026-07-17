import { Queue } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import type { ImportImageMode } from "@/lib/import-image-mode";

type ImportJobPayload = {
  importFileId: string;
  actorUserId?: string | null;
  password?: string;
  allowDuplicateStatement?: boolean;
  bankName?: string;
  importMode?: ImportImageMode | null;
  pdfJsBaseUrl?: string | null;
};

const redisUrl = getEnv().REDIS_URL ?? "redis://127.0.0.1:6379";

let connection: Redis | null = null;
let queue: Queue<ImportJobPayload> | null = null;

const getConnection = () => {
  connection ??= new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  return connection;
};

export const getImportQueue = () => {
  queue ??= new Queue<ImportJobPayload>("import-processing", {
    connection: getConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });

  return queue;
};

export const enqueueImportProcessing = async (payload: ImportJobPayload, options?: { jobId?: string }) => {
  const importQueue = getImportQueue();
  const jobId = options?.jobId ?? payload.importFileId;
  const existingJob = await importQueue.getJob(jobId);

  if (existingJob) {
    const state = await existingJob.getState();
    if (["active", "delayed", "prioritized", "waiting", "waiting-children"].includes(state)) {
      return existingJob;
    }

    await existingJob.remove();
  }

  return importQueue.add("process-import", payload, { jobId });
};

export const getRedisConnection = getConnection;
