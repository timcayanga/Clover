import { Text } from "./app-text";
import { useEffect, useState } from "react";
import { Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { avatarGradient } from "../../shared/visual-identity";
export function PersonAvatar({
  name,
  imageUrl,
  size = 36,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  return (
    <LinearGradient
      colors={avatarGradient(name)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {imageUrl && !failed ? (
        <Image
          source={{ uri: imageUrl }}
          onError={() => setFailed(true)}
          style={{ width: size, height: size }}
        />
      ) : (
        <Text
          style={{
            fontFamily: "Poppins-Medium",
            color: "#17363D",
            fontSize: 13,
          }}
        >
          {name
            .trim()
            .split(/\s+/)
            .map((n) => n[0])
            .slice(0, 2)
            .join("")}
        </Text>
      )}
    </LinearGradient>
  );
}
