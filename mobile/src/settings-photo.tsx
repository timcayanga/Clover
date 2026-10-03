import { useEffect, useRef, useState } from "react";
import { Image, View, Pressable } from "react-native";
import { useUser } from "@clerk/expo";
import * as ImagePicker from "expo-image-picker";
import { useSession } from "./session";
import { removeUploadCopy } from "./upload";
import { Body, Button, Card, Notice, Icon, useTheme } from "./ui";
export function SettingsPhoto() {
  return useSession().demo ? null : <PhotoControls />;
}
function PhotoControls() {
  const { user } = useUser();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; data: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [remove, setRemove] = useState(false);
  const pending = useRef(false);
  useEffect(
    () => () => {
      if (photo) removeUploadCopy(photo.uri);
    },
    [photo],
  );
  const choose = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled) return;
      const selected = result.assets[0];
      if (!selected.base64 || selected.base64.length > 4 * 1024 * 1024) {
        removeUploadCopy(selected.uri);
        throw new Error("Choose a smaller photo (under 3 MB).");
      }
      setPhoto({
        uri: selected.uri,
        data: `data:image/jpeg;base64,${selected.base64}`,
      });
      setRemove(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to choose photo.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const save = async (deleting: boolean) => {
    if (!user || pending.current || (!deleting && !photo)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await user.setProfileImage({ file: deleting ? null : photo!.data });
      await user.reload();
      setPhoto(null);
      setRemove(false);
      setMessage(deleting ? "Photo removed." : "Photo updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update photo.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <Card style={{ borderRadius: 16 }}>
      <Body>Photo</Body>
      <View style={{ alignSelf: "center" }}>
      {photo?.uri || user?.imageUrl ? (
        <Image
          accessibilityLabel="Account photo"
          source={{ uri: photo?.uri ?? user!.imageUrl }}
          style={{
            width: 112,
            height: 112,
            borderRadius: 24,
            alignSelf: "center",
          }}
        />
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Edit photo" onPress={() => setEditing(v => !v)} style={{ position: "absolute", right: -12, top: -12, padding: 12, borderRadius: 24, backgroundColor: colors.white }}><Icon line name="pencil" size={20}/></Pressable>
      </View>
      {editing ? <Button title="Update photo" textOnly disabled={busy || !user} onPress={() => void choose()} /> : null}
      {photo ? (
        <>
          <Button
            title="Save photo"
            textOnly
            disabled={busy}
            onPress={() => void save(false)}
          />
          <Button
            title="Cancel"
            textOnly
            secondary
            disabled={busy}
            onPress={() => setPhoto(null)}
          />
        </>
      ) : editing && user?.hasImage ? (
        <Button
          title="Remove photo"
          textOnly danger
          secondary
          disabled={busy}
          onPress={() => setRemove(true)}
        />
      ) : null}
      {remove ? (
        <>
          <Body>Remove your account photo?</Body>
          <Button
            title="Confirm removal"
            textOnly danger
            disabled={busy}
            onPress={() => void save(true)}
          />
          <Button
            title="Cancel"
            textOnly
            secondary
            disabled={busy}
            onPress={() => setRemove(false)}
          />
        </>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Body>{message}</Body> : null}
    </Card>
  );
}
