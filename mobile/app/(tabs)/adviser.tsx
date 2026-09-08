import { Body, Card, Heading, Icon, Screen } from "../../src/ui";
export default function Adviser() {
  return (
    <Screen>
      <Icon name="chatbubble-ellipses-outline" size={42} />
      <Heading>Your next money question</Heading>
      <Body>Adviser’s native conversation screen is coming next.</Body>
      <Card>
        <Body>
          This preview does not generate financial advice or send your records
          to a separate AI service. Use Adviser on the Clover website while the
          native version is being connected.
        </Body>
      </Card>
    </Screen>
  );
}
