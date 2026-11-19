/** Name-only/invited people share bills without needing a Clover sign-in. */
export function circleBillMembers(
  members: { id: string; displayName: string; status?: string }[],
) {
  return members
    .filter(
      (member) =>
        member.status === undefined ||
        member.status === "active" ||
        member.status === "invited",
    )
    .map((member, sortOrder) => ({
      id: member.id,
      name: member.displayName,
      sortOrder,
    }));
}
export function circleBillContextReady(
  circle: { detailsLoaded?: boolean } | null | undefined,
  loading: boolean,
) {
  return Boolean(circle && circle.detailsLoaded !== false && !loading);
}
