"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn, useSignUp } from "@clerk/nextjs";

type ClerkAuthScreenProps = {
  enabled: boolean;
  mode: "sign-in" | "sign-up";
};

type SocialStrategy = "oauth_google" | "oauth_facebook";

const socialProviders: Array<{
  label: string;
  strategy: SocialStrategy;
  icon: "google" | "facebook";
}> = [
  {
    label: "Google",
    strategy: "oauth_google",
    icon: "google",
  },
  {
    label: "Facebook",
    strategy: "oauth_facebook",
    icon: "facebook",
  },
];

const completeRedirectUrl = "/dashboard";
const callbackUrl = "/sso-callback";

function formatError(error: unknown) {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="clover-auth-button__icon">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.2 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.153 7.962 3.038l5.657-5.657C34.442 6.053 29.525 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z" />
      <path fill="#FF3D00" d="M6.306 14.691 12.876 19.5C14.654 15.004 19.045 12 24 12c3.059 0 5.842 1.153 7.962 3.038l5.657-5.657C34.442 6.053 29.525 4 24 4c-7.682 0-14.378 4.327-17.694 10.691Z" />
      <path fill="#4CAF50" d="M24 44c5.42 0 10.255-1.958 14.04-5.179l-6.487-5.47C29.583 34.951 26.98 36 24 36c-5.178 0-9.621-3.319-11.287-7.946l-6.522 5.03C9.465 40.556 16.12 44 24 44Z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a11.99 11.99 0 0 1-3.75 5.351l.003-.002 6.487 5.47C37.58 36.891 44 31 44 24c0-1.341-.138-2.65-.389-3.917Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="clover-auth-button__icon">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.875 11.844v-8.39H7.078V12h3.047V9.356c0-3.008 1.793-4.668 4.533-4.668 1.312 0 2.684.234 2.684.234v2.953h-1.514c-1.49 0-1.953.925-1.953 1.874V12h3.324l-.531 3.454h-2.793v8.39A12.001 12.001 0 0 0 24 12Z"
      />
    </svg>
  );
}

function SocialIcon({ provider }: { provider: "google" | "facebook" }) {
  return provider === "google" ? <GoogleIcon /> : <FacebookIcon />;
}

