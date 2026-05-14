import { getSessionContext } from "@/lib/auth";
import { syncClerkUser } from "@/lib/clerk";

export type PublicAccountState = {
  signedIn: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

export const resolvePublicAccountState = async (): Promise<PublicAccountState> => {
  try {
    const session = await getSessionContext();
    if (session.isGuest) {
      return {
        signedIn: false,
        displayName: null,
        avatarUrl: null,
      };
    }

    const user = await syncClerkUser(session.userId);
    const displayName = user.firstName ?? user.email?.split("@")[0] ?? "Account";

    return {
      signedIn: true,
      displayName,
      avatarUrl: user.imageUrl ?? null,
    };
  } catch {
    return {
      signedIn: false,
      displayName: null,
      avatarUrl: null,
    };
  }
};
