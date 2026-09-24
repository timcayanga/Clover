import { Text } from "./app-text";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback, type ComponentProps, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSession } from "./session";
import { AppHeader, AddNavigationMark, Icon, useTheme } from "./ui";
/** Square at normal text size, but grows rather than clipping larger text. */
export function PlanDirectoryCard({
  children,
  color,
}: {
  children: ReactNode;
  color: string;
}) {
  const { dark, colors } = useTheme();
  const [width, setWidth] = useState(0);
  const tint = /^#[0-9a-f]{6}$/i.test(color) ? color : "#35b875";
  return (
    <LinearGradient
      colors={dark ? [colors.white, `${tint}24`] : [`${tint}38`, `${tint}0a`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        minHeight: width,
        padding: 20,
        gap: 16,
        justifyContent: "space-between",
        borderRadius: 24,
        borderWidth: 1,
        borderColor: `${tint}88`,
      }}
    >
      {children}
    </LinearGradient>
  );
}
export function PlanAmount({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: "Poppins-SemiBold",
        fontSize: 24,
        color: colors.ink,
      }}
    >
      {children}
    </Text>
  );
}
export function PlanHeader({
  title,
  back,
  add,
  trailing,
  stackedTitle = false,
  titleInset = 76,
}: {
  title: string;
  back?: () => void;
  add?: () => void;
  trailing?: ReactNode;
  stackedTitle?: boolean;
  titleInset?: number;
}) {
  return (
    <View style={{ marginHorizontal: -16, marginTop: -16 }}>
      <AppHeader
        title={title}
        onClose={back}
        trailing={
          trailing ??
          (back ? undefined : add ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Add ${title}`}
              onPress={add}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AddNavigationMark size={36} />
            </Pressable>
          ) : undefined)
        }
      />
    </View>
  );
}

const tabIcons: Record<string, ComponentProps<typeof Icon>["name"]> = {
  Overview: "apps-outline", Bills: "receipt-outline", Groups: "people-outline",
  People: "person-outline", Payments: "card-outline", Spending: "bar-chart-outline",
  Trends: "trending-up-outline", Insights: "sparkles-outline", Portfolio: "briefcase-outline",
  Planner: "calendar-outline", Markets: "trending-up-outline", Analysis: "analytics-outline",
  "Planned Payments": "calendar-outline", "Debt & Loans": "briefcase-outline",
  "Money Owed": "swap-horizontal-outline", Installments: "list-outline",
};

/** Shared mobile-web tab treatment: four equal columns, or three then two. */
export function PlanTabs({
  items,
  value,
  onChange,
}: {
  compact?: boolean;
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: items.length > 4 ? "wrap" : "nowrap" }}>
      {items.map((item, index) => {
        const label = item.replace(" · Plus", "");
        const selected = item === value;
        const color = selected ? colors.teal : colors.muted;
        return (
          <Pressable key={item} accessibilityRole="tab" accessibilityLabel={item}
            accessibilityState={{ selected }} aria-selected={selected}
            onPress={() => onChange(item)}
            style={{
              flexGrow: 1, flexBasis: items.length > 4 ? "30%" : 0, minWidth: 0,
              minHeight: 44, paddingVertical: 8, paddingHorizontal: 2,
              flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 4,
              borderWidth: 1, borderColor: selected ? colors.line : "transparent",
              borderBottomColor: selected ? colors.white : colors.line,
              borderTopLeftRadius: 10, borderTopRightRadius: 10,
              backgroundColor: selected ? colors.white : "transparent",
            }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: width < 360 ? 3 : 4, minWidth: 0, maxWidth: "100%" }}>
            <Icon line name={tabIcons[label] ?? (index === 0 ? "apps-outline" : /history|activity/i.test(label) ? "time-outline" : /goal/i.test(label) ? "flag-outline" : "list-outline")} size={14} color={color} />
            <Text style={{ fontSize: width < 360 ? 10.5 : 12, lineHeight: 18, textAlign: "center", flexShrink: 1, fontFamily: "Poppins-Medium", color }}>{label}</Text>
            </View>
            {item.includes(" · Plus") ? (
              <Text style={{ fontSize: 8, lineHeight: 14, paddingHorizontal: 3, borderRadius: 7, backgroundColor: colors.pale, color: colors.teal, fontFamily: "Poppins-SemiBold" }}>Plus</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
export function PlanAction({
  title,
  onPress,
  tone = "view",
  disabled = false,
  fullWidth = false,
}: {
  title: string;
  onPress: () => void;
  tone?: "view" | "edit" | "ask" | "delete" | "primary";
  disabled?: boolean;
  fullWidth?: boolean;
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
      hitSlop={4}
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
        alignSelf: fullWidth ? "stretch" : "flex-start",
        maxWidth: "100%",
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
        style={{
          minHeight: 38,
          paddingVertical: 8,
          paddingHorizontal: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: palette[1],
            fontFamily: "Poppins-Medium",
            fontSize: 15,
            lineHeight: 22,
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
      <LinearGradient
        colors={["#00AEC4", "#68E3BD"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          height: 10,
          width: `${Math.max(0, Math.min(100, value))}%`,
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
      session.offlineStatus.online,
      path,
      sample,
      version,
    ]),
  );
  return { data, setData, error, reload: () => setVersion((v) => v + 1) };
}

export function SummaryCard({
  help,
  title,
  value,
  detail,
  color,
  detailColor,
}: {
  title: string;
  value: string;
  detail?: string;
  color?: string;
  detailColor?: string;
  help?: string;
}) {
  const { colors } = useTheme();
  const [cardWidth, setCardWidth] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const valueSize =
    Platform.OS === "web" && cardWidth > 0
      ? Math.max(
          13.2,
          Math.min(22, (cardWidth - 10) / (Math.max(value.length, 1) * 0.68)),
        )
      : 22;
  return (
    <View
      onLayout={
        Platform.OS === "web"
          ? (event) => setCardWidth(event.nativeEvent.layout.width)
          : undefined
      }
      style={{
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.white,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 6,
        minHeight: 94,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Poppins-SemiBold", fontSize: 12, lineHeight: 18, textAlign: "center", color: "#7A879C", flexShrink: 1 }}>{title}</Text>
        {help ? <Pressable accessibilityRole="button" accessibilityLabel={help} onPress={() => Platform.OS === "web" ? setShowHelp(value => !value) : Alert.alert(title, help)} hitSlop={6} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center" }}><Icon name="information" size={14} color={colors.muted}/></Pressable> : null}
      </View>
      {showHelp && help ? <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", paddingHorizontal: 8 }}>{help}</Text> : null}
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: valueSize,
          lineHeight: 33,
          textAlign: "center",
          color: color ?? colors.ink,
        }}
        adjustsFontSizeToFit
        numberOfLines={Platform.OS === "web" ? undefined : 1}
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
            color: detailColor ?? colors.muted,
          }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
