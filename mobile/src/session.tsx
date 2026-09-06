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
  demo: boolean;
  ready: boolean;
  data: Bootstrap | null;
  error: string;
  profileId: string;
  setProfileId: (id: string) => void;
  refresh: () => void;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  rows: Transaction[];
  updateSample: (row: Transaction) => void;
  signOut: () => Promise<void>;
  uploads: Record<
    string,
    { file: SelectedFile; profileId: string; started?: boolean }
  >;
  registerUpload: (id: string, file: SelectedFile) => void;
  markUploadStarted: (id: string) => void;
};
const Context = createContext<Session | null>(null);
export function SessionProvider({
  children,
  demo,
  getToken,
  signOut,
}: {
  children: ReactNode;
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
  const request = useCallback(
    async <T,>(path: string, options?: RequestInit) => {
      if (demo) throw new Error("Sample mode never connects to your account.");
      const token = await tokenRef.current();
      if (!token)
        throw new Error("Your session expired. Please sign in again.");
      return apiRequest<T>(token, path, options);
    },
    [demo],
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
      if (state === "active") setRevision((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);
  return (
    <Context.Provider
      value={{
        demo,
        data,
        error,
        profileId,
        ready: Boolean(data),
        request,
        setProfileId: (id) => {
          if (data?.profiles.some((p) => p.id === id)) setProfile(id);
        },
        refresh: () => setRevision((n) => n + 1),
        rows,
        uploads,
        registerUpload: (id, file) => {
          uploadCopies.current.push(file.uri);
          setUploads((previous) => ({
            ...previous,
            [id]: { file, profileId },
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
