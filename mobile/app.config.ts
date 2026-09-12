import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Clover Preview",
  slug: "clover-mobile",
  scheme: "clover-preview",
  version: "0.1.0",
  icon: "./assets/clover-icon.png",
  userInterfaceStyle: "automatic",
  orientation: "default",
  ios: {
    bundleIdentifier: "ph.clover.preview",
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "ph.clover.preview",
    allowBackup: false,
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    "expo-router",
    "./plugins/with-unique-pod-uuids.cjs",
    "expo-secure-store",
    "expo-web-browser",
    "expo-font",
    ["@clerk/expo", { appleSignIn: false }],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose a receipt or financial screenshot to import into Clover.",
        cameraPermission: "Take a photo of a receipt to import into Clover.",
        microphonePermission: false,
      },
    ],
    "expo-document-picker",
    ["expo-speech-recognition", { microphonePermission: "Use your microphone to dictate a Clover message.", speechRecognitionPermission: "Turn your spoken words into a draft you can review before sending." }],
  ],
  web: { bundler: "metro", output: "single" },
};
export default config;
