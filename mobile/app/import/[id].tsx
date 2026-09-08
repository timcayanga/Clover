import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Text } from "react-native";
import { useAccess } from "../../src/access";
import { useSession } from "../../src/session";
import type { ImportStatus } from "../../src/types";
import { removeUploadCopy } from "../../src/upload";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Icon,
  Notice,
  Screen,
  colors,
} from "../../src/ui";
export default function ImportDetail() {
  const access = useAccess();
  const { demo, profileId, request, uploads, markUploadStarted } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const selected = uploads[id];
  const { uri, name, mimeType: mime } = selected?.file ?? {};
  const profile = selected?.profileId;
  const [status, setStatus] = useState<ImportStatus | null>(
    demo
      ? {
          importFile: {
            id,
            fileName: "Sample September statement.pdf",
            status: "done",
          },
          visibleImportComplete: true,
          confirmedTransactionsCount: 6,
        }
      : null,
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [started, setStarted] = useState(!uri || Boolean(selected?.started));
  const [revision, setRevision] = useState(0);
  const [resumeBusy, setResumeBusy] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const correctProfile = !profile || profile === profileId;
  const endpoint = `imports/${id}`;
  const scope = `?workspaceId=${encodeURIComponent(profileId)}`;
  const complete = Boolean(
    status?.visibleImportComplete || status?.importFile.status === "done",
  );
  const failed = status?.importFile.status === "failed";
  const visibleRows = status?.confirmedTransactionsCount ?? 0;
  const reviewOnly =
    complete && visibleRows === 0 && (status?.parsedRowsCount ?? 0) > 0;
  useEffect(() => {
    if (demo || !started || !access.active || !correctProfile || complete)
      return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      if (!current || AppState.currentState === "background") return;
      try {
        const next = await request<ImportStatus>(`${endpoint}/status${scope}`);
        if (!current) return;
        setStatus(next);
        failures = 0;
        if (
          next.visibleImportComplete ||
          ["done", "failed"].includes(next.importFile.status)
        )
          return;
      } catch (e) {
        failures++;
        if (current && failures > 2) setError((e as Error).message);
      }
      if (current)
        timer = setTimeout(
          () => void poll(),
          Math.min(15000, 2500 * (failures + 1)),
        );
    };
    void poll();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        clearTimeout(timer);
        void poll();
      }
    });
    return () => {
      current = false;
      clearTimeout(timer);
      listener.remove();
    };
  }, [
    demo,
    started,
    request,
    endpoint,
    scope,
    complete,
    correctProfile,
    access.active,
    revision,
  ]);
  if (!access.active) return null;
  const upload = async () => {
    if (lock.current || !uri || !correctProfile) return;
    lock.current = true;
    markUploadStarted(id);
    setError("");
    setUploading(true);
    setStarted(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri,
        name: name ?? "statement.pdf",
        type: mime ?? "application/pdf",
      } as unknown as Blob);
      if (password) form.append("password", password);
      await request(`${endpoint}/process${scope}`, {
        method: "POST",
        body: form,
      });
      if (alive.current) setRevision((n) => n + 1);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      removeUploadCopy(uri);
      if (alive.current) {
        setUploading(false);
        setPassword("");
      }
      // Never automatically resend an ambiguous upload. Poll the same import ID.
    }
  };
  return (
    <Screen>
      <Icon
        name={complete ? "checkmark-circle-outline" : "document-text-outline"}
        size={48}
      />
      <Heading>
        {complete
          ? demo
            ? "Sample import complete"
            : reviewOnly
              ? "Ready for review"
              : "Your records are ready"
          : failed
            ? "Import needs attention"
            : started
              ? "Organizing your records"
              : "Ready to import"}
      </Heading>
      <Body>
        {status?.importFile.fileName ?? name ?? "Your financial record"}
      </Body>
      {!correctProfile ? (
        <Notice>Return to the original Profile to view this import.</Notice>
      ) : (
        <>
          {!started && (
            <>
              <Field
                label="Statement password (if needed)"
                value={password}
                onChangeText={setPassword}
                maxLength={256}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Body>
                This file will be uploaded to the selected Clover Profile.
                Review the imported results before confirming anything.
              </Body>
              <Button title="Import this file" onPress={() => void upload()} />
            </>
          )}
          {started && !complete && (
            <Card>
              {uploading ? <ActivityIndicator color={colors.teal} /> : null}
              <Body>
                {status?.importFile.processingMessage ??
                  "Clover is receiving and reading your file. You can check this import again without uploading another copy."}
              </Body>
              <Body>
                No estimated percentage is shown before Clover confirms the
                result.
              </Body>
            </Card>
          )}
          {complete && (
            <Card>
              <Text
                style={{ fontSize: 36, fontWeight: "700", color: colors.teal }}
              >
                100%
              </Text>
              <Body>
                {reviewOnly
                  ? `${status?.parsedRowsCount} records parsed. Review and confirm them on the Clover website.`
                  : `${visibleRows} transactions available${demo ? " in this sample" : ""}.`}
              </Body>
              {visibleRows > 0 && (
                <Button
                  title="View transactions"
                  onPress={() => router.replace("/(tabs)/transactions")}
                />
              )}
              <Body>
                Review any flagged records. Final import confirmation remains
                available on the Clover website in this preview.
              </Body>
            </Card>
          )}
          {error ? <Notice>{error}</Notice> : null}
          {started && !complete && !uploading && (
            <>
              <Button
                title="Check status"
                secondary
                onPress={() => {
                  setError("");
                  setRevision((n) => n + 1);
                }}
              />
              <Button
                title={
                  resumeBusy ? "Checking recovery…" : "Resume saved import"
                }
                secondary
                disabled={resumeBusy}
                onPress={() => {
                  setResumeBusy(true);
                  void request(`${endpoint}/resume${scope}`, { method: "POST" })
                    .then(() => setRevision((n) => n + 1))
                    .catch((e: Error) => setError(e.message))
                    .finally(() => setResumeBusy(false));
                }}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
