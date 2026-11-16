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
    "$(PRODUCT_MODULE_NAME).SceneDelegate", "iOS 27 requires a configured Expo scene delegate in the generated app");
  assert.equal(scene.UIApplicationSupportsMultipleScenes, false);
  const delegate = readFileSync(join(native, "AppDelegate.swift"), "utf8");
  assert.match(delegate, /class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider/);
  assert.match(delegate, /reactNativeFactory = factory/);
  assert.doesNotMatch(delegate, /window = UIWindow\(frame: UIScreen\.main\.bounds\)/);
  assert.doesNotMatch(delegate, /factory\.startReactNative\(/);
  const sceneDelegate = readFileSync(join(native, "SceneDelegate.swift"), "utf8");
  assert.match(sceneDelegate, /class SceneDelegate: ExpoAppSceneDelegate/);
  const expoScene = readFileSync(join(dirname(require.resolve("expo/package.json")), "ios/Expo/ExpoAppSceneDelegate.swift"), "utf8");
  assert.match(expoScene, /openURLContexts/);
  assert.match(expoScene, /continue userActivity: NSUserActivity/);
  assert.ok(plist.CFBundleURLTypes.some(type => type.CFBundleURLSchemes?.includes("clover")));
  assert.ok(existsSync(join(native, "Clover.entitlements")));
  const entitlements = parse(readFileSync(join(native, "Clover.entitlements"), "utf8"));
  assert.deepEqual(entitlements["com.apple.developer.applesignin"], ["Default"]);
  assert.deepEqual(plist.UIApplicationShortcutItems.map(item => item.UIApplicationShortcutItemType),
    ["expense", "receipt", "transactions", "ask"].map(action => `ph.clover.launcher.${action}`));
  const widgetDir = join(project, "ios", "CloverQuickActions");
  const extensionPlist = parse(readFileSync(join(widgetDir, "CloverQuickActions-Info.plist"), "utf8"));
  const widgetEntitlements = parse(readFileSync(join(widgetDir, "CloverQuickActions.entitlements"), "utf8"));
  assert.deepEqual(entitlements["com.apple.security.application-groups"], ["group.ph.clover.app.widgets"]);
  assert.deepEqual(widgetEntitlements["com.apple.security.application-groups"], entitlements["com.apple.security.application-groups"]);
  assert.equal(plist.CloverWidgetGroup, entitlements["com.apple.security.application-groups"][0]);
  assert.equal(extensionPlist.NSExtension.NSExtensionPointIdentifier, "com.apple.widgetkit-extension");
  const { project: parseProject } = require("xcode");
  const xcode = parseProject(join(project, "ios", "Clover.xcodeproj", "project.pbxproj")).parseSync();
  const objects = xcode.hash.project.objects;
  const host = xcode.getFirstTarget().firstTarget;
  const widget = Object.values(objects.PBXNativeTarget).find(item => item?.productName === '"CloverQuickActions"');
  assert(widget, "The generated project must have a WidgetKit target");
  assert(host.dependencies.some(ref =>
    objects.PBXTargetDependency[ref.value]?.target_comment?.includes("CloverQuickActions")));
  assert(host.buildPhases.some(ref => ref.comment === "Embed Clover Widget"));
  const resources = widget.buildPhases.flatMap(ref => objects.PBXResourcesBuildPhase?.[ref.value]?.files ?? []);
  for (const name of ["mark.png", "bpi.png", "waves_large.png", "Poppins-SemiBold.ttf"]) {
    assert(existsSync(join(widgetDir, name)));
    assert(resources.some(ref => ref.comment.startsWith(name)), `Missing widget bundle resource: ${name}`);
  }
  console.log("iOS scene lifecycle: clean prebuild, factory wiring, deep links, permission purposes, Apple sign-in and embedded WidgetKit target passed.");
} finally {
  rmSync(project, { recursive: true, force: true });
}
