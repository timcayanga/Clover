"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type OnboardingStatus = "checking" | "ready";

export const useOnboardingAccess = () => {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const response = await fetch("/api/me");

      if (cancelled) {
        return;
      }

      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }

      if (!response.ok) {
        router.replace("/onboarding");
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!payload?.user?.onboardingCompletedAt) {
        router.replace("/onboarding");
        return;
      }

      setStatus("ready");
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return status;
};
