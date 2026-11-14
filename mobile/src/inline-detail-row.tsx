import type { CorrectionScope } from "../../shared/category-correction";
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
  futureCategoryMatch,
}: {
  label: string;
  value: string;
  displayValue?: string;
  icon?: ReactNode;
  options?: { value: string; label: string }[];
  numeric?: boolean;
  futureCategoryMatch?: string;
  onSave: (value: string, scope: CorrectionScope) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(value),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState<CorrectionScope>("transaction");
  const showScope = Boolean(futureCategoryMatch && draft && draft !== value);
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
          setScope("transaction");
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
              onChange={value => { setDraft(value); setScope("transaction"); }}
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
          {showScope ? <ChoiceField label="Apply category change" value={scope}
            options={[{ value: "transaction", label: "This transaction only" }, { value: "similar", label: "Apply to similar future transactions" }]}
            onChange={value => setScope(value === "similar" ? "similar" : "transaction")} /> : null}
          {showScope ? <Text style={{ color: colors.muted }}>Matches {futureCategoryMatch} in this Profile.</Text> : null}
          {error ? <Notice>{error}</Notice> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              title={busy ? "Saving…" : "Save"}
              disabled={busy}
              onPress={() => {
                setBusy(true);
                setError("");
                void onSave(draft, showScope ? scope : "transaction")
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
