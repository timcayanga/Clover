import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Notice, useTheme } from "./ui";
export function AdviserInputTools({
  disabled,
  onText,
  onPhoto,
}: {
  disabled: boolean;
  onText: (text: string) => void;
  onPhoto: () => void;
}) {
  const { colors } = useTheme();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (event) => {
    if (event.isFinal && event.results[0]?.transcript)
      onText(event.results[0].transcript);
  });
  useSpeechRecognitionEvent("error", () => {
    setListening(false);
    setError(
      "Voice input is unavailable. Check microphone permission or type your message.",
    );
  });
  useFocusEffect(
    useCallback(
      () => () => {
        ExpoSpeechRecognitionModule.abort();
      },
      [],
    ),
  );
  const speak = async () => {
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setError("");
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setError(
          "Allow microphone and speech recognition to dictate, or type below.",
        );
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: "en-PH",
        interimResults: false,
        continuous: false,
      });
    } catch {
      setError(
        "Speech recognition is unavailable on this device. You can still type below.",
      );
    }
  };
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Image
          source={require("../assets/organize/clover.png")}
          style={{ width: 32, height: 32, marginRight: "auto" }}
        />
        {[
          {
            label: listening ? "Stop" : "Speak",
            source: require("../assets/organize/microphone.png"),
            action: () => void speak(),
          },
          {
            label: "Take photo",
            source: require("../assets/organize/camera.png"),
            action: onPhoto,
          },
        ].map((item) => (
          <Pressable
            key={item.label}
            disabled={disabled}
            accessibilityRole="button"
            onPress={item.action}
            style={{
              minHeight: 44,
              padding: 10,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Image source={item.source} style={{ width: 24, height: 24 }} />
            <Text style={{ color: colors.ink }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {error || listening ? (
        <Notice>
          {listening ? "Listening… Review your words before sending." : error}
        </Notice>
      ) : null}
    </>
  );
}
