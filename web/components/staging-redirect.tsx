"use client";

import { useEffect } from "react";

export function StagingRedirect() {
  useEffect(() => {
    if (window.location.hostname === "staging.clover.ph") {
      window.location.replace("/dashboard");
    }
  }, []);

  return null;
}
