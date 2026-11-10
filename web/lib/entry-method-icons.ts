import { getNavigationIconSrc } from "./navigation-icons";

const syncIcon = "/assets/organize/method-sync.png";

const entryMethodIcons = {
  manual: "/assets/organize/method-manual.png",
  ask: getNavigationIconSrc("adviser"),
  upload: "/assets/organize/method-upload.png",
  connect: syncIcon,
  sync: syncIcon,
};

export type EntryMethod = keyof typeof entryMethodIcons;

export function getEntryMethodIconSrc(method: EntryMethod) {
  return entryMethodIcons[method];
}
