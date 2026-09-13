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
  const { dark, colors } = useTheme();
  const palette = {
    view: [colors.white, colors.ink],
    edit: [colors.white, colors.ink],
    ask: ["#008fa3", "#fff"],
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
        borderWidth: 1,
        borderColor:
          tone === "view" || tone === "edit" ? colors.line : "transparent",
        borderRadius: 24,
        overflow: "hidden",
        alignItems: "stretch",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <LinearGradient
        colors={
          tone === "primary" || tone === "ask"
            ? ["#03a8c0", "#2ccfca"]
            : [palette[0], palette[0]]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 13, alignItems: "center" }}
      >
        <Text
          style={{
            color: palette[1],
            fontFamily: "Poppins-Medium",
            fontSize: 15,
          }}
        >
          {title}
        </Text>
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

export function SummaryCard({
  title,
  value,
  detail,
  color,
}: {
  title: string;
  value: string;
  detail?: string;
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.white,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 8,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 16,
          lineHeight: 24,
          textAlign: "center",
          color: colors.muted,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 22,
          lineHeight: 33,
          textAlign: "center",
          color: color ?? colors.ink,
        }}
        adjustsFontSizeToFit
        numberOfLines={1}
        minimumFontScale={0.6}
      >
        {value}
      </Text>
      {detail ? (
        <Text
          style={{
            fontFamily: "Poppins-Regular",
            fontSize: 13,
            lineHeight: 20,
            textAlign: "center",
            color: colors.muted,
          }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
