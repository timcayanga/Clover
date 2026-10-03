import { onImportQueued } from "../../src/import-handoff";
import { PlanHeader } from "../../src/plan-ui";
import { EntrySelector, EntryTransition } from "../../src/entry-controls";
import { FinverseConnect } from "../../src/finverse-connect";
import { beginTelemetry } from "../../../shared/analytics";
import { Text } from "../../src/app-text";
import { TransactionTableEntry } from "../../src/transaction-table-entry";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  View,
  Pressable,
  Image,
} from "react-native";
import {
  Choices,
  ManualTransaction,
  TransactionChat,
  emptyTransaction,
} from "../../src/transaction-entry";
import { useSession } from "../../src/session";
import {
  fileProblem,
  removeUploadCopy,
  type SelectedFile,
} from "../../src/upload";
import {
  Body,
  Button,
  Card,
  Heading,
  Icon,
  Notice,
  Screen,
  useTheme,
} from "../../src/ui";
export default function Add({ sheet = false }: { sheet?: boolean } = {}) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const [tableMode, setTableMode] = useState(false);
  const [tab, setTab] = useState("manual");
  const [draft, setDraft] = useState(emptyTransaction);
  const { entry, picker, importMode } = useLocalSearchParams<{
    importMode?: "receipt" | "statement" | "portfolio" | "account_detail";
    entry?: string;
    picker?: string;
  }>();
  const handledPicker = useRef(false);

  const close = () => {
    if (busy) return;
    if (sheet && router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };
  useFocusEffect(useCallback(() => onImportQueued(() => {
    if (sheet && router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  }), [sheet]));
  useEffect(() => {
    setTab(entry?.startsWith("upload-") ? "upload" : "manual");
    setDraft(emptyTransaction());
  }, [entry, session.profileId]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<
    { id: string; fileName: string; status: string }[]
  >([]);
  useFocusEffect(
    useCallback(() => {
      let current = true;
      if (tab !== "upload") return;
      setHistory([]);
      setHistoryError("");
      setHistoryLoading(!session.demo);
      if (session.demo)
        setHistory([
          {
            id: "sample-import",
            fileName: "Sample September statement",
            status: "done",
          },
        ]);
      else
        void session
          .request<{ importFiles: typeof history }>(
            `imports?workspaceId=${encodeURIComponent(session.profileId)}`,
          )
          .then((data) => {
            if (current) { setHistory(data.importFiles.slice(0, 10)); setHistoryError(""); }
          })
          .catch(() => {
            if (current)
              setHistoryError("Recent imports could not load. You can still upload a new file.");
          }).finally(() => { if (current) setHistoryLoading(false); });
      return () => {
        current = false;
      };
    }, [session.demo, session.profileId, session.request, tab, historyRevision]),
  );
  const open = async (file: SelectedFile) => {
    const problem = fileProblem(file);
    if (problem) {
      removeUploadCopy(file.uri);
      setError(problem);
      return;
    }
    const preferred =
      session.data?.preferences?.defaults.defaultImportProfileId;
    const target =
      session.data?.profiles.find((p) => p.id === preferred) ??
      session.data?.profiles.find((p) => p.id === session.profileId);
    if (!target) {
      removeUploadCopy(file.uri);
      setError("Choose a Profile before importing.");
      return;
    }
    const continueImport = async () => {
      const id = Crypto.randomUUID();
      session.setProfileId(target.id);
      setBusy(true);
      await session
        .registerUpload(id, file, target.id, importMode)
        .catch((e: Error) => setError(e.message))
        .finally(() => setBusy(false));
    };
    if (
      target.id !== session.profileId &&
      session.data?.preferences?.review.askBeforeDifferentProfile !== false
    ) {
      Alert.alert(
        "Import into another Profile?",
        `Your default import Profile is ${target.name}. Import this file there?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => removeUploadCopy(file.uri),
          },
          { text: `Use ${target.name}`, onPress: continueImport },
        ],
        { cancelable: false },
      );
    } else await continueImport();
  };
  const choose = async (source: "file" | "library" | "camera") => {
    if (busy) return;
    setError("");
    if (session.demo) {
      router.push({
        pathname: "/import/[id]",
        params: { id: "sample-import" },
      });
      return;
    }
    if (Platform.OS === "web") {
      setError(
        "Live uploads in this preview run on iOS and Android. Use Clover’s regular website for browser uploads.",
      );
      return;
    }
    setBusy(true);
    const finishInput = beginTelemetry("input", {
      input_method: source,
      screen: "/add",
    });
    try {
      if (source === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: false,
          copyToCacheDirectory: true,
        });
        finishInput(result.canceled ? "canceled" : "completed");
        if (!result.canceled) { const asset = result.assets[0]; await open({ ...asset, size: asset.size ?? new File(asset.uri).size }); }
      } else {
        if (
          source === "camera" &&
          !(await ImagePicker.requestCameraPermissionsAsync()).granted
        ) {
          finishInput("failed", { reason: "permission_denied" });
          setError(
            "Camera permission is needed to photograph a receipt. You can still choose a file.",
          );
          return;
        }
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.85,
          exif: false,
        };
        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        finishInput(result.canceled ? "canceled" : "completed");
        if (!result.canceled) {
          const asset = result.assets[0];
          await open({
            uri: asset.uri,
            name: asset.fileName ?? "receipt.jpg",
            mimeType: asset.mimeType ?? "image/jpeg",
            size: asset.fileSize ?? new File(asset.uri).size,
          });
        }
      }
    } catch {
      finishInput("failed", { reason: "picker_unavailable" });
      setError("The picker could not open. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  // Only onboarding's explicit upload choice sets this parameter. Consume it once.
  useEffect(() => {
    if (
      handledPicker.current ||
      !session.data?.profiles.length ||
      !["file", "camera", "library"].includes(picker ?? "")
    )
      return;
    handledPicker.current = true;
    router.setParams({ picker: undefined });
    void choose(picker as "file" | "camera" | "library");
  }, [picker, session.data]);
  return (
    <View style={{ flex: 1 }}>
      <Screen sheet={sheet} onDismiss={close}>
        <PlanHeader title={entry?.startsWith("upload-") ? "Upload" : "Add Transaction"} back={close}/>
        <View
          style={{
            backgroundColor: colors.white,
            borderRadius: 24,
            padding: 18,
            gap: 16,
            minHeight: 650,
          }}
        >
          <EntrySelector value={tab} items={["manual", "ask", "upload", "sync"]} onChange={method => setTab(method as typeof tab)}/>
          <EntryTransition value={tab}>
          {tab === "sync" ? <FinverseConnect mode="sync" onSynced={()=>{}} /> : null}
          <View style={{ display: tab === "manual" ? "flex" : "none" }}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
              <Pressable accessibilityRole="button" accessibilityLabel={tableMode ? "Single entry" : "Table entry"} onPress={() => setTableMode(!tableMode)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon line name={tableMode ? "create-outline" : "grid-outline"} size={22}/></Pressable>
            </View>
            <View style={{ display: tableMode ? "none" : "flex" }}>
              <ManualTransaction draft={draft} onChange={setDraft} onSaved={() => { if (sheet && router.canGoBack()) router.back(); else router.replace("/(tabs)"); }} />
            </View>
            <View style={{ display: tableMode ? "flex" : "none" }}>
              <TransactionTableEntry key={session.profileId} />
            </View>
          </View>
          <View style={{ display: tab === "ask" ? "flex" : "none" }}>
            {tab === "ask" ? (
              <TransactionChat
                context={{ kind: "transaction", fields: { accountId: draft.accountId, currency: draft.currency, date: draft.date, type: draft.type, merchantRaw: draft.merchantRaw, amount: draft.amount } }}
                onReview={(value) => {
                  setDraft(value);
                  setTab("manual");
                }}
              />
            ) : null}
          </View>
          <View
            style={{ display: tab === "upload" ? "flex" : "none", gap: 18 }}
          >

            <View style={{ gap: 10 }}>
              {(
                [
                  ["file", "Choose files"],
                  ["camera", "Take photo"],
                  ["library", "Photo library"],
                ] as const
              ).map(([source, label]) => (
                <Pressable
                  key={source}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  onPress={() => void choose(source)}
                  style={{
                    flexDirection: "row",
                    minHeight: 80,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 16,
                    backgroundColor: colors.white,
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 14,
                  }}
                >
                  <Image
                    source={
                      source === "file"
                        ? require("../../assets/organize/upload-files.png")
                        : source === "camera"
                          ? require("../../assets/organize/upload-camera.png")
                          : require("../../assets/organize/upload-library.png")
                    }
                    style={{ width: 56, height: 56 }}
                  />
                  <Text
                    style={{
                      color: colors.ink,
                      textAlign: "center",
                      fontSize: 15,
                      fontWeight: "500",
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {error ? <Notice>{error}</Notice> : null}
            <Body>
              {session.demo
                ? "Sample mode shows a completed sample import. It never opens or uploads your files."
                : "Photos up to 10 MB. Documents up to 25 MB. Review imported details before confirming."}
            </Body>
            <Body>
              Your files are protected with encrypted connections and restricted
              access. Clover never sells your data.
            </Body>
            <Body>Password-protected PDFs supported.</Body>
            {historyError ? <Card><Notice>{historyError}</Notice><Button secondary title="Retry recent imports" disabled={historyLoading} onPress={() => setHistoryRevision(value => value + 1)} /></Card> : null}
            {history.length > 0 && (
              <Card>
                <Body>Recent imports</Body>
                {history.map((item) => (
                  <Button
                    key={item.id}
                    title={`${item.fileName} · ${item.status}`}
                    secondary
                    onPress={() =>
                      router.push({
                        pathname: "/import/[id]",
                        params: { id: item.id },
                      })
                    }
                  />
                ))}
              </Card>
            )}
          </View>
          </EntryTransition>
        </View>
      </Screen>
    </View>
  );
}
