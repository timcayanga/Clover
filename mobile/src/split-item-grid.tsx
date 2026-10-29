import { ScrollView, View, Pressable, TextInput } from "react-native";
import { Text } from "./app-text";
import { PersonAvatar } from "./person-avatar";
import { Body, Card, Field, money, useTheme } from "./ui";
import { PlanAction } from "./plan-ui";
import {
  splitItemTotals,
  splitMethods,
  type SplitItem,
  type SplitPerson,
} from "../../shared/split-bill-experience";

export function SplitItemGrid({
  people,
  items,
  currency,
  onChange,
  adjustment = 0,
  onAddPerson,
  fixedItems = false,
}: {
  fixedItems?: boolean;
  adjustment?: number;
  onAddPerson?: () => void;
  people: SplitPerson[];
  items: SplitItem[];
  currency: string;
  onChange: (items: SplitItem[]) => void;
}) {
  const { colors } = useTheme();
  const totals = splitItemTotals(people, items, adjustment);
  const update = (index: number, patch: Partial<SplitItem>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const width = Math.max(
    310,
    182 + people.length * 116 + (onAddPerson ? 44 : 0),
  );
  const method = items[0]?.splitMethod ?? "equal";
  return (
    <>
      <Card>
        <Body muted={false}>Choose who shares each item</Body>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={people.length > 2}
        >
          <View style={{ width }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 12,
              }}
            >
              <View style={{ width: 142 }}>
                <Body muted={false}>Item</Body>
              </View>
              {people.map((p) => (
                <View
                  key={p.id}
                  style={{ width: 116, alignItems: "center", gap: 4 }}
                >
                  <PersonAvatar
                    name={p.name}
                    imageUrl={p.avatarUrl}
                    size={32}
                  />
                  <Text
                    numberOfLines={2}
                    style={{
                      color: colors.ink,
                      fontSize: 11,
                      textAlign: "center",
                    }}
                  >
                    {p.name}
                  </Text>
                </View>
              ))}
              {onAddPerson ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add Person"
                  onPress={onAddPerson}
                  style={{ width: 44, padding: 10 }}
                >
                  <Text style={{ color: colors.teal, fontSize: 24 }}>+</Text>
                </Pressable>
              ) : null}
            </View>
            {items.map((item, index) => (
              <View
                key={item.id ?? index}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <View style={{ width: 142, paddingRight: 10, gap: 4 }}>
                  <TextInput
                    accessibilityLabel={`Item ${index + 1}`}
                    editable={!fixedItems}
                    placeholder="Item name"
                    value={item.description}
                    onChangeText={(description) =>
                      update(index, { description })
                    }
                    style={{
                      color: colors.ink,
                      fontFamily: "Poppins-Medium",
                      fontSize: 14,
                      minHeight: 32,
                    }}
                  />
                  <TextInput
                    accessibilityLabel={`Amount ${index + 1}`}
                    editable={!fixedItems}
                    placeholder="0.00"
                    value={item.amount}
                    keyboardType="decimal-pad"
                    onChangeText={(amount) => update(index, { amount })}
                    style={{
                      color: colors.muted,
                      fontFamily: "Poppins-Regular",
                      fontSize: 12,
                      minHeight: 28,
                    }}
                  />
                </View>
                {people.map((p) => {
                  const checked = item.participantIds.includes(p.id);
                  return (
                    <View
                      key={p.id}
                      style={{ width: 116, alignItems: "center", gap: 8 }}
                    >
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${item.description || `Item ${index + 1}`} for ${p.name}`}
                        accessibilityState={{ checked }}
                        onPress={() =>
                          update(index, {
                            participantIds: checked
                              ? item.participantIds.filter((id) => id !== p.id)
                              : [...item.participantIds, p.id],
                            allocations: (item.allocations ?? []).filter(
                              (a) => a.participantId !== p.id,
                            ),
                          })
                        }
                        style={{
                          width: 44,
                          height: 44,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            borderWidth: 1,
                            borderColor: checked ? colors.teal : colors.line,
                            backgroundColor: checked
                              ? colors.teal
                              : colors.white,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: "white" }}>
                            {checked ? "✓" : ""}
                          </Text>
                        </View>
                      </Pressable>
                      {checked &&
                      item.splitMethod &&
                      item.splitMethod !== "equal" ? (
                        <Field
                          label={`${p.name} ${item.splitMethod === "percentage" ? "%" : "amount"}`}
                          value={
                            item.allocations?.find(
                              (a) => a.participantId === p.id,
                            )?.value ?? ""
                          }
                          keyboardType="decimal-pad"
                          onChangeText={(value) =>
                            update(index, {
                              allocations: [
                                ...(item.allocations ?? []).filter(
                                  (a) => a.participantId !== p.id,
                                ),
                                { participantId: p.id, value },
                              ],
                            })
                          }
                        />
                      ) : null}
                    </View>
                  );
                })}
                {!fixedItems ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${index + 1}`}
                    onPress={() =>
                      onChange(items.filter((_, i) => i !== index))
                    }
                    style={{ width: 40, padding: 10 }}
                  >
                    <Text style={{ color: colors.danger, fontSize: 20 }}>
                      ×
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View
              style={{
                flexDirection: "row",
                paddingVertical: 14,
                borderTopWidth: 1,
                borderColor: colors.line,
              }}
            >
              <View style={{ width: 142 }}>
                <Body muted={false}>To pay</Body>
              </View>
              {people.map((p) => (
                <View key={p.id} style={{ width: 116 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={{
                      color: colors.teal,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 12,
                      textAlign: "center",
                    }}
                  >
                    {money(String(totals[p.id] ?? 0), currency)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
        {!fixedItems ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Line Item"
            onPress={() =>
              onChange([
                ...items,
                {
                  id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  description: "",
                  amount: "",
                  participantIds: people.map((p) => p.id),
                  splitMethod: method,
                  allocations: [],
                },
              ])
            }
          >
            <Text style={{ color: colors.teal, paddingVertical: 12 }}>
              + Add Line Item
            </Text>
          </Pressable>
        ) : null}
      </Card>
      <Card>
        <Body muted={false}>Split Method</Body>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {splitMethods.map((m) => (
            <PlanAction
              key={m.value}
              title={`${m.icon} ${m.label}`}
              tone={method === m.value ? "primary" : "view"}
              onPress={() =>
                onChange(
                  items.length
                    ? items.map((item) => ({
                        ...item,
                        splitMethod: m.value,
                        allocations: [],
                      }))
                    : [
                        {
                          id: `new-${Date.now()}`,
                          description: "",
                          amount: "",
                          participantIds: people.map((p) => p.id),
                          splitMethod: m.value,
                          allocations: [],
                        },
                      ],
                )
              }
            />
          ))}
        </View>
      </Card>
    </>
  );
}
