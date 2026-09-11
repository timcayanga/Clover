import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  Image,
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
import type { ComponentProps, ReactNode } from "react";
import { mobileNavigationIcons, mobileInterfaceIcons, mobileCategoryIcons } from "./icon-assets";
import { useSession } from "./session";

export const colors = {
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
  color = colors.teal,
  size = 24,
}: {
  name: ComponentProps<typeof Ionicons>["name"];
  color?: ColorValue;
  size?: number;
}) {
  const source = mobileNavigationIcons[name] ?? mobileInterfaceIcons[name];
  if (source) return <Image source={source} accessible={false} resizeMode="contain" style={{ width: size, height: size, ...(mobileInterfaceIcons[name] ? { tintColor: color } : {}) }} />;
  return <Ionicons name={name} color={color} size={size} />;
}
export function CategoryMark({ name, size = 24 }: { name?: string | null; size?: number }) {
  const key = name?.trim().toLowerCase() ?? "uncategorized";
  return <Image source={mobileCategoryIcons[key] ?? mobileCategoryIcons.uncategorized} accessible={false} resizeMode="contain" style={{ width: size, height: size }} />;
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
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Screen({ children }: { children: ReactNode }) {
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
  return (
    <View accessibilityLiveRegion="polite" style={styles.notice}>
      <Body>{children}</Body>
    </View>
  );
}
export function AppHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Adviser"
        onPress={() => router.navigate("/(tabs)/adviser")}
        style={styles.iconButton}
      >
        <Icon name="chatbubble-ellipses-outline" size={29} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account and Profiles"
        onPress={() => router.navigate("/(tabs)/account")}
        style={styles.iconButton}
      >
        <Icon name="menu-outline" color={colors.ink} />
      </Pressable>
    </View>
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
export const styles = StyleSheet.create({
  content: {
    padding: 22,
    gap: 20,
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
    color: colors.white,
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
    fontWeight: "700",
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
