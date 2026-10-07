const Module = require("node:module"),
  original = Module._load;
const state = {
  user: "owner-a",
  transactions: [],
  links: [],
  locks: 0,
  next: 0,
};
globalThis.__recoveryFixture = state;
const scalar = (value, condition) =>
  condition && typeof condition === "object"
    ? "in" in condition
      ? condition.in.includes(value)
      : "not" in condition
        ? value !== condition.not
        : "contains" in condition
          ? String(value ?? "")
              .toLowerCase()
              .includes(condition.contains.toLowerCase())
          : match(value, condition)
    : value === condition;
const match = (row, w) =>
  Object.entries(w).every(([key, value]) =>
    key === "AND"
      ? (Array.isArray(value) ? value : [value]).every((x) => match(row, x))
      : key === "OR"
        ? value.some((x) => match(row, x))
        : scalar(row?.[key], value),
  );
const db = {
  user: {
    findUniqueOrThrow: async () => ({
      regionalPreferences: { timezone: "UTC" },
    }),
  },
  workspace: {
    findFirst: async ({ where }) =>
      where.id === `profile-${where.user.clerkUserId.at(-1)}`
        ? { id: where.id }
        : null,
  },
  transaction: {
    findMany: async ({ where, skip = 0, take = Infinity }) =>
      state.transactions
        .filter((r) => match(r, where))
        .slice(skip, skip + take),
  },
  reportRecovery: {
    findMany: async ({ where }) => state.links.filter((r) => match(r, where)),
    create: async ({ data }) => {
      const r = { ...data, id: "link-" + ++state.next };
      state.links.push(r);
      return r;
    },
    deleteMany: async ({ where }) => {
      const removed = state.links.filter((r) => match(r, where));
      state.links = state.links.filter((r) => !removed.includes(r));
      return { count: removed.length };
    },
  },
  $queryRaw: async (parts, id) => {
    if (!parts.join("").includes("FOR UPDATE") || !id.startsWith("profile-"))
      throw Error("Expected Profile lock");
    state.locks++;
    return [];
  },
};
let queue = Promise.resolve();
db.$transaction = (fn) => {
  const n = queue.then(() => fn(db));
  queue = n.catch(() => {});
  return n;
};
Module._load = function (id, parent) {
  if (id.endsWith("/prisma")) return { prisma: db };
  if (
    id === "./user-context" &&
    parent?.filename.endsWith("reports-authorization.ts")
  )
    return { getOrCreateCurrentUser: async (id) => ({ id, clerkUserId: id }) };
  if (id === "./auth" && parent?.filename.endsWith("reports-authorization.ts"))
    return {
      getSessionContext: async () => {
        if (!state.user) throw Error("Unauthorized");
        return { userId: state.user, isGuest: false };
      },
    };
  return original.apply(this, arguments);
};
