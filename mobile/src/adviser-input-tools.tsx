import { beginTelemetry } from "../../shared/analytics";
import { speechLocale, speechErrorMessage } from "../../shared/speech-input";
import { getLocales } from "expo-localization";
import { Text, TextInput } from "./app-text";
import { useSession } from "./session";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState, useRef } from "react";
import { Image, Linking, Platform, Pressable, View } from "react-native";
import { Button, Icon, Notice, useTheme } from "./ui";
// Speech recognition is a single native service, even when several screens stay mounted.
let activeSpeechOwner: symbol | null = null;
export function AdviserInputTools({
  disabled,
  onText,
  onPhoto,
  onDeviceOnly = false,
  value,
  onChangeText,
  onSend,
  placeholder = "Ask Clover",
  expanded = false,
  active = true,
}: {
  placeholder?: string;
  expanded?: boolean;
  active?: boolean;
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
  const owner = useRef(Symbol("clover-dictation")).current;
  const starting = useRef(false);
  const delivered = useRef(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [inputHeight, setInputHeight] = useState(44);
  useEffect(() => { if (!value) setInputHeight(44); }, [value]);
  const cancel = useCallback(() => {
    if (activeSpeechOwner !== owner) return;
    activeSpeechOwner = null;
    starting.current = false;
    setListening(false);
    inputFlow.current?.("canceled", { reason: "screen_left" });
    ExpoSpeechRecognitionModule.abort();
  }, [owner]);
  useSpeechRecognitionEvent("start", () => { if (activeSpeechOwner === owner) { starting.current = false; setListening(true); } });
  useSpeechRecognitionEvent("end", () => {
    if (activeSpeechOwner !== owner) return;
    inputFlow.current?.("canceled", { reason: "no_result" });
    activeSpeechOwner = null; starting.current = false; setListening(false);
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (activeSpeechOwner === owner && !delivered.current && event.isFinal && event.results[0]?.transcript) {
      delivered.current = true;
      inputFlow.current?.("completed");
      onText(event.results[0].transcript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (activeSpeechOwner !== owner) return;
    inputFlow.current?.(event.error === "aborted" ? "canceled" : "failed", { reason: event.error });
    activeSpeechOwner = null; starting.current = false;
    setListening(false);
    setError(speechErrorMessage(event.error));
    setShowSettings(["not-allowed", "language-not-supported", "service-not-allowed"].includes(event.error));
  });
  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => { if (!active || disabled) cancel(); }, [active, disabled, cancel]);
  const speak = async () => {
    if (!active || disabled || starting.current) return;
    if (listening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    if (activeSpeechOwner) { setError(speechErrorMessage("busy")); return; }
    activeSpeechOwner = owner; starting.current = true; delivered.current = false;
    setError("");
    setShowSettings(false);
    inputFlow.current = beginTelemetry("input", { input_method: "microphone", local_only: onDeviceOnly || !offlineStatus.online });
    try {
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (activeSpeechOwner !== owner) return;
      if (!permission.granted) {
        inputFlow.current?.("failed", { reason: "permission_denied" });
        setError(speechErrorMessage("not-allowed")); setShowSettings(true);
        activeSpeechOwner = null; starting.current = false;
        return;
      }
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        inputFlow.current?.("failed", { reason: "service_unavailable" });
        setError(speechErrorMessage("service-not-allowed")); setShowSettings(true);
        activeSpeechOwner = null; starting.current = false;
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
        activeSpeechOwner = null; starting.current = false;
        return;
      }
      const supported = Platform.OS === "web" ? { locales: [], installedLocales: [] } :
        await ExpoSpeechRecognitionModule.getSupportedLocales({}).catch(() => ({ locales: [], installedLocales: [] }));
      if (activeSpeechOwner !== owner) return;
      if (requiresLocal && Platform.OS === "android" && !supported.installedLocales.length) {
        inputFlow.current?.("failed", { reason: "local_language_unavailable" });
        setError("Download a dictation language in your device settings to use voice input offline."); setShowSettings(true);
        activeSpeechOwner = null; starting.current = false;
        return;
      }
      ExpoSpeechRecognitionModule.start({
        requiresOnDeviceRecognition: requiresLocal,
        lang: speechLocale(getLocales().map(locale => locale.languageTag), requiresLocal && Platform.OS === "android" ? supported.installedLocales : supported.locales),
        interimResults: false,
        continuous: false,
        contextualStrings: ["Clover", "BPI", "GCash", "Maya", "Metrobank", "RCBC"],
      });
    } catch {
      if (activeSpeechOwner !== owner) return;
      inputFlow.current?.("failed", { reason: "unavailable" });
      activeSpeechOwner = null; starting.current = false;
      setError(speechErrorMessage("unknown"));
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
            minHeight: expanded ? 96 : 56,
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
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            value={value}
            onChangeText={onChangeText}
            maxLength={4000}
            editable={!disabled}
            multiline
            numberOfLines={1}
            onContentSizeChange={event => {
              if (!value.trim()) return;
              const height = Math.max(44, Math.min(expanded ? 84 : 96, event.nativeEvent.contentSize.height));
              setInputHeight(current => current === height ? current : height);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 44,
              height: value.trim() ? inputHeight : 44,
              maxHeight: expanded ? 84 : 96,
              textAlignVertical: "center",
              textAlign: "center",
              includeFontPadding: false,
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
      {showSettings ? <Button textOnly title="Open Settings" onPress={() => void Linking.openSettings().catch(() => setError("Open your device Settings and allow microphone and speech recognition for Clover."))} /> : null}
    </>
  );
}
