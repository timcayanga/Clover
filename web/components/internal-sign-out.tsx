"use client";
import { SignOutButton } from "@clerk/nextjs";
export function InternalSignOut({ label = "Sign out" }: { label?: string }) {
  return (
    <SignOutButton redirectUrl="/office/sign-in">
      <button
        type="button"
        style={{
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          textDecoration: "underline",
        }}
      >
        {label}
      </button>
    </SignOutButton>
  );
}
