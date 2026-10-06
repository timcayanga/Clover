import { useAdaptiveLayout } from "./adaptive";
import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "./session";
import { Text } from "./app-text";
import { Button, Field, Icon, useTheme } from "./ui";
import { Progress } from "./plan-ui";
import { uploadProgress } from "./offline/upload-progress";
import { getImportStageLabel } from "../../shared/import-stage";
import { refreshScreen } from "./screen-refresh";

/** Upload lifetime belongs to Session, never to the sheet that selected the file. */
export function ImportActivity() {
  const session = useSession();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { dockHeight } = useAdaptiveLayout();
  const path = usePathname();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", event => setKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const shownThisSession = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const [visibleCompletions, setVisibleCompletions] = useState<string[]>([]);
  const pending = useRef(new Set<string>());
  const files = session.queuedFiles.filter(file => file.workspaceId === session.profileId &&
    (file.state !== "done" || pending.current.has(file.id)) && !dismissed.includes(file.id) && (!file.progressNoticeSeen || shownThisSession.current.has(file.id)));
  const file = files.find(file => !["done", "attention", "paused"].includes(file.state)) ?? files.at(-1);
  useEffect(() => {
    if (path.startsWith("/import/") || path === "/onboarding" || file?.state !== "attention" || file.progressNoticeSeen) return;
    // Keep this notice visible now, but do not reopen it on the next launch.
    // The saved import and retry controls remain in upload history.
    shownThisSession.current.add(file.id);
    void session.fileQueue?.acknowledgeProgress(file.id).catch(() => {});
  }, [file?.id, file?.state, file?.progressNoticeSeen, session.fileQueue, path]);
  useEffect(() => {
    // An explicit retry starts a new attempt, including in this mounted session.
    setDismissed(current => {
      const next = current.filter(id => !session.queuedFiles.some(item => item.id === id &&
        ["queued", "sending", "finalizing", "processing"].includes(item.state)));
      return next.length === current.length ? current : next;
    });
  }, [session.queuedFiles]);
  const currentView = useRef({ profileId: session.profileId, path, fileId: file?.id });
  currentView.current = { profileId: session.profileId, path, fileId: file?.id };
  useEffect(() => {
    const ready: string[] = [];
    for (const item of session.queuedFiles) {
      if (item.workspaceId !== session.profileId) continue;
      if (item.state !== "done" && item.state !== "draft") pending.current.add(item.id);
      if (item.state === "done" && pending.current.has(item.id) && !completed.current.has(item.id)) {
        completed.current.add(item.id);
        ready.push(item.id);
      }
    }
    if (!ready.length) return;
    // Clear stale reads and refresh once for the whole settled batch before 100%.
    session.refresh();
    void refreshScreen(path).then(refreshed => {
      const view = currentView.current;
      if (!refreshed && view.profileId === session.profileId && view.path === path && view.fileId && ready.includes(view.fileId)) {
        setActionError("Your import is saved. Pull down to refresh this page.");
      }
      setVisibleCompletions(current => [...current, ...ready]);
    });
  }, [session.queuedFiles, session.profileId, path, session.refresh]);
  useEffect(() => { setActionError(""); setPassword(""); }, [file?.id]);
  const noticeVisible = !path.startsWith("/import/") && path !== "/onboarding";
  const completedFileId = file?.state === "done" && visibleCompletions.includes(file.id) ? file.id : null;
  useEffect(() => {
    if (!noticeVisible || !completedFileId) return;
    // Start at visible 100%, after the current page has refreshed. A new upload
    // or hidden surface cancels this timer without dismissing another import.
    const timer = setTimeout(() => {
      setDismissed(current => [...current, completedFileId]);
      void session.fileQueue?.acknowledgeProgress(completedFileId).catch(() => {});
    }, 10_000);
    return () => clearTimeout(timer);
  }, [completedFileId, noticeVisible, session.fileQueue]);
  if (!file || !noticeVisible) return null;
  const publishing = file.state === "done" && !visibleCompletions.includes(file.id);
  const done = file.state === "done" && !publishing;
  const needsReview = file.state === "attention";
  const waiting = !session.offlineStatus.online;
  const progress = publishing ? 95 : uploadProgress(file);
  const needsPassword = file.needsPassword || (needsReview && /password/i.test(file.error ?? ""));
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true); setActionError("");
    try { await action(); } catch (error) { setActionError((error as Error).message); }
    finally { setBusy(false); }
  };
  const paused = file.state === "paused";
  const active = !done && !publishing && !needsReview && !needsPassword;
  const step = done ? "Import complete" : publishing ? "Updating your page" : needsPassword ? "Statement password needed" : needsReview ? "Import needs attention" : paused ? "Import paused" : waiting ? "Waiting for connection" : file.state === "draft" || file.state === "queued" ? "Preparing file" : file.state === "sending" ? "Uploading file" : getImportStageLabel(file.message || "Reading file", progress);
  const resume = () => run(async () => { await session.fileQueue!.enqueue(file.id); if (!waiting) await session.fileQueue!.flush(); });
  const receiptReview = needsReview && file.processingPhase === "receipt_review_required";
  const review = () => router.push({ pathname: "/import/[id]", params: receiptReview ? { id: file.canonicalId ?? file.id, server: "1", review: "receipt" } : file.originalRetained !== false
    ? { id: file.id } : { id: file.canonicalId ?? file.id, server: "1" } });
  return <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(Math.max(insets.bottom, 8) + dockHeight + 16, keyboardHeight + 16), alignItems: "center" }}>
    <View accessibilityLiveRegion="polite" style={{ width: "100%", maxWidth: 520, padding: 16, gap: 8, borderRadius: 20,
      backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, elevation: 6,
      shadowColor: "#07343d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>{step}</Text>
        <Text accessibilityLabel={`${Math.round(progress)} percent complete`} style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 13, fontVariant: ["tabular-nums"] }}>{Math.round(progress)}%</Text>
        {active ? <Pressable accessibilityRole="button" accessibilityLabel={paused ? "Resume import" : "Pause import"}
          accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void (paused ? resume() : run(() => session.fileQueue!.pause(file.id)))}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busy ? 0.45 : 1 }}>
          <Icon line name={paused ? "play-outline" : "pause-outline"} size={20} color={colors.ink}/>
        </Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={active ? "Cancel import" : "Dismiss import progress"}
          accessibilityState={{ disabled: busy }} disabled={busy}
          onPress={() => {
            if (active) { void run(() => session.fileQueue!.cancel(file.id)); return; }
            setDismissed(value => [...value, file.id]);
            void session.fileQueue?.acknowledgeProgress(file.id).catch(() => {});
          }}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: busy ? 0.45 : 1 }}><Icon line name="close" size={20} color={colors.ink}/></Pressable>
      </View>
      <Progress value={progress}/>
      {actionError || (needsReview && file.error) ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12 }}>{actionError || file.error}</Text> : null}
      {needsPassword ? <Field label="Statement password" value={password} onChangeText={setPassword}
        secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={256} /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {needsPassword ? <Button title={busy ? "Unlocking…" : "Unlock and continue"} disabled={busy || waiting || !password.length}
          onPress={() => void run(async () => {
            const enteredPassword = password;
            setPassword(""); Keyboard.dismiss();
            await session.fileQueue!.enqueue(file.id, enteredPassword);
            await session.fileQueue!.flush();
          })} /> : null}
        {needsReview && !needsPassword ? <Button secondary title={receiptReview ? "Review receipt" : "Review"} onPress={review}/> : null}
        {!needsPassword && ((needsReview && file.originalRetained !== false)) ?
          <Button secondary title="Resume upload" disabled={busy} onPress={() => void run(async () => {
            await session.fileQueue!.enqueue(file.id);
            if (!waiting) await session.fileQueue!.flush();
          })}/> : null}
        {!needsPassword && needsReview && file.originalRetained === false && file.canResume ?
          <Button secondary title="Retry reading" disabled={busy || waiting} onPress={() => void run(async () => {
            await session.request(`imports/${file.canonicalId ?? file.id}/resume?workspaceId=${encodeURIComponent(file.workspaceId)}`, { method: "POST" });
            await session.fileQueue!.enqueue(file.id);
            await session.fileQueue!.flush();
          })}/> : null}
      </View>
    </View>
  </View>;
}
