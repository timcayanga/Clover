import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Platform, View } from "react-native";
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
} from "../../src/ui";
export default function Add() {
  const session = useSession();
  const [tab, setTab] = useState("manual");
  const [draft, setDraft] = useState(emptyTransaction);
  const { entry } = useLocalSearchParams<{ entry?: string }>();
  useEffect(() => {
    setTab(entry?.startsWith("upload-") ? "upload" : "manual");
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
  return (
    <Screen>
      <Heading>Add transaction</Heading>
      <Choices
        options={[
          { value: "manual", label: "Manual" },
          { value: "ask", label: "Ask Clover" },
          { value: "upload", label: "Upload" },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={{ display: tab === "manual" ? "flex" : "none" }}>
        <ManualTransaction draft={draft} onChange={setDraft} />
      </View>
      <View style={{ display: tab === "ask" ? "flex" : "none" }}>
        <TransactionChat
          onReview={(value) => {
            setDraft(value);
            setTab(entry?.startsWith("upload-") ? "upload" : "manual");
          }}
        />
      </View>
      <View style={{ display: tab === "upload" ? "flex" : "none", gap: 18 }}>
        <Heading>Add from a receipt or statement</Heading>
        <Body>
          Statements, receipts, wallet screenshots, or spreadsheets. Choose one
          file to get started.
        </Body>
        <Card>
          <Icon name="documents-outline" size={40} />
          <Button
            title="Upload files"
            disabled={busy}
            onPress={() => void choose("file")}
          />
          <Button
            title="Choose photos"
            secondary
            disabled={busy}
            onPress={() => void choose("library")}
          />
          <Button
            title="Scan receipt"
            secondary
            disabled={busy}
            onPress={() => void choose("camera")}
          />
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        <Body>
          {session.demo
            ? "Sample mode shows a completed sample import. It never opens or uploads your files."
            : "Preview limit: 3.5 MB per file. Your upload uses Clover’s existing parser and review rules."}
        </Body>
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
    </Screen>
  );
}
