import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "package.json"));
const { parse } = require("@expo/plist").default;
const project = mkdtempSync(join(tmpdir(), "clover-ios-scene-check-"));

try {
  // Exercise every configured plugin against the installed SDK's real template.
  // Do not touch the developer's generated native project or copy credentials.
  for (const name of ["package.json", "package-lock.json", "app.config.ts", "assets", "plugins", "modules"]) {
    cpSync(join(root, name), join(project, name), { recursive: true });
  }
  symlinkSync(join(root, "node_modules"), join(project, "node_modules"), "dir");
  execFileSync(process.execPath, [
    require.resolve("expo/bin/cli"), "prebuild", "--platform", "ios", "--no-install",
    "--template", join(dirname(require.resolve("expo/package.json")), "template.tgz"),
    "--skip-dependency-update", "react,react-native",
  ], {
    cwd: project,
    env: { ...process.env, CI: "1", CLOVER_APP_NAME: "Clover", CLOVER_IOS_BUNDLE_ID: "ph.clover.app", CLOVER_APP_SCHEME: "clover" },
    stdio: "pipe",
    timeout: 120_000,
  });

  const native = join(project, "ios", "Clover");
  const plist = parse(readFileSync(join(native, "Info.plist"), "utf8"));
  // expo-location links CoreMotion even when Clover only requests foreground location.
  // Apple validates linked APIs during processing, so the final generated plist needs
  // a truthful purpose string without enabling motion collection or background access.
  assert.equal(typeof plist.NSMotionUsageDescription, "string");
  assert.ok(plist.NSMotionUsageDescription.trim().length > 40,
    "App Store processing requires a nonempty motion purpose for the linked location SDK");
  assert.match(plist.NSMotionUsageDescription, /does not request or collect motion/);
  assert.equal(plist.NSLocationAlwaysUsageDescription, undefined);
  assert.equal(plist.NSLocationAlwaysAndWhenInUseUsageDescription, undefined);
  assert.ok(!plist.UIBackgroundModes?.includes("location"));
  const scene = plist.UIApplicationSceneManifest;
  assert.equal(scene?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication?.[0]?.UISceneDelegateClassName,
    "EXExpoAppSceneDelegate", "iOS 27 requires a configured Expo scene delegate in the generated app");
  assert.equal(scene.UIApplicationSupportsMultipleScenes, false);
  const delegate = readFileSync(join(native, "AppDelegate.swift"), "utf8");
  assert.match(delegate, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.match(delegate, /reactNativeFactory = factory/);
  assert.doesNotMatch(delegate, /window = UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.doesNotMatch(delegate, /factory\.startReactNative\(/);
  assert.match(delegate, /open url: URL/);
  assert.match(delegate, /continue userActivity: NSUserActivity/);
  assert.ok(plist.CFBundleURLTypes.some(type => type.CFBundleURLSchemes?.includes("clover")));
  assert.ok(existsSync(join(native, "Clover.entitlements")));
  const entitlements = parse(readFileSync(join(native, "Clover.entitlements"), "utf8"));
  assert.deepEqual(entitlements["com.apple.developer.applesignin"], ["Default"]);
  console.log("iOS scene lifecycle: clean prebuild, factory wiring, deep links, permission purposes and Apple sign-in passed.");
} finally {
  rmSync(project, { recursive: true, force: true });
}
