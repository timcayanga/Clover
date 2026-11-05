const { withAndroidManifest, withAppBuildGradle, withGradleProperties, withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

const registration = `
// Clover: bounded profile-photo decoding and Android 15 window compatibility.
androidComponents.onVariants(androidComponents.selector().all()) { variant ->
    variant.instrumentation.transformClassesWith(
        ph.clover.build.CloverCompatibilityFactory,
        com.android.build.api.instrumentation.InstrumentationScope.ALL
    ) {}
}
`;

function configureGradle(source) {
  if (!source.includes('getDefaultProguardFile("proguard-android')) {
    throw new Error("Review Clover release optimization for the new Expo Gradle template.");
  }
  source = source.replaceAll('getDefaultProguardFile("proguard-android.txt")',
    'getDefaultProguardFile("proguard-android-optimize.txt")');
  return source.includes("ph.clover.build.CloverCompatibilityFactory") ? source : source + registration;
}

function configureOptionalLocation(manifest) {
  // Location only assists a receipt upload. Permission-implied hardware must
  // never prevent installing Clover on tablets or phones without a provider.
  const optional = new Set([
    "android.hardware.location",
    "android.hardware.location.gps",
    "android.hardware.location.network",
  ]);
  manifest["uses-feature"] = [
    ...(manifest["uses-feature"] || []).filter(feature => !optional.has(feature.$?.["android:name"])),
    ...Array.from(optional, name => ({ $: { "android:name": name, "android:required": "false" } })),
  ];
  return manifest;
}

function configureLegacyCameraStorage(manifest) {
  // The SDK's external camera contract requires WRITE permission on API 26–28.
  // Retain that compatibility only there; API 29+ camera and system file/photo
  // pickers do not need broad storage access. Override SDK manifests' maxSdk=32.
  manifest.$ = { ...manifest.$, "xmlns:tools": "http://schemas.android.com/tools" };
  manifest["uses-permission"] = [
    ...(manifest["uses-permission"] || []).filter(item => item.$?.["android:name"] !== "android.permission.WRITE_EXTERNAL_STORAGE"),
    { $: { "android:name": "android.permission.WRITE_EXTERNAL_STORAGE", "android:maxSdkVersion": "28", "tools:replace": "android:maxSdkVersion" } },
  ];
  return manifest;
}

function configureOptimizationProperties(properties) {
  const settings = {
    "android.r8.optimizedResourceShrinking": "true",
    "android.enableR8.fullMode": "true",
  };
  return [
    ...properties.filter(item => item.type !== "property" || !(item.key in settings)),
    ...Object.entries(settings).map(([key, value]) => ({ type: "property", key, value })),
  ];
}

module.exports = config => {
  config = withGradleProperties(config, config => {
    // AGP 8.12 supports this pipeline, but doesn't enable it by default.
    config.modResults = configureOptimizationProperties(config.modResults);
    return config;
  });
  config = withAndroidManifest(config, config => {
    configureOptionalLocation(config.modResults.manifest);
    configureLegacyCameraStorage(config.modResults.manifest);
    return config;
  });
  config = withAppBuildGradle(config, config => {
    config.modResults.contents = configureGradle(config.modResults.contents);
    return config;
  });
  return withDangerousMod(config, ["android", async config => {
    const project = config.modRequest.projectRoot;
    const android = config.modRequest.platformProjectRoot;
    // These are small, reviewed compatibility shims for the pinned SDKs. Fail
    // closed on upgrades so an upstream fix can replace them, rather than drift.
    const rn = JSON.parse(await fs.readFile(path.join(project, "node_modules/react-native/package.json")));
    const clerk = await fs.readFile(path.join(project, "node_modules/@clerk/expo/android/build.gradle"), "utf8");
    if (rn.version !== "0.86.3" || !clerk.includes('clerkAndroidApiVersion = "1.1.5"')) {
      throw new Error("Review the Clover Android compatibility shims after the React Native/Clerk upgrade.");
    }
    const files = {
      "buildSrc/build.gradle": "build.gradle",
      "buildSrc/src/main/java/ph/clover/build/CloverCompatibilityFactory.java": "CloverCompatibilityFactory.java",
      "buildSrc/src/main/java/ph/clover/build/CloverCompatibilityVisitor.java": "CloverCompatibilityVisitor.java",
      "app/src/main/java/ph/clover/compat/AndroidCompatibility.java": "AndroidCompatibility.java",
    };
    for (const [target, source] of Object.entries(files)) {
      const destination = path.join(android, target);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(path.join(__dirname, "android-release", source), destination);
    }
    return config;
  }]);
};
module.exports.configureGradle = configureGradle;
module.exports.configureOptionalLocation = configureOptionalLocation;
module.exports.configureOptimizationProperties = configureOptimizationProperties;
module.exports.configureLegacyCameraStorage = configureLegacyCameraStorage;
