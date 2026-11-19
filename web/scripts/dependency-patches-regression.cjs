const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const cwd = path.resolve(__dirname, "..");
// Run the vulnerable shape in a disposable child: never block the gate process.
const control = spawnSync(process.execPath, ["-e", String.raw`
  /^[\s\S]*?:[\s\S]*?:[\s\S]*?X$/.test(":".repeat(10000));
`], { cwd, timeout: 500, encoding: "utf8" });
assert.equal(control.error?.code, "ETIMEDOUT", "ReDoS control must reproduce the blocked event loop");
const patched = spawnSync(process.execPath, ["-e", String.raw`
  const assert = require("node:assert/strict");
  const { createRequire } = require("node:module");
  const prismaRequire = createRequire(require.resolve("@prisma/config"));
  assert.equal(prismaRequire("effect/package.json").version, "3.22.1");
  const S = prismaRequire("effect/Schema");
  const schema = S.TemplateLiteral(S.String, ":", S.String, ":", S.String, "X");
  const decode = S.decodeUnknownSync(schema), is = S.is(schema);
  for (const input of ["a:b:cX", ":X", ":a:X", "one\ntwo:three:fourX"]) {
    if (input === ":X") { assert.equal(is(input), false); continue; }
    assert.equal(decode(input), input);
  }
  assert.equal(is(":".repeat(40000)), false);
  assert.equal(decode(":".repeat(40000) + "X"), ":".repeat(40000) + "X");
`], { cwd, timeout: 3000, encoding: "utf8", maxBuffer: 65536 });
assert.ifError(patched.error);
assert.equal(patched.status, 0, patched.stderr);
console.log("PASS actual Prisma Effect dependency: bounded ReDoS control, long invalid/valid templates and ordinary/newline decoding");
