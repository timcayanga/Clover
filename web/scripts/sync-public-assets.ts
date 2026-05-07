import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const sourceRoot = path.resolve(cwd, "..", "assets");
const destinationRoot = path.resolve(cwd, "public", "assets");

const copyDirectoryIfPresent = async (sourceDir: string, destinationDir: string) => {
  try {
    const sourceStats = await stat(sourceDir);
    if (!sourceStats.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  await mkdir(destinationDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryIfPresent(sourcePath, destinationPath);
      continue;
    }

    if (!entry.isFile() && !entry.isSymbolicLink()) {
      continue;
    }

    try {
      const destinationStats = await stat(destinationPath);
      const sourceStats = await stat(sourcePath);
      if (destinationStats.ino === sourceStats.ino && destinationStats.dev === sourceStats.dev) {
        continue;
      }
    } catch {
      // The destination may not exist yet, which is fine.
    }

    await mkdir(path.dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }
};

const main = async () => {
  try {
    await mkdir(destinationRoot, { recursive: true });

    const sourceEntries = await readdir(sourceRoot, { withFileTypes: true });
    for (const entry of sourceEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      await copyDirectoryIfPresent(path.join(sourceRoot, entry.name), path.join(destinationRoot, entry.name));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }
};

void main();
