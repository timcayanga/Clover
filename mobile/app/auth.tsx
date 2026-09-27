import { beginTelemetry } from "../../shared/analytics";
import { useState, useRef } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useSignIn, useSignUp } from "@clerk/expo";
import { useSignInWithApple } from "@clerk/expo/apple";
import { Ionicons } from "@expo/vector-icons";
import { useSSO } from "@clerk/expo/experimental";
import { AuthVerification } from "../src/auth-verification";
import { useAccess } from "../src/access";
import { setRememberSession } from "../src/auth-token-cache";
import { Body, Button, Card, Field, Heading, Icon, Notice, Screen, useTheme } from "../src/ui";
import { Text } from "../src/app-text";
import { GoogleIcon } from "../src/google-icon";
import * as WebBrowser from "expo-web-browser";
type Step =
  | "sign-in"
  | "sign-up"
  | "verify"
  | "reset"
  | "reset-code"
  | "new-password"
  | "email-verification"
  | "extra-verification";
export default function Authentication() {
  const access = useAccess();
  return access.configured ? (
    <AuthForm />
  ) : (
    <Screen>
      <Notice>Sign-in is not configured for this build.</Notice>
      <Button title="Back" onPress={() => router.back()} />
    </Screen>
  );
}
function AuthForm() {
  const { welcomeAllowed } = useAccess();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const [step, setStep] = useState<Step>(
    params.mode === "sign-up" ? "sign-up" : "sign-in",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const check = async (result: Promise<{ error: unknown }>) => {
    const { error } = await result;
    if (error) throw error;
  };
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const finish = beginTelemetry("flow", { operation: `auth_${step}`, phase: "authentication_step" });
    try {
      await action();
      finish("completed");
    } catch (e) {
      finish("failed", { reason: "authentication_error" });
      const problem = e as {
        message?: string;
        errors?: { longMessage?: string; message?: string }[];
      };
      setError(
        problem.errors?.[0]?.longMessage ??
          problem.errors?.[0]?.message ??
          problem.message ??
          "Unable to continue. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const finishSignIn = async () => {
    if (signIn.status === "complete") await check(signIn.finalize());
    else if ((signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") && signIn.supportedSecondFactors?.some(factor => factor.strategy === "email_code")) {
      await check(signIn.mfa.sendEmailCode());
      setCode("");
      setStep("email-verification");
      setMessage("");
    } else {
      setStep("extra-verification");
      setMessage(
        "Your account needs an additional security check to finish signing in.",
      );
    }
  };
  const submit = async () => {
    await setRememberSession(remember);
    if (step === "sign-in") {
      await check(signIn.password({ emailAddress: email.trim(), password }));
      setPassword("");
      await finishSignIn();
    } else if (step === "email-verification") {
      await check(signIn.mfa.verifyEmailCode({ code: code.trim() }));
      setCode("");
      await finishSignIn();
    } else if (step === "sign-up") {
      await check(
        signUp.password({
          emailAddress: email.trim(),
          password,
          legalAccepted: terms,
        }),
      );
      setPassword("");
      setRepeat("");
      if (signUp.status === "complete") await check(signUp.finalize());
      else {
        await check(signUp.verifications.sendEmailCode());
        setStep("verify");
      }
    } else if (step === "verify") {
      await check(signUp.verifications.verifyEmailCode({ code: code.trim() }));
      setCode("");
      if (signUp.status === "complete") await check(signUp.finalize());
      else {
        setStep("extra-verification");
        setMessage("Complete the remaining account verification to continue.");
      }
    } else if (step === "reset") {
      await check(signIn.create({ identifier: email.trim() }));
      await check(signIn.resetPasswordEmailCode.sendCode());
      setStep("reset-code");
    } else if (step === "reset-code") {
      await check(
        signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() }),
      );
      setCode("");
      setStep("new-password");
    } else if (step === "new-password") {
      await check(
        signIn.resetPasswordEmailCode.submitPassword({
          password,
          signOutOfOtherSessions: true,
        }),
      );
      setPassword("");
      setRepeat("");
      await finishSignIn();
    }
  };
  const openLegal = async (page: "terms-of-service" | "privacy-policy") => {
    try { await WebBrowser.openBrowserAsync(`https://clover.ph/${page}`); }
    catch { setError("Unable to open this page. Please try again."); }
  };
  const initial = step === "sign-in" || step === "sign-up";
  const passwordStep = initial || step === "new-password";
  const title = {
    "sign-in": "Welcome back",
    "sign-up": "Create your account",
    verify: "Verify your email",
    reset: "Forgot password?",
    "reset-code": "Check your email",
    "new-password": "Reset password",
    "extra-verification": "Verify your account",
    "email-verification": "Verify your account",
  }[step];
  const valid =
    step === "extra-verification"
      ? false
      : step === "verify" || step === "reset-code" || step === "email-verification"
        ? code.trim().length > 0
        : step === "reset"
          ? email.includes("@")
          : Boolean(
              password &&
              (step === "new-password" || email.includes("@")) &&
              (step !== "new-password" || password === repeat) &&
              (step !== "sign-up" || terms),
            );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      enabled={Platform.OS === "android"}
      behavior="padding"
      keyboardVerticalOffset={insets.top}
    >
    <Screen>
      <View style={{ paddingVertical: 8, maxWidth: 520, width: "100%", alignSelf: "center" }}>
        {welcomeAllowed && <Pressable accessibilityRole="button" accessibilityLabel="Back to tutorial" onPress={() => router.back()} style={{ minHeight: 44, alignSelf: "flex-start", justifyContent: "center", marginBottom: 8 }}>
          <Icon name="arrow-back" size={24} color={colors.teal} />
        </Pressable>}
        <Card style={{ borderRadius: 24 }}>
          <Image
            source={require("../assets/welcome-clover.png")}
            accessibilityLabel="Clover"
            style={{ width: 64, height: 64, alignSelf: "center" }}
            resizeMode="contain"
          />
          <Heading>{title}</Heading>
          {initial || step === "reset" ? (
            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!busy}
            />
          ) : null}
          {step === "sign-up" ? <View nativeID="clerk-captcha" /> : null}
          {passwordStep ? (
            <>
              <Field
                label={step === "new-password" ? "New password" : "Password"}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!visible}
                trailing={<Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}
                  accessibilityState={{ checked: visible }} disabled={busy} onPress={() => setVisible(v => !v)}
                  style={{ width: 44, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
                </Pressable>}
                autoCapitalize="none"
                autoComplete={
                  step === "sign-in" ? "current-password" : "new-password"
                }
                editable={!busy}
              />
              {step === "new-password" ? (
                <Field
                  label="Confirm password"
                  value={repeat}
                  onChangeText={setRepeat}
                  secureTextEntry={!visible}
                trailing={<Pressable accessibilityRole="button" accessibilityLabel={visible ? "Hide password" : "Show password"}
                  accessibilityState={{ checked: visible }} disabled={busy} onPress={() => setVisible(v => !v)}
                  style={{ width: 44, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
                </Pressable>}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!busy}
                />
              ) : null}
            </>
          ) : null}
          {step === "verify" || step === "reset-code" || step === "email-verification" ? (
            <>
              <Body>Enter the code sent to {email}.</Body>
              <Field
                label="Verification code"
                value={code}
                onChangeText={setCode}
                autoComplete="one-time-code"
                keyboardType="number-pad"
                editable={!busy}
              />
              <Button
                title="Resend code"
                secondary
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await check(
                      step === "verify"
                        ? signUp.verifications.sendEmailCode()
                        : step === "email-verification"
                          ? signIn.mfa.sendEmailCode()
                          : signIn.resetPasswordEmailCode.sendCode(),
                    );
                    setMessage("A new code was requested. Check your email.");
                  })
                }
              />
            </>
          ) : null}
          {step === "sign-in" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot password?"
              style={{ alignSelf: "flex-end", minHeight: 44, justifyContent: "center" }}
              disabled={busy}
              onPress={() => {
                setStep("reset");
                setPassword("");
                setError("");
              }}
            ><Text style={{ color: colors.teal, fontFamily: "Poppins-Medium", fontSize: 14 }}>Forgot password?</Text></Pressable>
          ) : null}
          {initial && Platform.OS !== "web" ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Switch
                accessibilityLabel="Stay signed in on this device"
                value={remember}
                onValueChange={setRemember}
                disabled={busy}
              />
              <View style={{ flex: 1 }}><Body>Stay signed in on this device</Body></View>
            </View>
          ) : null}
          {step === "sign-up" ? (
            <>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Switch
                  accessibilityLabel="Agree to terms and privacy policy"
                  value={terms}
                  onValueChange={setTerms}
                  disabled={busy}
                />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 14, lineHeight: 22 }}>
                    I agree to the <Text accessibilityRole="link" style={{ color: colors.teal, textDecorationLine: "underline" }} onPress={() => void openLegal("terms-of-service")}>Terms of Service</Text> and <Text accessibilityRole="link" style={{ color: colors.teal, textDecorationLine: "underline" }} onPress={() => void openLegal("privacy-policy")}>Privacy Policy</Text>.
                  </Text>
                </View>
              </View>
            </>
          ) : null}
          {step !== "extra-verification" ? (
            <Button
              fullWidth
              title={
                busy
                  ? "Please wait…"
                  : step === "sign-in"
                    ? "Sign In"
                    : step === "sign-up"
                      ? "Create account"
                      : "Continue"
              }
              disabled={busy || !valid}
              onPress={() => void run(submit)}
            />
          ) : (
            <AuthVerification signup={params.mode === "sign-up"} />
          )}
          {initial ? (
            <>
              {Platform.OS === "ios" ? <Button title="Sign in with Apple" fullWidth secondary leading={<Ionicons name="logo-apple" size={20} color={colors.ink} />} disabled={busy || (step === "sign-up" && !terms)} onPress={() => void run(async () => {
                await setRememberSession(remember);
                const result = await startAppleAuthenticationFlow();
                if (result.createdSessionId && result.setActive) await result.setActive({ session: result.createdSessionId });
                else if (result.signIn?.status === "needs_second_factor" || result.signUp?.status === "missing_requirements") { setStep("extra-verification"); setMessage("Complete your account verification to continue."); }
              })} /> : null}
              {(["google"] as const).map((provider) => (
                <Button
                  key={provider}
                  title="Continue with Google"
                  fullWidth
                  leading={<GoogleIcon />}
                  secondary
                  disabled={busy || (step === "sign-up" && !terms)}
                  onPress={() =>
                    void run(async () => {
                      await setRememberSession(remember);
                      const result = await startSSOFlow({
                        strategy: `oauth_${provider}`,
                      });
                      if (
                        !result.createdSessionId &&
                        result.authSessionResult?.type !== "cancel" &&
                        result.authSessionResult?.type !== "dismiss"
                      ) {
                        setStep("extra-verification");
                        setMessage(
                          "Complete your account verification to continue.",
                        );
                      }
                    })
                  }
                />
              ))}
              <Button
                title={
                  step === "sign-in"
                    ? "New to Clover? Create an account"
                    : "Already have an account? Sign in"
                }
                secondary
                disabled={busy}
                onPress={() => {
                  setStep(step === "sign-in" ? "sign-up" : "sign-in");
                  setPassword("");
                  setRepeat("");
                  setCode("");
                  setError("");
                }}
              />
            </>
          ) : (
            <Button
              title="Back to sign in"
              secondary
              disabled={busy}
              onPress={() => {
                setStep("sign-in");
                setCode("");
                setPassword("");
                setRepeat("");
                setError("");
              }}
            />
          )}
          {error ? <Notice>{error}</Notice> : null}
          {message ? <Body>{message}</Body> : null}
        </Card>
      </View>
    </Screen>
    </KeyboardAvoidingView>
  );
}
