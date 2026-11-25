const { resolve, join } = require("node:path");
const { withDisposablePostgres, web } = require("./disposable-postgres.cjs");

const [batch, output, ...extra] = process.argv.slice(2);
if (!batch || !output || extra.length)
  throw Error("Expected a reviewed batch directory and a new output directory");
withDisposablePostgres(({ run, storage }) =>
  run(
    process.execPath,
    [
      join(web, "node_modules/tsx/dist/cli.mjs"),
      "scripts/receipt-training-worker.ts",
      resolve(batch),
      resolve(output),
    ],
    { CLOVER_IMPORT_STORAGE_DIR: storage },
    false,
    0,
  ),
).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
