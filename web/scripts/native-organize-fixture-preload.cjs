const Module = require("module");
const load = Module._load;
const fixtureIdentity = { firstName: "Connect", lastName: "Fixture" };
const database = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.endsWith("_qa")
)
  throw Error("Fixture preload requires an isolated local QA database");
Module._load = function (id, parent, main) {
  const value = load.apply(this, arguments);
  if (id === "@clerk/nextjs/server")
    return {
      ...value,
      clerkClient: async () => ({
        users: {
          getUser: async (id) => {
            if (id !== "connect-fixture-user")
              throw Error("Fixture identity unavailable");
            return {
              id,
              ...fixtureIdentity,
              emailAddresses: [
                {
                  emailAddress: "connect-fixture@example.invalid",
                  verification: { status: "verified" },
                },
              ],
              imageUrl: null,
            };
          },
          updateUser: async (id, data) => {
            if (id !== "connect-fixture-user")
              throw Error("Fixture identity unavailable");
            Object.assign(fixtureIdentity, data);
            return { id, ...fixtureIdentity };
          },
        },
      }),
      verifyToken: async (token) => {
        if (!["native-fixture-token", "connect-fixture-token"].includes(token))
          throw Error("Invalid fixture token");
        return {
          sub:
            token === "connect-fixture-token"
              ? "connect-fixture-user"
              : "native-gap-fixture-user",
          sid: "fixture-session",
          sts: "active",
        };
      },
    };
  if (id === "next/cache")
    return {
      ...value,
      revalidatePath: () => {},
      revalidateTag: () => {},
      updateTag: () => {},
      unstable_cache: (fn) => fn,
    };
  return value;
};
