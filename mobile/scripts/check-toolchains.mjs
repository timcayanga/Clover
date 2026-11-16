import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const run = (name, args) => spawnSync(name, args, { encoding: "utf8" });
const xcode = run("xcodebuild", ["-version"]);
const java = run("java", ["-version"]);
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.env.HOME ? join(process.env.HOME, "Library/Android/sdk") : "");
const android = Boolean(
  java.status === 0 && sdk && existsSync(join(sdk, "platform-tools", "adb")),
);
console.log(
  `iOS local build: ${xcode.status === 0 ? "Xcode available" : "Install full Xcode 26.4+ and an iOS Simulator runtime; Command Line Tools alone are insufficient."}`,
);
console.log(
  `Android local build: ${android ? "Java and Android SDK available" : "Install Android Studio, JDK 17+, SDK platform 36, platform-tools, and one emulator image. Set ANDROID_HOME."}`,
);
console.log(
  "No Apple/Google paid membership is needed for local simulator/emulator work. Store signing and distribution remain separate.",
);
process.exitCode = xcode.status === 0 && android ? 0 : 1;
