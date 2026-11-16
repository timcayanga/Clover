import { Queue } from "bullmq";
import Redis from "ioredis";
import { getEnv } from "@/lib/env";
import { getDeploymentEnvironment, type DeploymentEnvironment } from "@/lib/deployment-environment";
import type { ImportImageMode } from "@/lib/import-image-mode";

import { startImportTiming } from "./import-timing";

type ImportJobPayload = {
  importFileId: string;
  dispatchId?: string;
  adminRetry?: { requestedBy: string; version: string };
  actorUserId?: string | null;
  password?: string;
  allowDuplicateStatement?: boolean;
  bankName?: string;
  importMode?: ImportImageMode | null;
  pdfJsBaseUrl?: string | null;
};

const redisUrl = getEnv().REDIS_URL ?? "redis://127.0.0.1:6379";
export const getImportQueueName = (environment = getDeploymentEnvironment()) => {

  // Keep the production name stable so already queued production jobs are not stranded.
  return environment === "production" ? "import-processing" : `import-processing-${environment}`;
};

let connection: Redis | null = null;
const queues = new Map<string, Queue<ImportJobPayload>>();

const getConnection = () => {
  connection ??= new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  return connection;
};

export const getAdminImportQueueName = (environment = getDeploymentEnvironment()) => `${getImportQueueName(environment)}-admin`;

export const getImportQueue = (environment: DeploymentEnvironment = getDeploymentEnvironment(), adminRetry = false) => {
  const queueName = adminRetry ? getAdminImportQueueName(environment) : getImportQueueName(environment);
  const existing = queues.get(queueName);
  if (existing) return existing;
  const queue = new Queue<ImportJobPayload>(queueName, {
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

  queues.set(queueName, queue);
  return queue;
};

export const enqueueImportProcessing = async (payload: ImportJobPayload, options?: { jobId?: string }) => {
  const jobId = options?.jobId ?? payload.importFileId;
  const finish = startImportTiming(payload.importFileId, "queue_dispatch", { queueJobId: jobId });
  try {
    const importQueue = getImportQueue();
    const existingJob = await importQueue.getJob(jobId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (["active", "delayed", "prioritized", "waiting", "waiting-children"].includes(state)) {
        finish("completed", "reused_job");
        return existingJob;
      }
      await existingJob.remove();
    }

    const job = await importQueue.add("process-import", payload, { jobId, ...(payload.dispatchId ? { attempts: 1 } : {}) });
    finish("completed", "enqueue_acknowledged");
    return job;
  } catch (error) {
    finish("failed");
    throw error;
  }
};

export const getRedisConnection = getConnection;
