import { Queue } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";

type ImportJobPayload = {
  importFileId: string;
  password?: string;
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

export const enqueueImportProcessing = async (payload: ImportJobPayload) => {
  return getImportQueue().add("process-import", payload, {
    jobId: payload.importFileId,
  });
};

export const getRedisConnection = getConnection;
