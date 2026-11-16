import { deployMigrations } from "./migration-runner";

if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
  try {
    process.exitCode = deployMigrations(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Migration setup failed.");
    process.exitCode = 1;
  }
}
