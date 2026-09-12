import { useState } from "react";
import { Text, View } from "react-native";
import { useAccess } from "../src/access";
import { Body, Button, Card, Heading, Icon, Notice, Screen, useTheme } from "../src/ui";
export default function Welcome() {
  const { colors, styles, dark } = useTheme();
  const access = useAccess();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (access.active) return null;
  return (
    <Screen>
      <View style={{ paddingTop: 48, gap: 26 }}>
        <Text
          accessibilityLabel="Clover"
          style={{ fontSize: 44, fontWeight: "700", color: colors.bright }}
        >
          clover
        </Text>
        <Heading>Money looks better from here</Heading>
        <Body>
          Your records. Your financial picture. Now in a mobile experience built
          for your pocket.
        </Body>
        <Card>
          <Icon name="documents-outline" size={38} />
          <Text style={{ fontSize: 20, fontWeight: "600", color: colors.ink }}>
            Less typing. More clarity.
          </Text>
          <Body>
            Bring in a statement, find a transaction, and keep the details under
            your control.
          </Body>
        </Card>
        {error ? <Notice>{error}</Notice> : null}
        {access.configured ? (
          <Button
            title={busy ? "Opening secure sign-in…" : "Log in to Clover"}
            disabled={busy || !access.loaded}
            onPress={() => {
              setBusy(true);
              setError("");
              access
                .signIn()
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        ) : (
          <Notice>
            Account connection isn’t configured in this build. You can explore
            the preview with fictional sample data.
          </Notice>
        )}
        <Button
          title="Explore sample Clover"
          secondary
          onPress={access.enterDemo}
        />
        <Body>
          Early native preview · iOS & Android{"\n"}Purchases are not enabled in
          this build.
        </Body>
      </View>
    </Screen>
  );
}
