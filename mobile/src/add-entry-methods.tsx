import { EntrySelector, EntryTransition, UploadTiles } from "./entry-controls";
import { Text } from "./app-text";
import type { AddFormDraft } from "../../shared/add-form-draft";
import { useState, type ReactNode } from "react";
import { View, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Body, Button, useTheme } from "./ui";
import { TransactionChat } from "./transaction-entry";
import type { EntryFormContext, EntryDraft } from "./adviser-entry-types";
export function AddEntryMethods({
  children,
  kind,
  disabled = false,
  enabled = true,
  context,
  onDraft,
  onReviewForm,
  onUpload,
  connect,
  initialMethod = "manual",
}: {
  children: ReactNode;
  connect?: ReactNode;
  initialMethod?: "manual" | "connect";
  kind: "account" | "investment" | "recurring" | "split" | "trade";
  disabled?: boolean;
  enabled?: boolean;
  context?: EntryFormContext;
  onDraft?: (draft: EntryDraft) => void;
  onReviewForm?: (draft: AddFormDraft) => void;
  onUpload?: () => void;
}) {
  const [tab, setTab] = useState(initialMethod as string),
    [visited, setVisited] = useState(false);
  const { colors } = useTheme();
  if (!enabled) return <>{children}</>;
  return (
    <View style={{ gap: 16 }}>
      <EntrySelector value={tab} items={connect ? ["manual", "ask", "upload", "connect"] : ["manual", "ask", "upload"]} disabled={disabled} onChange={method => { setTab(method); if (method === "ask") setVisited(true); }}/>
      <EntryTransition value={tab}>
      <View style={{ display: tab === "manual" ? "flex" : "none", gap: 16 }}>
        {children}
      </View>
      {tab === "connect" ? connect : null}
      {visited ? (
        <View style={{ display: tab === "ask" ? "flex" : "none", gap: 16 }}>
          <TransactionChat
            context={context}
            onReviewForm={
              onReviewForm
                ? (draft) => {
                    onReviewForm(draft);
                    setTab("manual");
                  }
                : undefined
            }
            page={
              kind === "account"
                ? "accounts"
                : kind === "investment" || kind === "trade"
                  ? "investments"
                  : kind === "recurring"
                    ? "recurring"
                    : "general"
            }
            intro={`Describe the ${kind === "split" ? "bill, people and split" : kind === "recurring" ? "payment, due date and frequency" : kind === "investment" ? "holding or trade" : "account"}. Review the details before saving.`}
            onDraft={
              onDraft
                ? (draft) => {
                    onDraft(draft);
                    setTab("manual");
                  }
                : undefined
            }
            onReview={() => setTab("manual")}
          />
          <Button
            secondary
            title="Continue in Manual"
            onPress={() => setTab("manual")}
          />
        </View>
      ) : null}
      <View style={{ display: tab === "upload" ? "flex" : "none", gap: 16 }}>
        <Body>
          {kind === "split"
            ? "Read a receipt, then review the items, people and split before creating the bill."
            : kind === "recurring"
              ? "Review a bill or statement first. Confirm its repeating schedule in Manual; a single bill never establishes a recurring payment."
              : "Upload a statement and review the account or holding match before confirming."}
        </Body>
        <UploadTiles disabled={disabled} onChoose={source => {
          if (onUpload && source === "file") { onUpload(); setTab("manual"); }
          else router.push({ pathname: "/add-transaction", params: { entry: `upload-${source}`, picker: source } });
        }}/>
        <Body>Your manual draft stays here while you switch methods.</Body>
      </View>
      </EntryTransition>
    </View>
  );
}
