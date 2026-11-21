import { useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { geometricCover, groupCoverIndex, resolvedGroupCover } from "../../shared/split-group-cover";
import { apiBase } from "./api-base";

const covers = [
  require("../assets/split-group-covers/shape-0.jpg"),
  require("../assets/split-group-covers/shape-1.jpg"),
  require("../assets/split-group-covers/shape-2.jpg"),
  require("../assets/split-group-covers/shape-3.jpg"),
  require("../assets/split-group-covers/shape-4.jpg"),
  require("../assets/split-group-covers/shape-5.jpg"),
  require("../assets/split-group-covers/shape-6.jpg"),
  require("../assets/split-group-covers/shape-7.jpg"),
];
export function GroupCover({ id, url, style }: { id: string; url?: string | null; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState<string>();
  const cover = resolvedGroupCover(id, url);
  const index = covers.findIndex((_, i) => geometricCover(i) === cover || apiBase() + geometricCover(i) === cover);
  const source = index >= 0 ? covers[index] : failed === cover ? covers[groupCoverIndex(id)] :
    { uri: cover.startsWith("/") ? apiBase() + cover : cover };
  return <Image source={source} resizeMode="cover" style={style} onError={() => setFailed(cover)} />;
}
