// A group's opaque ID gives it the same cover after refresh and on other devices.
export function groupCoverIndex(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 8;
}
export function groupCoverUrl(id: string) {
  return `/assets/split-group-covers/cover-${groupCoverIndex(id)}.jpg`;
}
