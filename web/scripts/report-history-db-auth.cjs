const Module = require("node:module"),
  load = Module._load;
Module._load = function (id, parent) {
  if (
    id === "./user-context" &&
    parent?.filename.endsWith("reports-authorization.ts")
  )
    return {
      getOrCreateCurrentUser: async () => ({
        id: "local-user",
        clerkUserId: "local-clerk",
      }),
    };
  if (id === "./auth" && parent?.filename.endsWith("reports-authorization.ts"))
    return {
      getSessionContext: async () => ({
        userId: "local-clerk",
        isGuest: false,
      }),
    };
  return load.apply(this, arguments);
};
