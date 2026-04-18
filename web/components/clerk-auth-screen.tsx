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
    <svg viewBox="0 0 24 24" aria-hidden="true" className="clover-auth-button__icon">
      <path
        fill="#4285F4"
        d="M21.35 11.1h-9.18v2.92h5.26c-.23 1.38-1.6 4.05-5.26 4.05-3.16 0-5.74-2.62-5.74-5.84s2.58-5.84 5.74-5.84c1.8 0 3 .77 3.69 1.43l2.51-2.42C16.52 3.87 14.62 3 12.17 3 6.98 3 2.8 7.18 2.8 12.37S6.98 21.74 12.17 21.74c5.41 0 9-3.8 9-9.14 0-.61-.07-1.09-.17-1.5Z"
      />
      <path fill="#EA4335" d="M3.92 7.73 7.1 10.05A5.78 5.78 0 0 1 12.17 3c1.8 0 3 .77 3.69 1.43l2.51-2.42C16.52 3.87 14.62 3 12.17 3 8.55 3 5.4 5.03 3.92 7.73Z" />
      <path fill="#FBBC05" d="M12.17 21.74c2.3 0 4.23-.76 5.63-2.08l-2.6-2.13c-.72.5-1.7.87-3.03.87-2.33 0-4.31-1.56-5.02-3.66l-3.13 2.42c1.44 2.79 4.37 4.58 8.15 4.58Z" />
      <path fill="#34A853" d="M12.17 8.47c1.04 0 1.98.36 2.72 1.07l2.03-1.97C15.16 5.88 13.9 5.2 12.17 5.2c-2.62 0-4.84 1.73-5.56 4.05l3.13 2.42c.48-1.46 1.82-3.2 2.43-3.2Z" />
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

  const title = mode === "sign-in" ? "Welcome back" : "Create your account";
  const subtitle =
    mode === "sign-in"
      ? "Sign in to pick up where you left off."
      : "Set up your Clover account in a few quick steps.";
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
        <p>{subtitle}</p>
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
