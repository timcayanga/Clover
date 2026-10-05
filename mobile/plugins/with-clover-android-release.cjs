const { withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");
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

module.exports = config => {
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
