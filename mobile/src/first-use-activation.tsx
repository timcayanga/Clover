import { createScreenDataLoader, registerScreenRefresh } from "./screen-refresh";
import { telemetry } from "../../shared/analytics";
import { useCallback, useEffect, useRef, useState, type ComponentRef, type RefObject } from "react";
import { router, useFocusEffect } from "expo-router";
import { AppState, View, type ScrollViewInstance } from "react-native";
import type { FirstUseActivation as Snapshot } from "../../shared/first-use-activation";
import { useSession } from "./session";
import { Body, Button, Card, Heading, money } from "./ui";

export function FirstUseActivation({ hidden = false, viewport, visibilityCheck }: {
  hidden?: boolean;
  viewport: RefObject<ScrollViewInstance | null>;
  visibilityCheck: RefObject<(() => void) | null>;
}) {
  const session = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dismissError, setDismissError] = useState("");
  const [acknowledgedId, setAcknowledgedId] = useState<string | null>(null);
  const reportedResult = useRef<string | null>(null);
  const focused = useRef(false);
  const resultView = useRef<ComponentRef<typeof View> | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    focused.current = true;
    if (session.demo || !session.profileId) return () => { focused.current = false; active = false; };
    const refresh = createScreenDataLoader({
      load: () => session.request<{ activation: Snapshot }>(`activation?workspaceId=${encodeURIComponent(session.profileId)}`),
      active: () => active,
      error: () => {},
      apply: data => {
        setSnapshot(data.activation);
        if (data.activation.state === "result" && data.activation.transaction) {
          void session.request(`activation?workspaceId=${encodeURIComponent(session.profileId)}`, { method: "POST", body: JSON.stringify({ action: "view", transactionId: data.activation.transaction.id }) }).catch(() => {});
        }
      },
    });
    void refresh().then(() => visibilityCheck.current?.());
    const unregister = registerScreenRefresh("/", refresh);
    return () => { focused.current = false; active = false; unregister(); };
  }, [session.demo, session.profileId, session.request, visibilityCheck]));
  const state = !session.demo && snapshot?.workspaceId === session.profileId &&
    (!snapshot.transaction || snapshot.transaction.id !== acknowledgedId) ? snapshot.state : "hidden";
  useEffect(() => {
    if (state !== "hidden") telemetry("activation_prompt_viewed", { activation_state: state, surface: "home" });
  }, [state, session.profileId]);
  const resultId = state === "result" ? snapshot?.transaction?.id : undefined;
  useEffect(() => {
    if (!resultId || !session.profileId) return;
    const profileId = session.profileId;
    const key = `${profileId}:${resultId}`;
    let active = true;
    let frame: number | null = null;
    const foreground = () => focused.current && AppState.currentState === "active";
    const check = () => {
      if (!active || !foreground() || reportedResult.current === key || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const view = resultView.current;
        const scroll = viewport.current;
        if (!view || !scroll || !foreground()) return;
        scroll.measureInWindow((x, y, width, height) => {
          view.measureInWindow((left, top, rowWidth, rowHeight) => {
            if (!active || !foreground() || resultView.current !== view || reportedResult.current === key) return;
            const visibleHeight = Math.min(top + rowHeight, y + height) - Math.max(top, y);
            if (width <= 0 || rowWidth <= 0 || rowHeight <= 0 || visibleHeight < rowHeight / 2 ||
                left >= x + width || left + rowWidth <= x) return;
            reportedResult.current = key;
            void session.request(`activation?workspaceId=${encodeURIComponent(profileId)}`, {
              method: "POST",
              body: JSON.stringify({ action: "displayed", transactionId: resultId }),
            }).catch(() => {
              if (reportedResult.current === key) reportedResult.current = null;
            });
          });
        });
      });
    };
    visibilityCheck.current = check;
    check();
    const subscription = AppState.addEventListener("change", check);
    return () => {
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
      subscription.remove();
      if (visibilityCheck.current === check) visibilityCheck.current = null;
    };
  }, [resultId, session.profileId, session.request, viewport, visibilityCheck]);
  if (!snapshot || state === "hidden") return null;
  const transaction = snapshot.transaction;
  const selectMethod = (method: "manual" | "camera" | "file") => {
    telemetry("activation_method_selected", { method, surface: "home" });
    if (method === "manual") router.push("/add-transaction");
    else router.push({ pathname: "/(tabs)/add", params: { entry: `upload-${method}`, picker: method } });
  };
  return <Card>
    {snapshot.state === "start" ? <>
      <Heading>Start with one transaction</Heading>
      <Body>Record something you spent or earned. You can start with Cash and add an account later.</Body>
      <Button title="Add a transaction" onPress={() => selectMethod("manual")} />
      <Button secondary title="Scan a receipt" onPress={() => selectMethod("camera")} />
      <Button secondary title="Choose a receipt or statement" onPress={() => selectMethod("file")} />
    </> : transaction ? <>
      <View ref={resultView} collapsable={false} onLayout={() => visibilityCheck.current?.()}>
        <Heading>Your first transaction is in Clover</Heading>
        <Body>{transaction.name} · {hidden ? "******" : money(transaction.amount, transaction.currency)}</Body>
      </View>
      <Body>{transaction.type === "transfer" ? "Recorded as a transfer, separate from spending." : transaction.type === "income" ? "Your income is now recorded." : "Your spending is now recorded."}{transaction.category ? ` Category: ${transaction.category}.` : " You can choose a category in Transactions."}{transaction.needsReview ? " Check the suggested details before relying on them." : ""}</Body>
      <View style={{ gap: 10 }}><Button title="View your transaction" onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: transaction.id } })} />
        <Button secondary title="Got it" onPress={() => {
          const profile = session.profileId;
          void session.request(`activation?workspaceId=${encodeURIComponent(profile)}`, { method: "POST", body: JSON.stringify({ action: "acknowledge", transactionId: transaction.id }) }).then(() => setAcknowledgedId(transaction.id)).catch(() => setDismissError("Could not dismiss this yet. Please try again."));
        }} /></View>
      <Body>Home and Reports use the transaction date, so an older receipt appears in its original period.</Body>
    </> : null}
    {dismissError ? <View accessibilityLiveRegion="polite"><Body>{dismissError}</Body></View> : null}
  </Card>;
}
