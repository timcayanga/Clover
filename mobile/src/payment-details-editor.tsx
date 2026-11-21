import { displayPhoto } from "./prepare-display-photo";
import { useState } from "react";
import { Image, Switch, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Body, Card, Notice, useTheme } from "./ui";
import { PlanAction } from "./plan-ui";
import { useSession } from "./session";
import { removeUploadCopy } from "./upload";

type Payment = {
  id: string;
  label: string;
  provider: string;
  currency: string;
  accountName: string | null;
  accountNumber: string | null;
  qrImageData: string | null;
  isDefault: boolean;
};
const fields = [
  ["label", "Name"],
  ["provider", "Bank or Provider"],
  ["currency", "Currency"],
  ["accountName", "Account Name"],
  ["accountNumber", "Account Number"],
] as const;
export function PaymentDetailsEditor({
  profile,
  onSaved,
}: {
  profile: Payment;
  onSaved: (p: Payment) => void;
}) {
  const [draft, setDraft] = useState(profile),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = useSession(),
    { colors } = useTheme();
  async function choose() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      try {
        const qrImageData = await displayPhoto(asset, 1600, 1_500_000);
        setDraft(d => ({ ...d, qrImageData }));
        setError("");
      } finally {
        removeUploadCopy(asset.uri);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load QR image.");
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const next = {
        ...draft,
        currency: draft.currency.trim().toUpperCase(),
        label: draft.label.trim(),
        provider: draft.provider.trim(),
      };
      const patch = Object.fromEntries(
        Object.entries(next).filter(
          ([key, value]) =>
            key !== "id" && profile[key as keyof Payment] !== value,
        ),
      );
      await session.request(
        `split-bill-payment-profiles/${profile.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      );
      setDraft(next);
      onSaved(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save payment details.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      {fields.map(([key, label]) => (
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderBottomWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={{ flex: 1 }}>
            <Body>{label}</Body>
          </View>
          <TextInput
            accessibilityLabel={label}
            editable={!busy}
            value={draft[key] ?? ""}
            onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))}
            style={{ flex: 1.4, minHeight: 48, color: colors.ink }}
          />
        </View>
      ))}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Body>Default</Body>
        <Switch
          disabled={busy}
          value={draft.isDefault}
          onValueChange={(v) => setDraft((d) => ({ ...d, isDefault: v }))}
        />
      </View>
      <PlanAction
        disabled={busy}
        title={draft.qrImageData ? "Replace QR Image" : "Add QR Image"}
        onPress={choose}
      />
      {draft.qrImageData ? (
        <>
          <PlanAction
            title="Remove QR Image"
            disabled={busy}
            onPress={() => setDraft((d) => ({ ...d, qrImageData: null }))}
          />
          <Image
            accessibilityLabel="Payment QR code"
            source={{ uri: draft.qrImageData }}
            resizeMode="contain"
            style={{ width: 200, height: 200, alignSelf: "center" }}
          />
        </>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {JSON.stringify(draft) !== JSON.stringify(profile) ? (
        <PlanAction
          title="Save Changes"
          tone="primary"
          disabled={busy || session.demo}
          onPress={save}
        />
      ) : null}
    </Card>
  );
}
