// A group's opaque ID gives it the same cover after refresh and on other devices.
export function groupCoverIndex(id: string) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 8;
}
export function groupCoverUrl(id: string) {
  return geometricCover(groupCoverIndex(id));
}

export const coverNames = ["Circles", "Peaks", "Arches", "Stripes", "Orbits", "Triangles", "Half Moons", "Diagonals"];
export const geometricCover = (index: number) => `/assets/split-group-covers/shape-${index}.jpg`;
export function resolvedGroupCover(id: string, stored?: string | null) {
  const url = stored?.trim();
  if (!url || /^(?:https:\/\/(?:staging\.)?clover\.ph)?\/assets\/(?:profiles\/avatar_\d+\.png|split-group-covers\/cover-\d+\.jpg)$/i.test(url))
    return geometricCover(groupCoverIndex(id));
  return url;
}
