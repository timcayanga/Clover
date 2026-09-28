import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
// Use the bundler already supplied by our declared tsx dependency, including
// installations that do not hoist transitive packages into node_modules.
const runnerRequire = createRequire(__filename);
const { build } = createRequire(runnerRequire.resolve("tsx/package.json"))(
  "esbuild",
);
async function main() {
  if (
    !process.env.DATABASE_URL?.startsWith(
      "postgresql://clover_test@127.0.0.1:55432/",
    )
  )
    throw new Error("Use the disposable local PostgreSQL test database.");
  const web = path.resolve(__dirname, "..");
  const directory = path.join(web, ".cache", "team-api-tests");
  await mkdir(directory, { recursive: true });
  const media = process.argv.includes("--media");
  const agents = process.argv.includes("--agents");
  const outfile = path.join(
    directory,
    agents ? "agents.cjs" : media ? "media.cjs" : "run.cjs",
  );
  try {
    await build({
      entryPoints: [
        path.join(
          __dirname,
          agents
            ? "team-agent-regression.case.ts"
            : media
              ? "team-media-regression.case.ts"
              : "team-api-regression.case.ts",
        ),
      ],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      tsconfig: path.join(web, "tsconfig.json"),
      alias: {
        ...(media
          ? {
              "@aws-sdk/client-s3": path.join(__dirname, "fixtures/team-s3.ts"),
              "@aws-sdk/s3-request-presigner": path.join(
                __dirname,
                "fixtures/team-presigner.ts",
              ),
            }
          : {}),
        "@clerk/nextjs/server": path.join(__dirname, "fixtures/team-clerk.ts"),
        "next/headers": path.join(__dirname, "fixtures/team-headers.ts"),
      },
    });
    const result = spawnSync(process.execPath, [outfile], {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        CLOVER_STUDIO_DESIGN_PREVIEW: "1",
      },
    });
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(outfile, { force: true });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
