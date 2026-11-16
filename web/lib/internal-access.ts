import { currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasInternalEmail } from "@/lib/internal-permissions";

// APIs always require a real Clerk identity, including local and preview deployments.
export async function requireInternalApiAccess() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!hasInternalEmail(user.emailAddresses)) throw new Error("FORBIDDEN");
  return {
    userId: user.id,
    email: "hello@clover.ph",
    localPreview: false as const,
  };
}

export async function requireInternalAccess() {
  // Preview deployments must authenticate too. Only a local development server gets a design preview.
  const hostname = ((await headers()).get("host") ?? "").split(":")[0];
  if (
    process.env.NODE_ENV === "development" &&
    process.env.CLOVER_STUDIO_DESIGN_PREVIEW === "1" &&
    ["localhost", "127.0.0.1"].includes(hostname)
  ) {
    return {
      userId: "local-design-preview",
      email: "Local design preview",
      localPreview: true,
    };
  }
  try {
    return await requireInternalApiAccess();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED")
      redirect("/office/sign-in");
    if (error instanceof Error && error.message === "FORBIDDEN")
      redirect("/office/access-denied");
    throw error;
  }
}
