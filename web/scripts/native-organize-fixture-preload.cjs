const Module = require("module");
const load = Module._load;
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
      verifyToken: async (token) => {
        if (token !== "native-fixture-token")
          throw Error("Invalid fixture token");
        return {
          sub: "native-gap-fixture-user",
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
