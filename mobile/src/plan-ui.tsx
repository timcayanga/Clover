import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSession } from "./session";
import { Icon, useTheme } from "./ui";
export function PlanHeader({
  title,
  back,
  add,
  trailing,
}: {
  title: string;
  back?: () => void;
  add?: () => void;
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  const adviser = () => router.push("/(tabs)/adviser");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 48,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={back ? "Go back" : "Adviser"}
        onPress={back ?? adviser}
        style={{ padding: 8 }}
      >
        <Icon name={back ? "chevron-back" : "chatbubble-ellipses-outline"} />
      </Pressable>
      <Text
        accessibilityRole="header"
        style={{
          position: "absolute",
          left: 76,
          right: 76,
          textAlign: "center",
          fontFamily: "Poppins-SemiBold",
          fontSize: 18,
          color: colors.ink,
        }}
      >
        {title}
      </Text>
      {trailing ?? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={back ? "Adviser" : add ? `Add ${title}` : "Home"}
          onPress={
            back ? adviser : (add ?? (() => router.push("/(tabs)/index")))
          }
          style={{ padding: 8 }}
        >
          <Icon
            name={
              back
                ? "chatbubble-ellipses-outline"
                : add
                  ? "add-circle"
                  : "home-outline"
            }
          />
        </Pressable>
      )}
    </View>
  );
}
export function PlanTabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        flexWrap: items.length > 4 ? "wrap" : "nowrap",
        gap: 4,
      }}
    >
      {items.map((item, index) => (
        <Pressable
          key={item}
          accessibilityRole="tab"
          accessibilityLabel={item}
          aria-label={item}
          accessibilityState={{ selected: item === value }}
          aria-selected={item === value}
          onPress={() => onChange(item)}
          style={{
            flexGrow: 1,
            flexBasis: items.length > 4 ? "30%" : 0,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: item === value ? colors.bright : colors.line,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon
            name={
              index === 0
                ? "grid-outline"
                : /history|activity/i.test(item)
                  ? "time-outline"
                  : /transaction|payment/i.test(item)
                    ? "swap-horizontal-outline"
                    : /people|group/i.test(item)
                      ? "people-outline"
                      : /roadmap/i.test(item)
                        ? "map-outline"
                        : /goal/i.test(item)
                          ? "flag-outline"
                          : /planner|budget/i.test(item)
                            ? "calculator-outline"
                            : /market/i.test(item)
                              ? "globe-outline"
                              : /analysis|insight/i.test(item)
                                ? "pie-chart-outline"
                                : /portfolio|item|bill/i.test(item)
                                  ? "list-outline"
                                  : "stats-chart-outline"
            }
            size={16}
          />
          <Text style={{ fontSize: 11, color: colors.teal }}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function PlanAction({
  title,
  onPress,
  tone = "view",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  tone?: "view" | "edit" | "ask" | "delete" | "primary";
  disabled?: boolean;
}) {
  const { dark } = useTheme();
  const palette = {
    view: dark ? ["#193b58", "#b8d9ff"] : ["#e9f2ff", "#1e5aa6"],
    edit: dark ? ["#493718", "#ffd68a"] : ["#fff1d6", "#895000"],
    ask: dark ? ["#36264f", "#d8bdff"] : ["#f0eaff", "#6741a5"],
    delete: dark ? ["#49292d", "#ffb6ba"] : ["#fdeaea", "#b83a3a"],
    primary: ["#008fa3", "#fff"],
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: palette[0],
        borderRadius: 24,
        overflow: "hidden",
        alignItems: "stretch",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <LinearGradient
        colors={
          tone === "primary" ? ["#03a8c0", "#2ccfca"] : [palette[0], palette[0]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 13, alignItems: "center" }}
      >
        <Text style={{ color: palette[1], fontWeight: "600" }}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}
export function Progress({ value }: { value: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.max(0, Math.min(100, value)),
        text: `${Math.round(value)}%`,
      }}
      style={{
        height: 10,
        borderRadius: 5,
        backgroundColor: colors.line,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 10,
          width: `${Math.max(0, Math.min(100, value))}%`,
          backgroundColor: colors.bright,
        }}
      />
    </View>
  );
}
export function usePlanData<T>(path: string, sample: T) {
  const session = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError("");
      setData(null);
      void (
        session.demo
          ? Promise.resolve(sample)
          : session.request<T>(
              `${path}${path.includes("?") ? "&" : "?"}workspaceId=${encodeURIComponent(session.profileId)}`,
            )
      )
        .then((result) => {
          if (active) setData(result);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [
      session.demo,
      session.profileId,
      session.request,
      path,
      sample,
      version,
    ]),
  );
  return { data, setData, error, reload: () => setVersion((v) => v + 1) };
}
