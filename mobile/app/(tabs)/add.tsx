import { LinearGradient } from "expo-linear-gradient";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View, Pressable, Text, Image } from "react-native";
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
export default function Add() {
  const { colors, dark } = useTheme();
  const session = useSession();
  const [tab, setTab] = useState("manual");
  const [draft, setDraft] = useState(emptyTransaction);
  const { entry, picker } = useLocalSearchParams<{
    entry?: string;
    picker?: string;
  }>();
  const handledPicker = useRef(false);
  useEffect(() => {
    setTab(entry?.startsWith("upload-") ? "upload" : "manual");
    setDraft(emptyTransaction());
  }, [entry]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<
    { id: string; fileName: string; status: string }[]
  >([]);
  useFocusEffect(
    useCallback(() => {
      let current = true;
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
            if (current) setHistory(data.importFiles.slice(0, 10));
          })
          .catch(() => {
            if (current)
              setError(
                "Import history could not refresh. Please try again shortly.",
              );
          });
      return () => {
        current = false;
      };
    }, [session.demo, session.profileId, session.request]),
  );
  const open = (file: SelectedFile) => {
    const problem = fileProblem(file);
    if (problem) {
      removeUploadCopy(file.uri);
      setError(problem);
      return;
    }
    const id = Crypto.randomUUID();
    session.registerUpload(id, file);
    router.push({ pathname: "/import/[id]", params: { id } });
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
    try {
      if (source === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: false,
          copyToCacheDirectory: true,
        });
        if (!result.canceled) open(result.assets[0]);
      } else {
        if (
          source === "camera" &&
          !(await ImagePicker.requestCameraPermissionsAsync()).granted
        ) {
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
        if (!result.canceled) {
          const asset = result.assets[0];
          open({
            uri: asset.uri,
            name: asset.fileName ?? "receipt.jpg",
            mimeType: asset.mimeType ?? "image/jpeg",
            size: asset.fileSize ?? new File(asset.uri).size,
          });
        }
      }
    } catch {
      setError("The picker could not open. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  // Only onboarding's explicit upload choice sets this parameter. Consume it once.
  useEffect(() => {
    if (
      handledPicker.current ||
      !session.data ||
      !["file", "camera", "library"].includes(picker ?? "")
    )
      return;
    handledPicker.current = true;
    router.setParams({ picker: undefined });
    void choose(picker as "file" | "camera" | "library");
  }, [picker, session.data]);
  return (
    <Screen>
      <View
        style={{
          backgroundColor: colors.white,
          borderRadius: 24,
          padding: 18,
          gap: 16,
          minHeight: 650,
        }}
      >
        <View
          style={{
            width: 36,
            height: 4,
            borderRadius: 4,
            backgroundColor: colors.line,
            alignSelf: "center",
          }}
        />
        <Heading>Add transaction</Heading>
        <Button
          title="Close"
          secondary
          onPress={() => {
            setDraft(emptyTransaction());
            router.navigate("/(tabs)/transactions");
          }}
        />
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            padding: 4,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: dark ? "#0e1b21" : "#ecf4f5",
          }}
        >
          {(["manual", "ask", "upload"] as const).map((method) => (
            <Pressable
              key={method}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === method }}
              aria-selected={tab === method}
              onPress={() => setTab(method)}
              style={{ flex: 1, borderRadius: 999, overflow: "hidden" }}
            >
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                colors={
                  tab === method
                    ? ["#03a8c0", "#28cfca"]
                    : ["transparent", "transparent"]
                }
                style={{
                  minHeight: 52,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Image
                  source={
                    method === "manual"
                      ? require("../../assets/organize/method-manual.png")
                      : method === "ask"
                        ? require("../../assets/organize/method-ask.png")
                        : require("../../assets/organize/method-upload.png")
                  }
                  style={{
                    width: 20,
                    height: 20,
                    tintColor: tab === method ? "white" : colors.teal,
                  }}
                />
                <Text
                  style={{
                    color: tab === method ? "white" : colors.ink,
                    fontSize: 12,
                  }}
                >
                  {method === "manual"
                    ? "Manual"
                    : method === "ask"
                      ? "Ask Clover"
                      : "Upload"}
                </Text>
              </LinearGradient>
            </Pressable>
          ))}
        </View>
        <View style={{ display: tab === "manual" ? "flex" : "none" }}>
          <ManualTransaction draft={draft} onChange={setDraft} />
        </View>
        <View style={{ display: tab === "ask" ? "flex" : "none" }}>
          {tab === "ask" ? (
            <TransactionChat
              onReview={(value) => {
                setDraft(value);
                setTab("manual");
              }}
            />
          ) : null}
        </View>
        <View style={{ display: tab === "upload" ? "flex" : "none", gap: 18 }}>
          <Heading>Add from a receipt or statement</Heading>
          <Body>
            Statements, receipts, wallet screenshots, or spreadsheets. Choose
            one file to get started.
          </Body>
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
              : "Preview limit: 3.5 MB per file. Your upload uses Clover’s existing parser and review rules."}
          </Body>
          <Body>
            Your files are protected with encrypted connections and restricted
            access. Clover never sells your data.
          </Body>
          <Body>Password-protected PDFs supported.</Body>
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
      </View>
    </Screen>
  );
}
