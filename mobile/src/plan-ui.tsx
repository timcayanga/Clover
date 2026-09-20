import { Text } from "./app-text";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { router, useFocusEffect } from "expo-router";
import { Platform, Pressable, View } from "react-native";
import { useSession } from "./session";
import { Icon, useTheme } from "./ui";
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
  const { colors } = useTheme();
  const adviser = () => router.push("/(tabs)/adviser");
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: stackedTitle ? "flex-start" : "center",
        justifyContent: "space-between",
        minHeight: stackedTitle ? 84 : 48,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={back ? "Go back" : "Adviser"}
        onPress={back ?? adviser}
        style={{ padding: 8 }}
      >
        <Icon
          name={back ? "chevron-back" : "chatbubble-ellipses-outline"}
          size={back ? 24 : 32}
        />
      </Pressable>
      <Text
        accessibilityRole="header"
        style={{
          position: "absolute",
          left: stackedTitle ? 0 : titleInset,
          right: stackedTitle ? 0 : titleInset,
          top: stackedTitle ? 52 : undefined,
          textAlign: "center",
          fontFamily: "Poppins-SemiBold",
          fontSize: 18,
          color: colors.ink,
        }}
      >
        {title}
      </Text>
      {trailing ??
        (!back && add ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${title}`}
            onPress={add}
            hitSlop={4}
          >
            <LinearGradient
              colors={["#03a8c0", "#34d3d0"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="add" color="#fff" size={22} />
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={back ? "Adviser" : "Home"}
            onPress={back ? adviser : () => router.push("/(tabs)/index")}
            style={{ padding: 8 }}
          >
            <Icon
              size={back ? 32 : 24}
              name={back ? "chatbubble-ellipses-outline" : "home-outline"}
            />
          </Pressable>
        ))}
    </View>
  );
}
export function PlanTabs({
  items,
  value,
  onChange,
  compact = false,
}: {
  compact?: boolean;
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
            paddingVertical: compact ? 8 : 12,
            paddingHorizontal: compact ? 2 : 0,
            minHeight: 40,
            flexDirection: compact ? "row" : "column",
            justifyContent: "center",
            backgroundColor:
              compact && item === value ? colors.pale : undefined,
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
                ? compact
                  ? "apps-outline"
                  : "grid-outline"
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
            size={compact ? 12 : 16}
          />
          <Text
            style={{
              fontSize: 11,
              flexShrink: compact ? 1 : undefined,
              fontFamily: "Poppins-Regular",
              color: colors.teal,
            }}
          >
            {compact ? item.replace(" · Pro", "") : item}
          </Text>
          {compact && item.includes(" · Pro") ? (
            <Text
              style={{
                position: "absolute",
                top: 1,
                right: 3,
                fontSize: 7,
                fontFamily: "Poppins-SemiBold",
                color: colors.teal,
              }}
            >
              Pro
            </Text>
          ) : null}
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
}) {
  const { colors } = useTheme();
  const [cardWidth, setCardWidth] = useState(0);
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
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 16,
          lineHeight: 24,
          textAlign: "center",
          color: "#7A879C",
        }}
      >
        {title}
      </Text>
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
