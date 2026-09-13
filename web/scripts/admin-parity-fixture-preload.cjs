const Module = require("module");
const original = Module._load;
const db = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["127.0.0.1", "localhost"].includes(db.hostname) || !db.pathname.endsWith("_qa")) throw Error("Isolated local QA database required");
globalThis.__fixtureMailCount = 0;
globalThis.__fixtureMailFails = false;
globalThis.__adminFixtureIdentity = "user_qaOwnerOne";
Module._load = function(id) {
 const value = original.apply(this, arguments);
 if (id === "nodemailer") return { ...value, createTransport: () => ({ sendMail: async () => { globalThis.__fixtureMailCount++; if (globalThis.__fixtureMailFails) throw Error("Fixture timeout"); return { accepted: ["fixture@example.invalid"] }; }, close: () => {} }) };
 if (id === "@clerk/nextjs/server") return { ...value, auth: async () => ({ userId: globalThis.__adminFixtureIdentity }), clerkClient: async () => ({ users: { getUser: async id => ({ id, emailAddresses: [] }) } }) };
 if (id === "next/headers") return { ...value, headers: async () => new Headers({ host: "staging.clover.ph" }), cookies: async () => ({ get: () => undefined }) };
 if (id === "next/cache") return { ...value, revalidatePath: () => {}, revalidateTag: () => {}, updateTag: () => {}, unstable_cache: fn => fn };
 return value;
};
