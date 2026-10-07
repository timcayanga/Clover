import { EntrySelector } from "../src/entry-controls";
import { CloverMascot } from "../src/clover-mascot";
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
  const [accountMethod, setAccountMethod] = useState("connect");
  const saving = useRef(false);
  const enteredBeforeBootstrap = useRef(!session.data);
  const [experience, setExperience] = useState<
    "beginner" | "comfortable" | "advanced" | null
  >(null);
  const [currency, setCurrency] = useState("PHP");
  const [choosingCurrency, setChoosingCurrency] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState<
    "file" | "camera" | "library" | "skip" | "connect" | "manual" | null
  >(null);
  useEffect(() => {
    if (destination !== null && session.data && !session.data.needsOnboarding)
      router.replace(
        destination === "connect" || destination === "manual"
          ? { pathname: "/(tabs)/accounts", params: { add: destination === "connect" ? "connect" : "1", onboarding: "1" } }
          : destination !== "skip"
          ? {
              pathname: "/(tabs)/add",
              params: { entry: `upload-${destination}`, picker: destination },
            }
          : "/(tabs)",
      );
  }, [destination, session.data]);
  useEffect(() => {
    if (enteredBeforeBootstrap.current && session.data?.needsOnboarding === false && !saving.current && destination === null) router.replace("/(tabs)");
  }, [session.data, destination]);
  const currencyName =
    session.data?.currencyChoices?.find((option) => option.code === currency)
      ?.name ?? "Philippine Peso";
  const finish = async (upload: "file" | "camera" | "library" | "skip" | "connect" | "manual") => {
    if (!experience || saving.current) return;
    if (!session.data) { setError(session.error || "Your account is connecting. Please try again in a moment."); return; }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await session.completeOnboarding({
        experience, currency,
        locale: Intl.DateTimeFormat().resolvedOptions().locale,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setDestination(upload);

    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to finish setup.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <View style={{ alignItems: "center" }}><CloverMascot pose={step === "experience" ? "thinking" : "welcome"} size={128} /></View>
      {step === "experience" ? (
        <>
          <Heading>How comfortable are you with financial management?</Heading>
          {(
            [
              [
                "beginner",
                "Still learning",
                "Keep the language simple and show me what matters first.",
                require("../assets/onboarding/beginner.png"),
              ],
              [
                "comfortable",
                "Comfortable",
                "I understand budgets, statements, and general money tracking.",
                require("../assets/onboarding/intermediate.png"),
              ],
              [
                "advanced",
                "Very comfortable",
                "Give me the numbers, trends, and short explanations.",
                require("../assets/onboarding/advanced.png"),
              ],
            ] as const
          ).map(([value, title, description, icon]) => (
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
              <Image source={icon} resizeMode="contain" style={{ width: 40, height: 48 }} />
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
            <Heading>Add your accounts</Heading>
            <Body>Connect, upload, or add manually.</Body>
            <EntrySelector value={accountMethod} items={["connect", "upload", "manual"]} onChange={setAccountMethod} disabled={busy} />
            {accountMethod !== "upload" ? <>
              <Heading>{accountMethod === "connect" ? "Connect a supported bank" : "Add an account manually"}</Heading>
              <Body>{accountMethod === "connect" ? "Choose your bank and securely link the accounts you want to see in Clover." : "Add a bank account, wallet, cash, or another account yourself."}</Body>
              {accountMethod === "connect" ? <Body>Available with Plus and Pro</Body> : null}
              <Button title={accountMethod === "connect" ? "Connect a bank" : "Add account"} disabled={busy} onPress={() => void finish(accountMethod === "connect" ? "connect" : "manual")} />
            </> : (
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
              title="Skip for now"
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
