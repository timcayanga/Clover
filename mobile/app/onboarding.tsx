import { Text } from "../src/app-text";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Image, Pressable, View } from "react-native";
import { useSession } from "../src/session";
import {
  Body,
  Button,
  Card,
  Heading,
  Notice,
  Screen,
  useTheme,
} from "../src/ui";

export default function Onboarding() {
  const session = useSession();
  const { colors } = useTheme();
  const [step, setStep] = useState<"experience" | "upload">("experience");
  const saving = useRef(false);
  const [experience, setExperience] = useState<
    "beginner" | "comfortable" | "advanced" | null
  >(null);
  const [currency, setCurrency] = useState("PHP");
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<
    "file" | "camera" | "library" | "skip" | null
  >(null);
  useEffect(() => {
    if (destination !== null && session.data && !session.data.needsOnboarding)
      router.replace(
        destination !== "skip"
          ? {
              pathname: "/(tabs)/add",
              params: { entry: `upload-${destination}`, picker: destination },
            }
          : "/(tabs)",
      );
  }, [destination, session.data]);
  const currencyName =
    session.data?.currencyChoices?.find((option) => option.code === currency)
      ?.name ?? "Philippine Peso";
  const finish = async (upload: "file" | "camera" | "library" | "skip") => {
    if (!experience || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await session.request("onboarding", {
        method: "POST",
        body: JSON.stringify({
          experience,
          currency,
          locale: Intl.DateTimeFormat().resolvedOptions().locale,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setDestination(upload);
      session.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to finish setup.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Image
        source={require("../assets/clover-icon.png")}
        accessibilityLabel="Clover"
        style={{ width: 48, height: 48, alignSelf: "center" }}
      />
      {step === "experience" ? (
        <>
          <Heading>How comfortable are you with financial management?</Heading>
          {(
            [
              [
                "beginner",
                "Still learning",
                "Keep the language simple and show me what matters first.",
                "🌱",
              ],
              [
                "comfortable",
                "Comfortable",
                "I understand budgets, statements, and general money tracking.",
                "🪴",
              ],
              [
                "advanced",
                "Very comfortable",
                "Give me the numbers, trends, and short explanations.",
                "🌿",
              ],
            ] as const
          ).map(([value, title, description, symbol]) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={`${title}. ${description}`}
              accessibilityState={{ checked: experience === value }}
              onPress={() => setExperience(value)}
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                borderRadius: 18,
                borderWidth: 1,
                borderColor: experience === value ? colors.teal : colors.line,
                backgroundColor: colors.white,
                padding: 14,
                minHeight: 80,
              }}
            >
              <Text style={{ fontSize: 24 }}>{symbol}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}
                >
                  {title}
                </Text>
                <Body>{description}</Body>
              </View>
            </Pressable>
          ))}
          <Card>
            <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold" }}>
              Default currency
            </Text>
            <Body>
              {currencyName} ({currency})
            </Body>
            <Button
              title="Choose currency"
              secondary
              onPress={() => setChoosingCurrency(!choosingCurrency)}
            />
            {choosingCurrency
              ? (
                  session.data?.currencyChoices ?? [
                    { code: "PHP", name: "Philippine Peso" },
                  ]
                ).map((option) => (
                  <Button
                    key={option.code}
                    title={`${option.name} (${option.code})`}
                    secondary={option.code !== currency}
                    onPress={() => {
                      setCurrency(option.code);
                      setChoosingCurrency(false);
                    }}
                  />
                ))
              : null}
            <Body>
              Used for your starter Cash account. Choose the currency you use
              most.
            </Body>
          </Card>
          <Button
            title="Continue"
            disabled={!experience}
            onPress={() => setStep("upload")}
          />
        </>
      ) : (
        <>
          <Card>
            <Heading>Upload your first file</Heading>
            <Body>
              Add a statement, receipt, or financial screenshot. You can review
              every detail.
            </Body>
            {(
              [
                [
                  "file",
                  "Choose Files",
                  require("../assets/organize/upload-files.png"),
                ],
                [
                  "camera",
                  "Take Photo",
                  require("../assets/organize/upload-camera.png"),
                ],
                [
                  "library",
                  "Photo Library",
                  require("../assets/organize/upload-library.png"),
                ],
              ] as const
            ).map(([source, title, icon]) => (
              <Pressable
                key={source}
                accessibilityRole="button"
                accessibilityLabel={title}
                disabled={busy || !experience}
                accessibilityState={{ disabled: busy || !experience }}
                onPress={() => void finish(source)}
                style={{
                  minHeight: 80,
                  borderRadius: 16,
                  padding: 12,
                  gap: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.white,
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: busy || !experience ? 0.5 : 1,
                }}
              >
                <Image source={icon} style={{ width: 44, height: 44 }} />
                <Text
                  style={{
                    color: colors.ink,
                    fontFamily: "Poppins-SemiBold",
                  }}
                >
                  {title}
                </Text>
              </Pressable>
            ))}
          </Card>
          <Button
            title="Back"
            secondary
            disabled={busy}
            onPress={() => setStep("experience")}
          />
          {error ? <Notice>{error}</Notice> : null}
          <View style={{ alignItems: "flex-end" }}>
            <Button
              title={busy ? "Saving…" : "Skip for now"}
              secondary
              disabled={busy || !experience || currency.length !== 3}
              onPress={() => void finish("skip")}
            />
          </View>
        </>
      )}
    </Screen>
  );
}
