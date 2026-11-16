import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createAdaptiveIconXmlString } = require("@expo/prebuild-config/build/plugins/icons/withAndroidIcons.js");
const { insetForeground } = require("../plugins/with-clover-adaptive-icon.cjs");
const xml = createAdaptiveIconXmlString(null, null);
const inset = insetForeground(xml);
assert.match(inset, /<background android:drawable="@color\/iconBackground"\/>/);
assert.match(inset, /<foreground><inset android:drawable="@mipmap\/ic_launcher_foreground" android:inset="16\.6667%"\/><\/foreground>/);
assert.equal(insetForeground(inset), inset, "Repeated prebuilds must not keep shrinking the icon");
assert.throws(() => insetForeground("<unexpected/>"), /not generated as expected/);
// A 60%-width mark inside the inset layer occupies 60% of the visible mask.
for (const size of [48, 72, 108, 192]) {
  assert.ok(Math.abs(size * (1 - 0.166667 * 2) * 0.6 / (size * 72 / 108) - 0.6) < 0.00001);
}
console.log("Android launcher: generated Expo resource, mask padding and repeated prebuilds passed.");
