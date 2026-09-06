import { router } from "expo-router";
import { Text, View } from "react-native";
import { useSession } from "../../src/session";
import {
  Body,
  Button,
  Card,
  Heading,
  Icon,
  Screen,
  colors,
  styles,
} from "../../src/ui";
export default function Home() {
  const session = useSession();
  return (
    <Screen>
      <Body>
        {session.data?.profiles.find((p) => p.id === session.profileId)?.name}
      </Body>
      <Heading>
        Hello{session.data?.firstName ? `, ${session.data.firstName}` : ""}.
      </Heading>
      <Body>A clearer picture starts with the records you already have.</Body>
      <Card style={{ backgroundColor: colors.pale }}>
        <Icon name="document-text-outline" size={38} />
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.ink }}>
          Bring your money into focus
        </Text>
        <Body>
          Upload a statement or receipt. Clover organizes the useful details,
          ready for your review.
        </Body>
        <Button
          title="Upload a record"
          onPress={() => router.navigate("/(tabs)/add")}
        />
      </Card>
      <Card>
        <View style={styles.row}>
          <Icon name="swap-horizontal-outline" />
          <Text style={{ fontSize: 20, fontWeight: "600", color: colors.ink }}>
            Your transactions
          </Text>
        </View>
        <Body>
          Search your records and update names, notes, and tags. Your original
          import stays traceable.
        </Body>
        <Button
          title="View transactions"
          secondary
          onPress={() => router.navigate("/(tabs)/transactions")}
        />
      </Card>
      <Body>
        This first native preview focuses on Transactions and imports. The rest
        of Clover remains available on the website while its native screens are
        built.
      </Body>
    </Screen>
  );
}
