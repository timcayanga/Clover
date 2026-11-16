const { withFinalizedMod } = require("expo/config-plugins");
const { readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

// Android crops the outer 18dp of a 108dp adaptive layer. A proportional inset
// keeps the existing symbol at the approved size across launcher icon sizes.
// This changes only launcher resources, preserving the separate splash artwork.
function insetForeground(xml) {
  const foreground = '<foreground android:drawable="@mipmap/ic_launcher_foreground"/>';
  const inset = '<foreground><inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.6667%"/></foreground>';
  if (xml.includes(inset)) return xml;
  if (!xml.includes(foreground)) throw new Error("Clover adaptive icon foreground was not generated as expected.");
  return xml.replace(foreground, inset);
}

module.exports = config => withFinalizedMod(config, ["android", async config => {
  for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const file = path.join(config.modRequest.platformProjectRoot, "app/src/main/res/mipmap-anydpi-v26", name);
    await writeFile(file, insetForeground(await readFile(file, "utf8")));
  }
  return config;
}]);
module.exports.insetForeground = insetForeground;
