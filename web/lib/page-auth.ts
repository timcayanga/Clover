import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

export type PageSessionContext = Awaited<ReturnType<typeof getSessionContext>>;

export const getPageSessionContext = async (): Promise<PageSessionContext> => {
  try {
    return await getSessionContext();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/sign-in");
    }

    if (error instanceof Error && error.message === "ADMIN_ONLY") {
      redirect("/admin");
    }

    throw error;
  }
};
