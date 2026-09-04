import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
};

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), "package.json"), "utf8")
) as PackageManifest;

assert.equal(
  manifest.dependencies?.prisma,
  undefined,
  "The Prisma CLI is a build tool and must not be classified as a production dependency."
);
assert.ok(
  manifest.devDependencies?.prisma,
  "The Prisma CLI must remain available as a development dependency for migrations and client generation."
);
assert.equal(
  manifest.overrides?.mysql2,
  "3.24.3",
  "Prisma's transitive MySQL driver must remain pinned to the audited release until Prisma ships an equivalent patch."
);

console.log("Dependency boundary regression passed.");
