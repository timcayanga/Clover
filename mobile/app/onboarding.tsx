import { SignupTrialSummary } from "../src/signup-trial-summary";
import { OnboardingPlanOffers } from '../src/onboarding-plan-offers';
import { onboardingCanConnect } from '../../shared/onboarding-upgrade';
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
  const [step, setStep] = useState<"upgrade" | "experience" | "upload">(onboardingCanConnect(session.data?.entitlement.planTier) ? "experience" : "upgrade");
  const [paidTier, setPaidTier] = useState(session.data?.entitlement.planTier ?? 'free');
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const initialAccess = useRef(Boolean(session.data));
  useEffect(() => { if (!initialAccess.current && session.data) { initialAccess.current = true; setPaidTier(session.data.entitlement.planTier); if(onboardingCanConnect(session.data.entitlement.planTier))setStep('experience'); } }, [session.data]);
  const [accountMethod, setAccountMethod] = useState("upload");
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
          ? destination === "manual" ? { pathname: "/(tabs)/add", params: { entry: "manual" } } : { pathname: "/accounts", params: { add: "connect", onboarding: "1" } }
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
    if (upload === 'connect' && !onboardingCanConnect(paidTier)) { setAccountMethod('connect'); return; }
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
  const planOffers = <OnboardingPlanOffers embedded={step === "upload"} pending={checkoutPending} onPending={setCheckoutPending} onBusy={setCheckoutBusy} onVerified={tier => { setPaidTier(tier); setCheckoutPending(false); setCheckoutBusy(false); setStep(step === 'upload' ? 'upload' : 'experience'); }} />;
  return (
    <Screen>
      <SignupTrialSummary trial={session.data?.entitlement.trial} />
      {step !== 'upgrade' ? <View style={{ alignItems: "center" }}><CloverMascot pose={step === "experience" ? "chat" : accountMethod === "connect" ? "banks" : accountMethod === "upload" ? "receipt" : "manual"} size={128} /></View> : null}
      {step === 'upgrade' ? <>{planOffers}<Button title={checkoutPending ? 'Continue setup' : 'Continue with Free'} secondary disabled={checkoutBusy} onPress={()=>setStep('experience')} /><Body>No card required for Free. You can upgrade later.</Body></> : step === "experience" ? (
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
            <Heading>Record your first transaction</Heading>
            <View accessibilityRole="tablist" style={{flexDirection:'row',gap:12}}>{(['connect','upload'] as const).map(method=><Pressable key={method} accessibilityLabel={method==='connect'?'Connect a bank':'Upload documents'} accessibilityRole="tab" accessibilityState={{selected:accountMethod===method,disabled:busy}} disabled={busy} onPress={()=>setAccountMethod(method)} style={{flex:1,padding:14,borderRadius:18,borderWidth:1,borderColor:accountMethod===method?colors.teal:colors.line,backgroundColor:accountMethod===method?'#e5f7f8':colors.white,gap:8}}><Text style={{fontFamily:'Poppins-SemiBold',color:colors.ink}}>{method==='connect'?'Connect a bank':'Upload documents'}</Text><Text style={{fontSize:12,color:colors.muted}}>{method==='connect'?'Automatic bank sync':'Statements and receipts'}</Text></Pressable>)}</View>
            <Button title="Add a transaction manually" secondary disabled={busy} onPress={()=>setAccountMethod('manual')} />
            {accountMethod !== "upload" ? <>
              <Heading>{accountMethod === "connect" ? "Connect a supported bank" : "Add a transaction manually"}</Heading>
              <Body>{accountMethod === "connect" ? "Choose your bank and securely link the accounts you want to see in Clover." : "Record something you spent or earned. You can use Cash and add other accounts later."}</Body>
              {accountMethod === 'connect' && !onboardingCanConnect(paidTier) ? <><Body>Choose Plus or Pro to connect your bank. You can also upload documents on Free.</Body>{planOffers}</> : <Button title={accountMethod === "connect" ? "Connect a bank" : "Add transaction"} disabled={busy || checkoutBusy} onPress={() => void finish(accountMethod === "connect" ? "connect" : "manual")} /> }
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
