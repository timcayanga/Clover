import { PageCache, isPageRead } from "./page-cache";
import { selectRecentProfile } from "./profile-selection";
import { useCloudAiConsent } from "./ai-consent";
import { updateNativePlanAnalytics } from "./analytics";
import { uploadInParts } from "./offline/resumable-upload";
import { FileQueue, type QueuedFile } from "./offline/file-queue";
import {
  readUploadBytes,
  clearTemporaryOfflineCopies,
} from "./offline/file-storage";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { Alert, Platform } from "react-native";
import { apiBase, ApiError } from "./api";
import { OfflineEngine } from "./offline/engine";
import { openOfflineStore } from "./offline/store";
import type { CacheEntry } from "./offline/types";
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
  cached: <T>(path: string) => T | null;
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
  const pageCache = useRef(new PageCache());
  const cached = useCallback(<T,>(path: string) => pageCache.current.peek<T>(path), []);
  const preferredProfile = useRef("");
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
        preferredProfile.current = await store.get<string>("selected-profile") ?? "";
        const cached = await store.get<CacheEntry<Bootstrap>>("cache:bootstrap");
        if (active && cached) {
          try {
            await engine.assertLocalAccess();
            if (active) {
              const selected = selectRecentProfile(cached.value.profiles, "", preferredProfile.current);
              for (const entry of await engine.presentationCache(selected)) {
                if (isPageRead(entry.path)) pageCache.current.seed(entry.path, entry.value, entry.savedAt);
              }
              if (!active) { await engine.dispose(); return null; }
              setProfile(selected);
              setData(cached.value);
            }
          } catch { /* Expired access waits for fresh authenticated bootstrap. */ }
        }
        if (!active) {
          await engine.dispose();
          return null;
        }
        void clearTemporaryOfflineCopies().catch(() => {});
        const owner = engine;
        const queue = new FileQueue(
          store,
          {
            status: async (file) => {
              const status = await transport<import("./types").ImportStatus>(
                `imports/${file.canonicalId ?? file.id}/status?workspaceId=${encodeURIComponent(file.workspaceId)}`,
              );
              if(status.nativeUploadReceived === false && file.originalRetained !== false) {
                throw Object.assign(new Error(status.nativeUploadFinalizing ? "Clover is still receiving this file. Check again shortly." : "Resume this upload."),{status:status.nativeUploadFinalizing ? 503 : 404});
              }
              return {
                done: Boolean(
                  status.visibleImportComplete ||
                    status.importFile.status === "done",
                ),
                failed: status.importFile.status === "failed",
              };
            },
            upload: (file, bytes, control) => uploadInParts(transport,file,bytes,control),
            cancel: async file => { await transport(`uploads/${file.id}/cancel?workspaceId=${encodeURIComponent(file.workspaceId)}`,{method:"POST",body:"{}"}); },
          },
          (id) => owner.assertLocalAccess(id),
        );
        fileQueueRef.current = queue;
        queue.subscribe(() => {
          if (active) void queue.list().then(setQueuedFiles);
        });
        // NetInfo's initial subscription event updates reachability without
        // delaying authenticated bootstrap on its separate network probe.
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
  const cloudAi = useCloudAiConsent(transport);
  const cloudAiRef = useRef(cloudAi);
  cloudAiRef.current = cloudAi;
  const request = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      if (path.startsWith("adviser/chat") && options?.method === "POST" && !demo && !(await cloudAiRef.current.ensure())) throw new Error("AI permission was not granted. You can enable it in Privacy and Data Use.");
      if (path.startsWith("split-bill-receipts/preview") && options?.method === "POST" && !demo) await cloudAiRef.current.ensure().catch(() => false);
      if (path.startsWith("settings/ai-consent")) return transport<T>(path, options);
      const engine = await offlineReady.current;
      const read = () => engine ? engine.request<T>(path, options) : transport<T>(path, options);
      if ((options?.method ?? "GET").toUpperCase() !== "GET") {
        pageCache.current.clear();
        try { return await read(); } finally { pageCache.current.clear(); }
      }
      try {
        return isPageRead(path) ? await pageCache.current.read(path, read) : await read();
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) pageCache.current.clear();
        throw error;
      }
    },
    [transport, demo],
  );
  useEffect(() => {
    if (demo) return;
    let current = true;
    setError("");
    request<Bootstrap>("bootstrap")
      .then((result) => {
        if (!current) return;
        setData(previous => {
          if (previous && (previous.offlineEpoch !== result.offlineEpoch ||
            previous.profiles.map(p => p.id).join() !== result.profiles.map(p => p.id).join())) pageCache.current.clear();
          return result;
        });
        if (result.entitlement.analytics) updateNativePlanAnalytics(result.entitlement.analytics);
        setProfile((previous) =>
          selectRecentProfile(result.profiles, previous, preferredProfile.current),
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
        void offlineReady.current.then(async (engine) => {
          // A transport timeout may mark the engine offline without a network
          // change event. Recheck reachability before retrying cached requests.
          const connection = await NetInfo.fetch();
          await engine?.setOnline(
            connection.isConnected !== false &&
              connection.isInternetReachable !== false,
          );
          setRevision((n) => n + 1);
          if (engine?.status.online) await fileQueueRef.current?.flush();
        }).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, []);
  return (
    <Context.Provider
      value={{
        cached,
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
          if (data?.profiles.some((p) => p.id === id)) {
            preferredProfile.current = id;
            setProfile(id);
            void offlineReady.current.then(engine => engine?.store.set("selected-profile", id)).catch(() => {});
          }
        },
        refresh: () => setRevision((n) => n + 1),
        rows,
        uploads,
        registerUpload: async (id, file, targetProfileId = profileId) => {
          if (!data?.profiles.some((p) => p.id === targetProfileId)) return;
          if (!demo) await cloudAiRef.current.ensure().catch(() => false);
          const uploadQueue=fileQueue??fileQueueRef.current;
          if(!demo && Platform.OS!=="web" && !uploadQueue)throw new Error("Secure file storage is still opening. Please try again in a moment.");
          if (uploadQueue) {
            const bytes = await readUploadBytes(file);
            await uploadQueue.add(
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
          pageCache.current.clear();
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
      {cloudAi.prompt}
    </Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("Clover session is unavailable.");
  return value;
}
