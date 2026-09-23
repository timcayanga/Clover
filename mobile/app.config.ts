import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: process.env.CLOVER_APP_NAME || "Clover Preview",
  slug: "clover-mobile",
  owner: "clover-innovations",
  extra: { eas: { projectId: "742a3fe2-1cb2-4d71-8ed7-bc7e2e89b0ff" } },
  scheme: process.env.CLOVER_APP_SCHEME || "clover-preview",
  version: "0.1.0",
  icon: "./assets/clover-icon-dark.png",
  userInterfaceStyle: "automatic",
  orientation: "default",
  ios: {
    bundleIdentifier: process.env.CLOVER_IOS_BUNDLE_ID || "ph.clover.preview",
    appleTeamId: "6XX38GYURG",
    supportsTablet: true,
    // SQLCipher adds bundled cryptography; complete Apple’s export declaration for release.
  },
  android: {
    package: process.env.CLOVER_ANDROID_PACKAGE_ID || "ph.clover.preview",
    allowBackup: false,
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#F7F9FA",
        image: "./assets/splash-brand.png",
        imageWidth: 220,
        resizeMode: "contain",
      },
    ],
    "expo-localization",
    ["expo-build-properties", { android: { minSdkVersion: 26 } }],
    ["expo-sqlite", { useSQLCipher: true }],
    "./plugins/with-unique-pod-uuids.cjs",
    "./plugins/with-quoted-ios-paths.cjs",
    "expo-secure-store",
    "expo-web-browser",
    "expo-sharing",
    "expo-font",
    ["@clerk/expo", { appleSignIn: false }],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose an account photo, receipt, or financial screenshot for Clover.",
        cameraPermission: "Take a photo of a receipt to import into Clover.",
        microphonePermission:
          "Use your microphone to dictate a Clover message.",
      },
    ],
    "expo-document-picker",
    [
      "expo-speech-recognition",
      {
        microphonePermission:
          "Use your microphone to dictate a Clover message.",
        speechRecognitionPermission:
          "Turn your spoken words into a draft you can review before sending.",
      },
    ],
  ],
  web: { bundler: "metro", output: "single" },
};
export default config;
