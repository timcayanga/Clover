import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  Image,
  Modal,
  Linking,
  useColorScheme,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
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
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { colors, styles, dark } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: colors.teal }]}>
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
export function Screen({ children }: { children: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {children}
    </ScrollView>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors, styles, dark } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, props.style]}
      />
    </View>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <Body>{children}</Body>
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
              <Icon name="add" />
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
                                  body: JSON.stringify({ ids: [item.id] }),
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
      fontSize: 30,
      lineHeight: 37,
      fontWeight: "700",
      color: colors.ink,
      letterSpacing: -0.7,
    },
    body: { fontSize: 16, lineHeight: 24, color: colors.muted },
    label: { fontSize: 15, fontWeight: "600", color: colors.ink },
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
      minHeight: 50,
      paddingHorizontal: 22,
      paddingVertical: 14,
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
      fontSize: 16,
      fontWeight: "600",
      color: "#FFFFFF",
      textAlign: "center",
    },
    input: {
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
      minHeight: 64,
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
  teal: "#168D9D",
  bright: "#5ED3D0",
  pale: "#193A43",
  bg: "#0D171D",
  line: "#2A4653",
  white: "#15252D",
  danger: "#FF9D9D",
};
const lightStyles = makeStyles(lightColors);
const darkStyles = makeStyles(darkColors);
export function useTheme() {
  const dark = useColorScheme() === "dark";
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
        width: 28,
        height: 28,
        borderRadius: 8,
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
export function DetailNavigation() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        paddingVertical: 12,
        paddingBottom: 24,
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
          onPress={() => router.navigate(item.route)}
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
          ) : (
            <Icon name={item.icon} />
          )}
          <Text style={{ fontSize: 10, color: colors.ink }}>{item.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}
