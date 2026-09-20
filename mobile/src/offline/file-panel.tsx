import { Progress } from "../plan-ui";
import * as Crypto from "expo-crypto";
import {
  explainLocalFile,
  localCapability,
  refreshLocalAllowance,
} from "./local-ai";
import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { Body, Button, Card, Field, Heading, Notice, Screen } from "../ui";
import { useSession } from "../session";
import type { QueuedFile } from "./file-queue";
import { previewFile } from "./file-preview";
export function OfflineFilePanel({ file }: { file: QueuedFile }) {
  const session = useSession(),
    queue = session.fileQueue!;
  const [suggestions, setSuggestions] = useState("");
  const [password, setPassword] = useState(""),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(()=>{
    if(file.state==="processing" && session.offlineStatus.online)router.replace({pathname:"/import/[id]",params:{id:file.canonicalId??file.id,server:"1"}});
  },[file.state,file.id,file.canonicalId,session.offlineStatus.online]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const original = file.originalRetained !== false && ["draft", "queued", "sending", "paused", "finalizing", "attention"].includes(
    file.state,
  );
  const canUpload = original && ["draft", "attention", "paused"].includes(file.state);
  return (
    <Screen>
      <Card>
        <Heading>{file.name}</Heading>
        <Body>
          {session.data?.profiles.find((p) => p.id === file.workspaceId)
            ?.name ?? "Unavailable Profile"}
        </Body>
        <Body>
          {
            {
              draft: "Saved on this device",
              queued: "Waiting to upload when connected",
              sending: "Uploading file",
              paused: "Upload paused",
              finalizing: "Checking file and starting import",
              processing: "Original received by Clover",
              done: "Import complete",
              attention: "Needs attention",
            }[file.state]
          }
        </Body>
        <Body>
          {original
            ? "The original file stays encrypted on this device until Clover acknowledges receiving it. Local previews do not confirm transactions."
            : "The source is saved in Clover. Its temporary device copy has been removed."}
        </Body>
      </Card>
      {["sending", "paused", "queued", "finalizing"].includes(file.state) ? <Card>
        <Body>{Math.min(100,Math.round((file.sentBytes??0)/file.size*100))}% uploaded</Body>
        <Progress value={(file.sentBytes??0)/file.size*100}/>
        {["sending","queued"].includes(file.state) ? <Button title="Pause upload" secondary onPress={()=>void run(()=>queue.pause(file.id))}/> : null}
        {file.state==="finalizing" ? <Body>The upload is complete. Clover is checking your file. You can leave this screen and return to its status.</Body> : <Button title="Cancel upload" secondary onPress={()=>Alert.alert("Cancel upload?","This removes the temporary upload and device copy. Your original file is preserved.",[{text:"Keep upload",style:"cancel"},{text:"Cancel upload",style:"destructive",onPress:()=>void run(async()=>{await queue.cancel(file.id);router.replace("/offline");})}])}/>}
      </Card> : null}
      {file.error ? <Notice>{file.error}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {original ? (
        <Button
          title={busy ? "Reading…" : "Preview on this device"}
          secondary
          disabled={busy}
          onPress={() =>
            void run(async () =>
              setPreview(await previewFile(file, await queue.bytes(file))),
            )
          }
        />
      ) : null}
      {preview ? (
        <Card>
          <Heading>Local preview</Heading>
          <Body>{preview}</Body>
          <Button
            title="Explain on this device"
            secondary
            disabled={busy || !session.offline}
            onPress={() =>
              void run(async () => {
                const engine = session.offline!;
                if ((await localCapability()).model !== "available")
                  throw new Error(
                    "The on-device language model is unavailable. The original preview remains available.",
                  );
                if (session.offlineStatus.online)
                  await refreshLocalAllowance(engine, file.workspaceId, () =>
                    Crypto.randomUUID(),
                  );
                setSuggestions(
                  await explainLocalFile(engine, file.workspaceId, preview),
                );
              })
            }
          />
          {suggestions ? (
            <>
              <Heading>AI suggestions · Needs review</Heading>
              <Body>{suggestions}</Body>
              <Body>
                Confidence is an AI estimate. Check every suggestion against the
                original. No transactions were created or confirmed.
              </Body>
            </>
          ) : null}
        </Card>
      ) : null}
      {canUpload ? (
        <Card>
          <Field
            label="Statement password (if needed)"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
          />
          <Body>
            Queue this original file for Clover’s full parser and enrichment
            when connected. Review flagged results before confirming.
          </Body>
          <Button
            title={
              session.offlineStatus.online
                ? (file.state === "paused" ? "Resume upload" : "Upload original")
                : "Upload when connected"
            }
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await queue.enqueue(file.id, password);
                setPassword("");
                if (session.offlineStatus.online) void queue.flush().catch(e=>setError(e.message));
              })
            }
          />
        </Card>
      ) : null}
      {!canUpload && file.state !== "done" ? (
        <Button
          title="Check sync status"
          disabled={busy || !session.offlineStatus.online}
          onPress={() => void run(() => queue.flush())}
        />
      ) : null}
      {["processing", "done", "attention"].includes(file.state) ? (
        <Button
          title="Open saved import"
          secondary
          disabled={!session.offlineStatus.online}
          onPress={() =>
            router.push({
              pathname: "/import/[id]",
              params: { id: file.canonicalId ?? file.id, server: "1" },
            })
          }
        />
      ) : null}
      {!["queued","sending","paused","finalizing"].includes(file.state) ? <Button
        title={
          file.state === "done"
            ? "Remove from device list"
            : "Remove queued file"
        }
        secondary
        disabled={busy}
        onPress={() =>
          Alert.alert(
            "Remove this device copy?",
            "This removes the local file and its pending upload. Any import already received by Clover remains saved.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Remove",
                style: "destructive",
                onPress: () =>
                  void run(async () => {
                    if(original) await queue.cancel(file.id);
                    else await queue.remove(file.id);
                    router.replace("/offline");
                  }),
              },
            ],
          )
        }
      /> : null}
    </Screen>
  );
}
