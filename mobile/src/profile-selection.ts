/** Resolve only profiles authorized by the current bootstrap. */
export function selectRecentProfile(profiles: readonly { id: string }[], current = "", remembered = "") {
  return profiles.find(profile => profile.id === current)?.id
    ?? profiles.find(profile => profile.id === remembered)?.id
    ?? profiles[0]?.id
    ?? "";
}
