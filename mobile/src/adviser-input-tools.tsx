import { beginTelemetry } from "../../shared/analytics";
import { Text, TextInput } from "./app-text";
import { useSession } from "./session";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useFocusEffect } from "expo-router";
import { useCallback, useState, useRef } from "react";
import { Image, Pressable, View } from "react-native";
import { Icon, Notice, useTheme } from "./ui";
export function AdviserInputTools({
  disabled,
  onText,
  onPhoto,
  onDeviceOnly = false,
  value,
  onChangeText,
  onSend,
}: {
  value?: string;
  onChangeText?: (value: string) => void;
  onSend?: () => void;
  onDeviceOnly?: boolean;
  disabled: boolean;
  onText: (text: string) => void;
  onPhoto: () => void;
}) {
  const { colors } = useTheme();
  const { offlineStatus } = useSession();
  const inputFlow = useRef<ReturnType<typeof beginTelemetry> | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => { inputFlow.current?.("canceled", { reason: "no_result" }); setListening(false); });
  useSpeechRecognitionEvent("result", (event) => {
    if (event.isFinal && event.results[0]?.transcript) {
      inputFlow.current?.("completed");
      onText(event.results[0].transcript);
    }
  });
  useSpeechRecognitionEvent("error", () => {
    inputFlow.current?.("failed", { reason: "recognition_error" });
    setListening(false);
    setError(
      "Voice input is unavailable. Check microphone permission or type your message.",
    );
  });
  useFocusEffect(
    useCallback(
      () => () => {
        inputFlow.current?.("canceled", { reason: "screen_left" });
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
    inputFlow.current = beginTelemetry("input", { input_method: "microphone", local_only: onDeviceOnly || !offlineStatus.online });
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        inputFlow.current?.("failed", { reason: "permission_denied" });
        setError(
          "Allow microphone and speech recognition to dictate, or type below.",
        );
        return;
      }
      const onDevice =
        ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      const requiresLocal = onDeviceOnly || !offlineStatus.online;
      if (requiresLocal && !onDevice) {
        inputFlow.current?.("failed", { reason: "local_unavailable" });
        setError(
          "Offline dictation is unavailable on this device. Type your message, or connect to use voice input.",
        );
        return;
      }
      ExpoSpeechRecognitionModule.start({
        requiresOnDeviceRecognition: requiresLocal,
        lang: "en-PH",
        interimResults: false,
        continuous: false,
      });
    } catch {
      inputFlow.current?.("failed", { reason: "unavailable" });
      setError(
        "Speech recognition is unavailable on this device. You can still type below.",
      );
    }
  };
  return (
    <>
      {value !== undefined ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            minHeight: 56,
            padding: 6,
            borderRadius: 28,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.white,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload files"
            disabled={disabled || listening}
            onPress={onPhoto}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="add" color={colors.ink} size={24} />
          </Pressable>
          <TextInput
            accessibilityLabel="Ask Clover"
            placeholder="Ask Clover"
            placeholderTextColor={colors.muted}
            value={value}
            onChangeText={onChangeText}
            maxLength={4000}
            editable={!disabled}
            multiline
            numberOfLines={1}
            style={{
              flex: 1,
              minWidth: 0,
              height: 44,
              paddingVertical: 8,
              color: colors.ink,
              fontFamily: "Poppins-Regular",
              fontSize: 15,
              lineHeight: 22,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              listening
                ? "Stop dictation"
                : value.trim()
                  ? "Send question"
                  : "Speak"
            }
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={listening || !value.trim() ? () => void speak() : onSend}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor:
                value.trim() && !listening ? colors.teal : "transparent",
              alignItems: "center",
              justifyContent: "center",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {listening ? (
              <Icon name="stop" size={20} />
            ) : value.trim() ? (
              <Icon name="arrow-up" color="#FFFFFF" size={22} />
            ) : (
              <Image
                source={require("../assets/organize/microphone.png")}
                style={{ width: 24, height: 24 }}
              />
            )}
          </Pressable>
        </View>
      ) : (
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
                minHeight: 40,
                padding: 8,
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
      )}
      {error || listening ? (
        <Notice>
          {listening ? "Listening… Review your words before sending." : error}
        </Notice>
      ) : null}
    </>
  );
}
