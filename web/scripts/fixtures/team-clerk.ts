// Test adapter only; bundled exclusively by the API regression runner.
export const fixture: {
  user: null | {
    id: string;
    emailAddresses: {
      emailAddress: string;
      verification: { status: string };
    }[];
  };
} = { user: null };
export async function currentUser() {
  return fixture.user;
}

export async function clerkClient() {
  return {users: {getUserList: async () => ({data: fixture.user ? [fixture.user] : []})}};
}
