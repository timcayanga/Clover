import { FileQueue, type QueuedFile } from "./offline/file-queue";
import {
  readUploadBytes,
  withUploadCopy,
  clearTemporaryOfflineCopies,
} from "./offline/file-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { Alert, Platform } from "react-native";
import { apiBase, ApiError } from "./api";
import { OfflineEngine } from "./offline/engine";
import { openOfflineStore } from "./offline/store";
import type { OfflineStatus } from "./offline/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { apiRequest } from "./api";
import { sampleBootstrap, sampleTransactions } from "./sample-data";
import type { Bootstrap, Transaction } from "./types";
import { removeUploadCopy, type SelectedFile } from "./upload";

type Session = {
  fileQueue: FileQueue | null;
  queuedFiles: QueuedFile[];
  offline: OfflineEngine | null;
  offlineStatus: OfflineStatus;
  demo: boolean;
  ready: boolean;
  data: Bootstrap | null;
  error: string;
  profileId: string;
  setProfileId: (id: string) => void;
  refresh: () => void;
  download: (path: string) => Promise<string>;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  rows: Transaction[];
  updateSample: (row: Transaction) => void;
  signOut: () => Promise<void>;
  uploads: Record<
    string,
    { file: SelectedFile; profileId: string; started?: boolean }
  >;
  registerUpload: (
    id: string,
    file: SelectedFile,
    targetProfileId?: string,
  ) => Promise<void>;
  markUploadStarted: (id: string) => void;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({
  children,
  userId,
  demo,
  getToken,
  signOut,
}: {
  children: ReactNode;
  userId?: string | null;
  demo: boolean;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}) {
  const [data, setData] = useState<Bootstrap | null>(
    demo ? sampleBootstrap : null,
  );
  const [profileId, setProfile] = useState(
    demo ? sampleBootstrap.profiles[0].id : "",
  );
  const [error, setError] = useState("");
  const [rows, setRows] = useState(sampleTransactions);
  const [revision, setRevision] = useState(0);
  const [uploads, setUploads] = useState<Session["uploads"]>({});
  const uploadCopies = useRef<string[]>([]);
  useEffect(
    () => () => {
      uploadCopies.current.forEach(removeUploadCopy);
    },
    [],
  );
  const tokenRef = useRef(getToken);
  tokenRef.current = getToken;
  const [fileQueue, setFileQueue] = useState<FileQueue | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const fileQueueRef = useRef<FileQueue | null>(null);
  const [offline, setOffline] = useState<OfflineEngine | null>(null);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>({
    online: true,
    syncing: false,
    pending: 0,
    conflicts: 0,
    lastSync: null,
    error: "",
  });
  const offlineReady = useRef<Promise<OfflineEngine | null>>(
    Promise.resolve(null),
  );
  const transport = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      if (demo) throw new Error("Sample mode never connects to your account.");
      const token = await tokenRef.current();
      if (!token)
        throw new ApiError("Your session expired. Please sign in again.", 401);
      return apiRequest<T>(token, path, options);
    },
    [demo],
  );
  useEffect(() => {
    if (demo || !userId || Platform.OS === "web") return;
    let active = true,
      engine: OfflineEngine | null = null,
      unsubscribe: undefined | (() => void),
      network: undefined | (() => void);
    offlineReady.current = (async () => {
      try {
        const store = await openOfflineStore(`${apiBase()}:${userId}`);
        engine = new OfflineEngine(store, transport, () => Crypto.randomUUID());
        await engine.init();
        if (!active) {
          await engine.dispose();
          return null;
        }
        await clearTemporaryOfflineCopies();
        const owner = engine;
        const queue = new FileQueue(
          store,
          {
            status: async (file) => {
              const status = await transport<import("./types").ImportStatus>(
                `imports/${file.canonicalId ?? file.id}/status?workspaceId=${encodeURIComponent(file.workspaceId)}`,
              );
              return {
                done: Boolean(
                  status.visibleImportComplete ||
                    status.importFile.status === "done",
                ),
                failed: status.importFile.status === "failed",
              };
            },
            upload: async (file, bytes) =>
              withUploadCopy(file, bytes, async (uri) => {
                const form = new FormData();
                form.append("file", {
                  uri,
                  name: file.name,
                  type: file.mimeType,
                } as unknown as Blob);
                if (file.password) form.append("password", file.password);
                const response = await transport<{
                  canonicalImportFileId?: string;
                }>(
                  `imports/${file.id}/process?workspaceId=${encodeURIComponent(file.workspaceId)}`,
                  { method: "POST", body: form },
                );
                return { canonicalId: response.canonicalImportFileId };
              }),
          },
          (id) => owner.assertLocalAccess(id),
        );
        fileQueueRef.current = queue;
        queue.subscribe(() => {
          if (active) void queue.list().then(setQueuedFiles);
        });
        const connection = await NetInfo.fetch();
        engine.status.online =
          connection.isConnected !== false &&
          connection.isInternetReachable !== false;
        if (!active) {
          await queue.close();
          await engine.dispose();
          return null;
        }
        setFileQueue(queue);
        setQueuedFiles(await queue.list());
        setOffline(engine);
        setOfflineStatus({ ...engine.status });
        unsubscribe = engine.subscribe(() => {
          if (active) {
            setOfflineStatus({ ...engine!.status });
            void queue.list().then(setQueuedFiles);
          }
        });
        network = NetInfo.addEventListener((state) => {
          if (active) {
            const online =
              state.isConnected !== false &&
              state.isInternetReachable !== false;
            const changed = engine!.status.online !== online;
            void engine!
              .setOnline(online)
              .then(() => {
                if (changed) setRevision((n) => n + 1);
                if (engine!.status.online) return queue.flush();
              })
              .catch(() => {});
          }
        });
        return engine;
      } catch (e) {
        if (active)
          setOfflineStatus((s) => ({ ...s, error: (e as Error).message }));
        return null;
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
      network?.();
      void (async () => {
        await fileQueueRef.current?.close();
        await engine?.dispose();
      })().catch(() => {});
    };
  }, [demo, userId, transport]);
  const request = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      const engine = await offlineReady.current;
      return engine
        ? engine.request<T>(path, options)
        : transport<T>(path, options);
    },
    [transport],
  );
  useEffect(() => {
    if (demo) return;
    let current = true;
    setError("");
    request<Bootstrap>("bootstrap")
      .then((result) => {
        if (!current) return;
        setData(result);
        setProfile((previous) =>
          result.profiles.some((p) => p.id === previous)
            ? previous
            : result.profiles.length === 1
              ? result.profiles[0].id
              : "",
        );
      })
      .catch((e: Error) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [demo, request, revision]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setRevision((n) => n + 1);
        void offlineReady.current.then(async (engine) => {
          await engine?.sync();
          if (engine?.status.online) await fileQueueRef.current?.flush();
        });
      }
    });
    return () => subscription.remove();
  }, []);
  return (
    <Context.Provider
      value={{
        fileQueue,
        queuedFiles,
        offline,
        offlineStatus,
        demo,
        data,
        error,
        profileId,
        ready: Boolean(data),
        request,
        download: async (path) => {
          if (demo) throw new Error("Sign in to export your records.");
          const token = await tokenRef.current();
          if (!token)
            throw new Error("Your session expired. Please sign in again.");
          return apiRequest<string>(token, path, {}, "text");
        },
        setProfileId: (id) => {
          if (data?.profiles.some((p) => p.id === id)) setProfile(id);
        },
        refresh: () => setRevision((n) => n + 1),
        rows,
        uploads,
        registerUpload: async (id, file, targetProfileId = profileId) => {
          if (!data?.profiles.some((p) => p.id === targetProfileId)) return;
          if (fileQueue) {
            const bytes = await readUploadBytes(file);
            await fileQueue.add(
              {
                id,
                workspaceId: targetProfileId,
                name: file.name,
                mimeType: file.mimeType ?? "application/octet-stream",
                size: file.size ?? 0,
                createdAt: new Date().toISOString(),
                state: "draft",
              },
              bytes,
            );
            removeUploadCopy(file.uri);
            return;
          }
          uploadCopies.current.push(file.uri);
          setUploads((previous) => ({
            ...previous,
            [id]: { file, profileId: targetProfileId },
          }));
        },
        markUploadStarted: (id) =>
          setUploads((previous) =>
            previous[id]
              ? { ...previous, [id]: { ...previous[id], started: true } }
              : previous,
          ),
        updateSample: (row) =>
          setRows((all) =>
            all.map((item) => (item.id === row.id ? row : item)),
          ),
        signOut: async () => {
          if (
            offlineStatus.pending > 0 ||
            queuedFiles.some((f) => f.state !== "done")
          ) {
            const confirmed = await new Promise<boolean>((resolve) =>
              Alert.alert(
                "Unsynced changes",
                "Signing out removes changes saved only on this device. Sync first to keep them.",
                [
                  {
                    text: "Stay signed in",
                    style: "cancel",
                    onPress: () => resolve(false),
                  },
                  {
                    text: "Discard and sign out",
                    style: "destructive",
                    onPress: () => resolve(true),
                  },
                ],
                { cancelable: false },
              ),
            );
            if (!confirmed) return;
          }
          await fileQueue?.close();
          await offline?.clear();
          await signOut();
          setData(null);
          setProfile("");
          setRows(sampleTransactions);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Clover session is unavailable.");
  return value;
}
