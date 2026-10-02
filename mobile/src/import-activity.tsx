import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "./session";
import { Text } from "./app-text";
import { Button, Icon, useTheme } from "./ui";
import { Progress } from "./plan-ui";
import { refreshScreen } from "./screen-refresh";

/** Upload lifetime belongs to Session, never to the sheet that selected the file. */
export function ImportActivity() {
  const session = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const completed = useRef(new Set<string>());
  const pending = useRef(new Set<string>());
  const files = session.queuedFiles.filter(file => file.workspaceId === session.profileId &&
    file.state !== "draft" && (file.state !== "done" || pending.current.has(file.id)) && !dismissed.includes(file.id));
  const file = files.find(file => !["done", "attention", "paused"].includes(file.state)) ?? files.at(-1);
  useEffect(() => {
    for (const item of session.queuedFiles) {
      if (item.state !== "done" && item.state !== "draft") pending.current.add(item.id);
      if (item.state === "done" && pending.current.has(item.id) && !completed.current.has(item.id)) {
        completed.current.add(item.id);
        session.refresh();
        void refreshScreen(path);
      }
    }
  }, [session.queuedFiles, path, session.refresh]);
  useEffect(() => { setActionError(""); }, [file?.id]);
  if (!file || path.startsWith("/import/") || path === "/onboarding") return null;
  const done = file.state === "done";
  const needsReview = file.state === "attention";
  const waiting = !session.offlineStatus.online;
  const progress = done ? 100 : Math.min(95, Math.max(file.progress ?? 0,
    file.state === "processing" ? 45 : Math.round((file.sentBytes ?? 0) / file.size * 40)));
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await action(); } catch (error) { setActionError((error as Error).message); }
    finally { setBusy(false); }
  };
  const review = () => router.push({ pathname: "/import/[id]", params: file.originalRetained !== false
    ? { id: file.id } : { id: file.canonicalId ?? file.id, server: "1" } });
  return <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 8) + 88, alignItems: "center" }}>
    <View accessibilityLiveRegion="polite" style={{ width: "100%", maxWidth: 520, padding: 16, gap: 8, borderRadius: 20,
      backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, elevation: 6,
      shadowColor: "#07343d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: colors.ink, fontFamily: "Poppins-SemiBold" }}>
          {done ? "Ready to review" : needsReview ? "Import needs attention" : waiting ? "Upload saved offline" : file.state === "paused" ? "Upload paused" : "Importing your file"}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss import progress" onPress={() => setDismissed(value => [...value, file.id])} style={{ padding: 8 }}><Icon line name="close" size={20}/></Pressable>
      </View>
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{file.name}{files.length > 1 ? ` · ${files.length} imports` : ""}</Text>
      <Progress value={progress}/>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{actionError || file.error ||
        (waiting ? "Your file will upload when you reconnect." : file.message || (done ? "Review the imported details." : `${progress}% · You can keep using Clover.`))}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {done || needsReview ? <Button secondary title="Review" onPress={review}/> : null}
        {file.state === "paused" || (needsReview && file.originalRetained !== false) ?
          <Button secondary title="Resume upload" disabled={busy} onPress={() => void run(async () => {
            await session.fileQueue!.enqueue(file.id);
            if (!waiting) await session.fileQueue!.flush();
          })}/> : null}
        {needsReview && file.originalRetained === false && file.canResume ?
          <Button secondary title="Retry reading" disabled={busy || waiting} onPress={() => void run(async () => {
            await session.request(`imports/${file.canonicalId ?? file.id}/resume?workspaceId=${encodeURIComponent(file.workspaceId)}`, { method: "POST" });
            await session.fileQueue!.enqueue(file.id);
            await session.fileQueue!.flush();
          })}/> : null}
      </View>
    </View>
  </View>;
}
