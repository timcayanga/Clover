import { SettingsPlan } from "../../src/settings-plan";
import { Linking } from "react-native";
import { router } from "expo-router";
import { useState } from "react";
import { useSession } from "../../src/session";
import {
  Body,
  Button,
  Card,
  SectionTitle,
  Notice,
  Screen,
} from "../../src/ui";
export default function Account() {
  const session = useSession();
  const [error, setError] = useState("");
  const access = session.data?.entitlement;
  return (
    <Screen>
      <Button
        title="Settings"
        secondary
        onPress={() => router.push("/settings")}
      />
      <Button
        title="Notifications"
        secondary
        onPress={() => router.push("/notifications")}
      />
      <SettingsPlan />
      <Card>
        <SectionTitle>Profiles</SectionTitle>
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
      <Body>Clover Preview 0.1.0</Body>
    </Screen>
  );
}
