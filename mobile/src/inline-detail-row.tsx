import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Button, Field, Icon, Notice, useTheme } from "./ui";
import { ChoiceField } from "./transaction-entry";
export function InlineDetailRow({
  label,
  value,
  displayValue,
  icon,
  options,
  numeric,
  onSave,
}: {
  label: string;
  value: string;
  displayValue?: string;
  icon?: ReactNode;
  options?: { value: string; label: string }[];
  numeric?: boolean;
  onSave: (value: string) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Edit ${label}`}
        disabled={busy}
        onPress={() => {
          setDraft(value);
          setError("");
          setEditing(!editing);
        }}
        style={{
          minHeight: 48,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        {icon}
        <Text style={{ color: colors.muted, fontSize: 12, width: 70 }}>
          {label}
        </Text>
        <Text
          style={{
            flex: 1,
            color: colors.ink,
            fontSize: 13,
            textAlign: "right",
          }}
        >
          {displayValue ??
            options?.find((option) => option.value === value)?.label ??
            (value || "Not set")}
        </Text>
        <Icon line name="create-outline" size={14} />
      </Pressable>
      {editing ? (
        <View style={{ padding: 12, gap: 10 }}>
          {options ? (
            <ChoiceField
              label={label}
              value={draft}
              options={options}
              onChange={setDraft}
            />
          ) : (
            <Field
              label={label}
              value={draft}
              onChangeText={setDraft}
              keyboardType={numeric ? "decimal-pad" : "default"}
              multiline={label === "Notes"}
            />
          )}
          {error ? <Notice>{error}</Notice> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title={busy ? "Saving…" : "Save"}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                setError("");
                void onSave(draft)
                  .then(() => setEditing(false))
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            />
            <Button
              secondary
              title="Cancel"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
