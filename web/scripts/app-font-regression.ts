import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAppFont } from "../../mobile/src/app-font";

assert.equal(resolveAppFont({}), "Poppins-Regular");
assert.equal(resolveAppFont({}, "Poppins-Medium"), "Poppins-Medium", "Nested text preserves its parent's face.");
assert.equal(resolveAppFont({ fontWeight: "400" }, "Poppins-SemiBold"), "Poppins-Regular");
assert.equal(resolveAppFont({ fontWeight: "500" }), "Poppins-Medium");
assert.equal(resolveAppFont({ fontWeight: "600" }), "Poppins-SemiBold");
assert.equal(resolveAppFont({ fontWeight: "bold" }), "Poppins-Bold");
assert.equal(resolveAppFont({ fontFamily: "monospace", fontWeight: "700" }), "monospace");

const root = resolve(process.cwd(), "..");
const layout = readFileSync(resolve(root, "mobile/app/_layout.tsx"), "utf8");
const registered = new Set([...layout.matchAll(/"(Poppins-[^"]+)": require/g)].map(match => match[1]));
function scan(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.tsx?$/.test(path)) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/fontFamily:\s*["'](Poppins[^"']+)["']/g)) {
        assert.ok(registered.has(match[1]), `${path} references an unregistered font: ${match[1]}`);
      }
    }
  }
}
scan(resolve(root, "mobile/app"));
scan(resolve(root, "mobile/src"));
console.log("App font regression passed: registered faces, nested text, explicit families and weights.");