export function ClerkAuthScreen({ enabled, mode }: ClerkAuthScreenProps) {
  const router = useRouter();
  const auth = useAuth();
  const signInState = useSignIn();
  const signUpState = useSignUp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [phase, setPhase] = useState<"form" | "verify-email">("form");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState<SocialStrategy | null>(null);

  const isReady = auth.isLoaded && signInState.isLoaded && signUpState.isLoaded;

  useEffect(() => {
    if (auth.isLoaded && auth.isSignedIn) {
      router.replace(completeRedirectUrl);
    }
  }, [auth.isLoaded, auth.isSignedIn, router]);

  useEffect(() => {
    setPhase("form");
    setVerificationCode("");
    setError(null);
    setNotice(null);
    setBusy(false);
    setSocialBusy(null);
    setEmail("");
    setPassword("");
  }, [mode]);

  if (!enabled) {
    return (
      <section className="glass" style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
        <p className="eyebrow">Authentication setup</p>
        <h1>Clerk is not configured for this environment yet.</h1>
        <p>
          Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to the staging
          environment, then redeploy to enable the auth form.
        </p>
      </section>
    );
  }

  if (!isReady) {
    return (
      <section className="clover-auth-card glass">
        <div className="clover-auth-card__brand">
          <img className="clover-auth-card__logo" src="/clover-mark.svg" alt="Clover" />
        </div>
        <p className="clover-auth-card__loading">Loading secure sign-in...</p>
      </section>
    );
  }

  const submitSignIn = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await signInState.signIn.create({
        strategy: "password",
        identifier: email.trim(),
        password,
      });

      if (response.status === "complete" && response.createdSessionId) {
        await signInState.setActive({
          session: response.createdSessionId,
          redirectUrl: completeRedirectUrl,
        });
        return;
      }

      setError("Sign-in needs an additional step. Please try another method or contact support.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitSignUp = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await signUpState.signUp.create({
        emailAddress: email.trim(),
        password,
      });

      if (response.status === "complete" && response.createdSessionId) {
        await signUpState.setActive({
          session: response.createdSessionId,
          redirectUrl: completeRedirectUrl,
        });
        return;
      }

      if (response.unverifiedFields.includes("email_address")) {
        await signUpState.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setPhase("verify-email");
        setNotice(`We sent a verification code to ${email.trim()}.`);
        return;
      }

      if (response.missingFields.length > 0) {
        setError("Please complete the remaining required sign-up fields.");
        return;
      }

      setError("We couldn't finish your sign-up. Please try again.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyEmailCode = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const response = await signUpState.signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (response.status === "complete" && response.createdSessionId) {
        await signUpState.setActive({
          session: response.createdSessionId,
          redirectUrl: completeRedirectUrl,
        });
        return;
      }

      setError("That code didn’t work. Please try again.");
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    if (mode === "sign-in") {
      await submitSignIn();
      return;
    }

    if (phase === "verify-email") {
      await verifyEmailCode();
      return;
    }

    await submitSignUp();
  };

  const handleSocialLogin = async (strategy: SocialStrategy) => {
    setError(null);
    setNotice(null);
    setSocialBusy(strategy);

    try {
      if (mode === "sign-in") {
        await signInState.signIn.authenticateWithRedirect({
          strategy,
          redirectUrl: callbackUrl,
          redirectUrlComplete: completeRedirectUrl,
          continueSignIn: true,
          continueSignUp: true,
        });
        return;
      }

      await signUpState.signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: callbackUrl,
        redirectUrlComplete: completeRedirectUrl,
        continueSignIn: true,
        continueSignUp: true,
      });
    } catch (err) {
      setError(formatError(err));
      setSocialBusy(null);
    }
  };

  const title = mode === "sign-in" ? "Welcome back" : "Sign Up";
  const subtitle =
    mode === "sign-in"
      ? "Sign in to pick up where you left off."
      : "";
  const footerText =
    mode === "sign-in" ? (
      <>
        New to Clover? <Link className="clover-auth-card__link" href="/sign-up">Create an account</Link>
      </>
    ) : (
      <>
        Already have an account? <Link className="clover-auth-card__link" href="/sign-in">Sign In</Link>
      </>
    );

  return (
    <section className="clover-auth-card glass">
      <div className="clover-auth-card__brand">
        <img className="clover-auth-card__logo" src="/clover-mark.svg" alt="Clover" />
      </div>

      <header className="clover-auth-card__header">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>

      <form className="clover-auth-card__form" onSubmit={handleSubmit}>
        {phase === "form" ? (
          <>
            <label className="clover-auth-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="clover-auth-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button className="clover-auth-primary" type="submit" disabled={busy}>
              {busy ? "Please wait..." : mode === "sign-in" ? "Sign In" : "Continue"}
            </button>
          </>
        ) : (
          <>
            <label className="clover-auth-field">
              <span>Verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter the 6-digit code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                required
              />
            </label>

            <button className="clover-auth-primary" type="submit" disabled={busy}>
              {busy ? "Verifying..." : "Verify email"}
            </button>

            <button
              className="clover-auth-secondary"
              type="button"
              disabled={busy}
              onClick={async () => {
                setError(null);
                setNotice(null);
                setBusy(true);
                try {
                  await signUpState.signUp.prepareEmailAddressVerification({ strategy: "email_code" });
                  setNotice(`We sent a new verification code to ${email.trim()}.`);
                } catch (err) {
                  setError(formatError(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resend code
            </button>
          </>
        )}
      </form>

      {error ? <p className="clover-auth-card__message clover-auth-card__message--error">{error}</p> : null}
      {notice ? <p className="clover-auth-card__message clover-auth-card__message--notice">{notice}</p> : null}

      <div className="clover-auth-card__divider">
        <span>or continue with</span>
      </div>

      <div className="clover-auth-card__socials">
        {socialProviders.map((provider) => (
          <button
            key={provider.strategy}
            type="button"
            className="clover-auth-social"
            disabled={socialBusy !== null || busy}
            onClick={() => {
              void handleSocialLogin(provider.strategy);
            }}
          >
            <SocialIcon provider={provider.icon} />
            <span>{socialBusy === provider.strategy ? "Connecting..." : provider.label}</span>
          </button>
        ))}
      </div>

      <footer className="clover-auth-card__footer">{footerText}</footer>
    </section>
  );
}
