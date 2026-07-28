import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../assets/", import.meta.url));
const destinationRoot = fileURLToPath(new URL("../public/assets/", import.meta.url));

const main = async () => {
  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    throw new Error(`Canonical asset source is not a directory: ${sourceRoot}`);
  }

  // public/assets is a disposable build artifact. Recreate it to avoid stale files.
  await rm(destinationRoot, { recursive: true, force: true });
  await mkdir(destinationRoot, { recursive: true });
  await cp(sourceRoot, destinationRoot, { recursive: true, force: true });
};

void main();
