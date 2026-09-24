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
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: "row",
          padding: 4,
          borderRadius: 999,
          backgroundColor: colors.pale,
        }}
      >
        {(connect ? ["manual", "ask", "upload", "connect"] : ["manual", "ask", "upload"]).map((method) => (
          <Pressable
            key={method}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === method, disabled }}
            disabled={disabled}
            onPress={() => {
              setTab(method);
              if (method === "ask") setVisited(true);
            }}
            style={{ flex: 1, borderRadius: 999, overflow: "hidden" }}
          >
            <LinearGradient
              colors={
                tab === method
                  ? ["#03a8c0", "#34d3d0"]
                  : ["transparent", "transparent"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                height: 40,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Poppins-Medium",
                  fontSize: connect ? 11 : 15,
                  color: tab === method ? "white" : colors.ink,
                }}
              >
                {method === "manual"
                  ? "Manual"
                  : method === "ask"
                    ? "Ask Clover"
                    : method === "connect" ? "Connect" : "Upload"}
              </Text>
            </LinearGradient>
          </Pressable>
        ))}
      </View>
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
        <Button
          title={kind === "split" ? "Choose receipt" : "Choose files"}
          disabled={disabled}
          onPress={() => {
            if (onUpload) {
              onUpload();
              setTab("manual");
            } else
              router.push({
                pathname: "/(tabs)/add",
                params: { entry: "upload-file", picker: "file" },
              });
          }}
        />
        {kind !== "split" ? (
          <>
            <Button
              secondary
              title="Take photo"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/add",
                  params: { entry: "upload-camera", picker: "camera" },
                })
              }
            />
            <Button
              secondary
              title="Photo library"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/add",
                  params: { entry: "upload-library", picker: "library" },
                })
              }
            />
          </>
        ) : null}
        <Body>Your manual draft stays here while you switch methods.</Body>
      </View>
    </View>
  );
}
