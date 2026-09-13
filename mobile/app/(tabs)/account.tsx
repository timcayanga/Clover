import { Linking, Text } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { useSession } from "../../src/session";
import { Body, Button, Card, Heading, Notice, Screen, dateLabel, useTheme } from "../../src/ui";
export default function Account() {
  const { colors, styles, dark } = useTheme();
  const session = useSession();
  const [error, setError] = useState("");
  const access = session.data?.entitlement;
  return (
    <Screen>
      <Heading>Your Clover account</Heading>
      <Button title="Settings" secondary onPress={() => router.push("/settings")} />
      <Button title="Notifications" secondary onPress={() => router.push("/notifications")} />
      <Card>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.teal }}>
          {access?.planTier === "pro" ? "Clover Pro" : "Clover Free"}
        </Text>
        <Body>
          {session.demo
            ? "This is a sample Free account."
            : "Your plan belongs to your Clover account, not this device."}
        </Body>
        {access?.accessEndsAt ? (
          <Body>Access through {dateLabel(access.accessEndsAt)}</Body>
        ) : null}
        {access?.renewing ? (
          <Body>
            Your subscription renews through its original billing provider.
          </Body>
        ) : null}
        <Body>
          Purchases are unavailable in this preview. Existing Pro access is
          recognized when you sign in.
        </Body>
        <Button
          title="Refresh plan status"
          secondary
          onPress={session.refresh}
        />
      </Card>
      <Card>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 20, color: colors.ink, fontWeight: "600" }}
        >
          Profiles
        </Text>
        <Body>Switch Profiles without combining their financial records.</Body>
        {session.data?.profiles.map((profile) => (
          <Button
            key={profile.id}
            title={`${profile.name}${profile.id === session.profileId ? " · Selected" : ""}`}
            secondary={profile.id !== session.profileId}
            onPress={() => {
              session.setProfileId(profile.id);
              router.navigate("/(tabs)");
            }}
          />
        ))}
      </Card>
      {error ? <Notice>{error}</Notice> : null}
      <Button
        title="Help Center"
        secondary
        onPress={() => {
          void Linking.openURL("https://clover.ph/help").catch(() =>
            setError(
              "Unable to open Help. Visit clover.ph/help in your browser.",
            ),
          );
        }}
      />
      <Button
        title="Privacy Policy"
        secondary
        onPress={() => {
          void Linking.openURL("https://clover.ph/privacy-policy").catch(() =>
            setError("Unable to open this link."),
          );
        }}
      />
      <Button
        title={session.demo ? "Leave sample preview" : "Log out"}
        secondary
        onPress={() => {
          void session
            .signOut()
            .catch(() => setError("Unable to sign out. Please try again."));
        }}
      />
      <Body>Clover Preview 0.1.0 · Native purchases disabled</Body>
    </Screen>
  );
}
