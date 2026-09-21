import { telemetry, safeAction } from "../../shared/analytics";
import { Text, TextInput } from "./app-text";
import { Children } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAccess } from "./access";
import { useDisplayPreferences } from "./display-preferences";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, Modal, Linking, useColorScheme, Pressable, ScrollView, StyleSheet, View, type ColorValue, type TextInputProps, type ViewStyle } from "react-native";
import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  mobileNavigationIcons,
  mobileInterfaceIcons,
  mobileCategoryIcons,
} from "./icon-assets";
import { useSession } from "./session";

const lightColors = {
  ink: "#18343E",
  muted: "#506975",
  teal: "#007F90",
  bright: "#00ACC0",
  pale: "#E7F7F6",
  bg: "#F5FAFA",
  line: "#DCE9EB",
  white: "#FFFFFF",
  danger: "#AE303B",
  positive: "#00875A",
};
export function Icon({
  name,
  color,
  size = 24,
}: {
  name: ComponentProps<typeof Ionicons>["name"];
  color?: ColorValue;
  size?: number;
}) {
  const { colors, styles, dark } = useTheme();
  const source = mobileNavigationIcons[name] ?? mobileInterfaceIcons[name];
  if (name === "chatbubble-ellipses-outline" && source)
    return (
      <View style={{ width: size, height: size, overflow: "hidden" }}>
        <Image
          source={source}
          accessible={false}
          resizeMode="contain"
          style={{
            position: "absolute",
            width: size * 1.2,
            height: size * 1.2,
            left: -size * 0.1,
            top: -size * 0.075,
          }}
        />
      </View>
    );
  if (source)
    return (
      <Image
        source={source}
        accessible={false}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          ...(mobileInterfaceIcons[name]
            ? { tintColor: color ?? colors.teal }
            : {}),
        }}
      />
    );
  return <Ionicons name={name} color={color ?? colors.teal} size={size} />;
}
export function CategoryMark({
  name,
  size = 24,
}: {
  name?: string | null;
  size?: number;
}) {
  const key = name?.trim().toLowerCase() ?? "uncategorized";
  return (
    <Image
      source={mobileCategoryIcons[key] ?? mobileCategoryIcons.uncategorized}
      accessible={false}
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  leading,
  fullWidth = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
  leading?: ReactNode;
  fullWidth?: boolean;
}) {
  const { colors, styles } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      hitSlop={4}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => { telemetry("ui_interaction", { target_type: "button", action: safeAction(title) }); onPress(); }}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        fullWidth && { alignSelf: "stretch", width: "100%", minHeight: 52 },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {!secondary ? (
        <LinearGradient
          pointerEvents="none"
          colors={["#03A8C0", "#34D3D0"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[StyleSheet.absoluteFill, { borderRadius: 26 }]}
        />
      ) : null}
      {leading}
      {icon ? (
        <Icon
          name={icon}
          size={18}
          color={secondary ? colors.ink : "#FFFFFF"}
        />
      ) : null}
      <Text style={[styles.buttonText, secondary && { color: colors.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}
/** Shared container heading, distinct from onboarding's larger headline. */
export function SectionTitle({ children }: { children: ReactNode }) {
  const { styles } = useTheme();
  return <Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>;
}
export function Body({
  children,
  muted = true,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  const { colors, styles, dark } = useTheme();
  return (
    <Text style={[styles.body, !muted && { color: colors.ink }]}>
      {children}
    </Text>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const { colors, styles, dark } = useTheme();
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Screen({
  children,
  gap = 16,
}: {
  children: ReactNode;
  gap?: number;
}) {
  const { colors, styles, dark } = useTheme();
  const session = useSession();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[styles.content, { gap }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {!session.demo &&
      (!session.offlineStatus.online || session.offlineStatus.pending > 0) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/offline")}
          style={styles.notice}
        >
          <Text style={{ color: colors.ink, fontWeight: "600" }}>
            {session.offlineStatus.online
              ? `${session.offlineStatus.pending} changes pending sync`
              : "You are offline · Downloaded data"}
          </Text>
          <Text style={{ color: colors.muted }}>
            View sync status · Charts reflect the last downloaded data
          </Text>
        </Pressable>
      ) : null}
      {children}
    </ScrollView>
  );
}
export function Field({ label, trailing, ...props }: TextInputProps & { label: string; trailing?: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        keyboardAppearance={dark ? "dark" : "light"}
        {...props}
        style={[styles.input, trailing ? { paddingRight: 56 } : undefined, props.style]}
      />
      {trailing ? <View style={{ position: "absolute", right: 4, top: 0, bottom: 0, justifyContent: "center" }}>{trailing}</View> : null}
      </View>
    </View>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  const content: ReactNode[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      content.push(<Body key={`text-${content.length}`}>{text}</Body>);
      text = "";
    }
  };
  Children.toArray(children).forEach((child) => {
    if (typeof child === "string" || typeof child === "number")
      text += String(child);
    else {
      flush();
      content.push(child);
    }
  });
  flush();
  return (
    <View accessibilityLiveRegion="polite" style={[styles.notice, { gap: 12 }]}>
      {content}
    </View>
  );
}
export function AppHeader({
  title,
  back = false,
  onClose,
}: {
  title: string;
  back?: boolean;
  onClose?: () => void;
}) {
  const { colors, styles } = useTheme();
  const session = useSession();
  const profileRef = useRef(session.profileId);
  profileRef.current = session.profileId;
  const [panel, setPanel] = useState<"menu" | "notifications" | null>(null);
  const [feed, setFeed] = useState<
    Array<{ id: string; title: string; message: string; href: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setPanel(null);
    setFeed([]);
  }, [session.profileId]);
  useEffect(() => {
    if (panel !== "notifications") return;
    let active = true;
    setError("");
    setLoading(true);
    const request = session.demo
      ? Promise.resolve({ notifications: [] })
      : session.request<{ notifications: typeof feed }>(
          `notifications?workspaceId=${encodeURIComponent(session.profileId)}`,
        );
    void request
      .then((data) => {
        if (active) setFeed(data.notifications);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [panel, session.demo, session.profileId, session.request, revision]);
  const adviser = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open Adviser"
      onPress={() => router.navigate("/(tabs)/adviser")}
      style={styles.iconButton}
    >
      <Icon name="chatbubble-ellipses-outline" size={32} />
    </Pressable>
  );
  const navigate = (href: string) => {
    setPanel(null);
    const native: Record<
      string,
      | "/(tabs)"
      | "/(tabs)/accounts"
      | "/(tabs)/transactions"
      | "/(tabs)/recurring"
      | "/(tabs)/adviser"
      | "/(tabs)/account"
      | "/(tabs)/add"
      | "/budgeting"
      | "/goals"
      | "/investments"
      | "/circles"
      | "/reports"
      | "/split-bills"
    > = {
      "/": "/(tabs)",
      "/dashboard": "/(tabs)",
      "/accounts": "/(tabs)/accounts",
      "/transactions": "/(tabs)/transactions",
      "/recurring": "/(tabs)/recurring",
      "/adviser": "/(tabs)/adviser",
      "/account": "/(tabs)/account",
      "/add": "/(tabs)/add",
      "/budgeting": "/budgeting",
      "/goals": "/goals",
      "/investments": "/investments",
      "/circles": "/circles",
      "/reports": "/reports",
      "/split-bills": "/split-bills",
    };
    if (native[href]) router.navigate(native[href]);
    else if (href.startsWith("/") && !href.startsWith("//"))
      void Linking.openURL(`https://staging.clover.ph${href}`);
  };
  const home = title === "Home";
  const canAdd = ["Accounts", "Transactions", "Recurring"].includes(title);
  return (
    <>
      <View style={styles.header}>
        <View style={{ width: home ? 96 : 48, flexDirection: "row" }}>
          {home ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
              onPress={() => setPanel("menu")}
              style={styles.iconButton}
            >
              <Icon name="menu-outline" />
            </Pressable>
          ) : title === "Adviser" ? (
            <View style={styles.iconButton} />
          ) : (
            adviser
          )}
        </View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={styles.headerTitle}
        >
          {title}
        </Text>
        <View style={{ width: home ? 96 : 48, flexDirection: "row" }}>
          {home ? (
            <>
              {adviser}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open notifications"
                onPress={() => setPanel("notifications")}
                style={styles.iconButton}
              >
                <Icon name="notifications-outline" />
              </Pressable>
            </>
          ) : canAdd ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                title === "Accounts"
                  ? "Add account"
                  : title === "Recurring"
                    ? "Add recurring"
                    : "Add transaction"
              }
              style={styles.iconButton}
              onPress={() =>
                title === "Transactions"
                  ? router.navigate("/(tabs)/add")
                  : router.navigate({
                      pathname:
                        title === "Accounts"
                          ? "/(tabs)/accounts"
                          : "/(tabs)/recurring",
                      params: { add: String(Date.now()) },
                    })
              }
            >
              <AddNavigationMark size={32} />
            </Pressable>
          ) : back || onClose ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              style={styles.iconButton}
              onPress={
                onClose ??
                (() =>
                  router.canGoBack()
                    ? router.back()
                    : router.navigate("/(tabs)"))
              }
            >
              <Icon name="close" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
              style={styles.iconButton}
              onPress={() => setPanel("menu")}
            >
              <Icon name="menu-outline" />
            </Pressable>
          )}
        </View>
      </View>
      <Modal
        visible={panel !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPanel(null)}
      >
        <View style={{ flex: 1, backgroundColor: "#0007" }}>
          <Pressable
            accessibilityLabel="Close panel"
            onPress={() => setPanel(null)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: panel === "menu" ? "82%" : "100%",
              maxWidth: panel === "menu" ? 320 : 600,
              flex: 1,
              backgroundColor: colors.white,
              padding: 20,
              paddingTop: 52,
              gap: 16,
            }}
          >
            <View style={styles.row}>
              <Text style={[styles.headerTitle, { textAlign: "left" }]}>
                {panel === "menu" ? "Navigation" : "Notifications"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close panel"
                onPress={() => setPanel(null)}
                style={styles.iconButton}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {panel === "menu" ? (
                [
                  ["Home", "/"],
                  ["Reports", "/reports"],
                  ["Adviser", "/adviser"],
                  ["Accounts", "/accounts"],
                  ["Transactions", "/transactions"],
                  ["Recurring", "/recurring"],
                  ["Split Bills", "/split-bills"],
                  ["Circles", "/circles"],
                  ["Budgeting", "/budgeting"],
                  ["Goals", "/goals"],
                  ["Investments", "/investments"],
                  ["Account & Profiles", "/account"],
                ].map(([label, href]) => (
                  <Pressable
                    key={href}
                    accessibilityRole="button"
                    onPress={() => navigate(href)}
                    style={{
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                    }}
                  >
                    <Text style={styles.body}>{label}</Text>
                  </Pressable>
                ))
              ) : (
                <>
                  {loading ? (
                    <Text style={styles.body}>Loading notifications…</Text>
                  ) : error ? (
                    <>
                      <Text style={styles.body}>{error}</Text>
                      <Button
                        title="Try again"
                        onPress={() => setRevision((v) => v + 1)}
                      />
                    </>
                  ) : !feed.length ? (
                    <Text style={styles.body}>You’re all caught up.</Text>
                  ) : (
                    feed.map((item) => (
                      <View key={item.id} style={styles.card}>
                        <Text style={styles.label}>{item.title}</Text>
                        <Text style={styles.body}>{item.message}</Text>
                        {item.href ? (
                          <Button
                            title="View details"
                            secondary
                            onPress={() => navigate(item.href!)}
                          />
                        ) : null}
                        <Button
                          title="Dismiss"
                          secondary
                          onPress={() => {
                            const profileId = session.profileId;
                            void session
                              .request<{ notifications: typeof feed }>(
                                `notifications?workspaceId=${encodeURIComponent(profileId)}`,
                                {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    ids: [item.id],
                                    action: "dismiss",
                                  }),
                                },
                              )
                              .then((data) => {
                                if (profileRef.current === profileId)
                                  setFeed(data.notifications);
                              })
                              .catch((e) => {
                                if (profileRef.current === profileId)
                                  setError(e.message);
                              });
                          }}
                        />
                      </View>
                    ))
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
export function ProfileGate({ children }: { children: ReactNode }) {
  const session = useSession();
  if (session.error)
    return (
      <Screen>
        <Heading>Let’s reconnect</Heading>
        <Notice>{session.error}</Notice>
        <Button title="Try again" onPress={session.refresh} />
        <Button
          title="Sign out"
          secondary
          onPress={() => void session.signOut()}
        />
      </Screen>
    );
  if (!session.ready)
    return (
      <Screen>
        <Body>Loading your Clover account…</Body>
      </Screen>
    );
  if (!session.profileId)
    return (
      <Screen>
        <Heading>Choose your Profile</Heading>
        <Body>Your finances stay separate between Profiles.</Body>
        {session.data?.profiles.map((profile) => (
          <Button
            key={profile.id}
            title={profile.name}
            onPress={() => session.setProfileId(profile.id)}
          />
        ))}
        {!session.data?.profiles.length && (
          <Notice>
            Create your first Profile on the Clover website, then refresh.
          </Notice>
        )}
        <Button title="Refresh" secondary onPress={session.refresh} />
      </Screen>
    );
  return <>{children}</>;
}
export function money(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}
export function dateLabel(date: string) {
  const value = new Date(date);
  return Number.isNaN(value.getTime())
    ? "Date unavailable"
    : value.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}
const makeStyles = (colors: typeof lightColors) =>
  StyleSheet.create({
    content: {
      padding: 22,
      gap: 16,
      paddingBottom: 44,
      width: "100%",
      maxWidth: 760,
      alignSelf: "center",
      flexGrow: 1,
    },
    heading: {
      fontFamily: "Poppins-SemiBold",
      fontSize: 30,
      lineHeight: 37,
      color: colors.ink,
      letterSpacing: -0.7,
    },
    sectionTitle: {
      fontFamily: "Poppins-SemiBold",
      fontSize: 16,
      lineHeight: 24,
      color: "#7A879C",
    },
    body: {
      fontFamily: "Poppins-Regular",
      fontSize: 16,
      lineHeight: 24,
      color: colors.muted,
    },
    label: { fontFamily: "Poppins-Medium", fontSize: 15, color: colors.ink },
    card: {
      padding: 22,
      borderRadius: 24,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.line,
      gap: 14,
    },
    notice: { padding: 15, borderRadius: 16, backgroundColor: colors.pale },
    button: {
      minHeight: 40,
      alignSelf: "flex-start",
      maxWidth: "100%",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 26,
      backgroundColor: colors.teal,
      alignItems: "center",
      justifyContent: "center",
    },
    secondary: {
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.line,
    },
    buttonText: {
      flexShrink: 1,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: "Poppins-Medium",
      color: "#FFFFFF",
      textAlign: "center",
    },
    input: {
      fontFamily: "Poppins-Regular",
      padding: 15,
      minHeight: 52,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 16,
      backgroundColor: colors.white,
      fontSize: 17,
      color: colors.ink,
    },
    header: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.white,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 18,
      fontFamily: "Poppins-SemiBold",
      color: colors.ink,
    },
    iconButton: {
      minHeight: 48,
      minWidth: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    row: { flexDirection: "row", alignItems: "center", gap: 14 },
  });

const darkColors: typeof lightColors = {
  ink: "#EDF5F7",
  muted: "#A6BBC4",
  teal: "#007F90",
  bright: "#5ED3D0",
  pale: "#193A43",
  bg: "#0D171D",
  line: "#2A4653",
  white: "#15252D",
  danger: "#FF9D9D",
  positive: "#69DB9E",
};
const lightStyles = makeStyles(lightColors);
const darkStyles = makeStyles(darkColors);
export function useTheme() {
  const systemDark = useColorScheme() === "dark";
  const { appearance } = useDisplayPreferences();
  const dark = appearance === "system" ? systemDark : appearance === "dark";
  return {
    dark,
    colors: dark ? darkColors : lightColors,
    styles: dark ? darkStyles : lightStyles,
  };
}

export function AccountAvatar() {
  const { colors } = useTheme();
  const session = useSession();
  const initial =
    session.data?.firstName?.trim().slice(0, 1).toUpperCase() || "C";
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.ink,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: colors.white,
          fontFamily: "Poppins-SemiBold",
          fontSize: 14,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}
export function AddNavigationMark({ size = 48 }: { size?: number } = {}) {
  return (
    <LinearGradient
      colors={["#03A8C0", "#5ED3D0"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="add" size={size * 0.58} color="white" />
    </LinearGradient>
  );
}
export function DetailNavigation({
  onNavigate,
}: { onNavigate?: () => void } = {}) {
  const access = useAccess();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 7,
        minHeight: 72 + insets.bottom,
        paddingBottom: 8 + insets.bottom,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.white,
      }}
    >
      {(
        [
          { title: "Home", route: "/(tabs)", icon: "home-outline" },
          {
            title: "Transactions",
            route: "/(tabs)/transactions",
            icon: "swap-horizontal-outline",
          },
          { title: "Add", route: "/(tabs)/add", icon: "add" },
          {
            title: "Adviser",
            route: "/(tabs)/adviser",
            icon: "chatbubble-ellipses-outline",
          },
          {
            title: "Account",
            route: "/(tabs)/account",
            icon: "person-outline",
          },
        ] as const
      ).map((item) => (
        <Pressable
          key={item.title}
          accessibilityRole="button"
          accessibilityLabel={
            access.active ? item.title : `${item.title}, log in required`
          }
          onPress={() => {
            onNavigate?.();
            if (access.active) router.navigate(item.route);
            else void access.signIn();
          }}
          style={{
            flex: 1,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {item.title === "Account" ? (
            <AccountAvatar />
          ) : item.title === "Add" ? (
            <AddNavigationMark />
          ) : (
            <Icon name={item.icon} size={34} />
          )}
          {item.title !== "Add" ? (
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{
                maxWidth: "100%",
                textAlign: "center",
                fontFamily: "Poppins-Regular",
                fontSize: 11,
                color: colors.muted,
              }}
            >
              {item.title}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
