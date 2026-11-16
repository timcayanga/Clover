/** Server-side age avoids comparing the device clock with the database clock.
 * confirmedAt is set during confirmation, just before the commit is published. */
export function importCommitAgeMs(confirmedAt: unknown, visibleRows: unknown, now = Date.now()) {
  if (!(Number(visibleRows) > 0)) return undefined;
  const stamp = confirmedAt instanceof Date ? +confirmedAt : typeof confirmedAt === "string" ? Date.parse(confirmedAt) : NaN;
  return Number.isFinite(stamp) && stamp <= now ? now - stamp : undefined;
}

export function importPollTimings(commitAgeMs: unknown, roundTripMs: number) {
  if (typeof commitAgeMs !== "number" || !Number.isFinite(commitAgeMs) || commitAgeMs < 0) return {};
  const roundTrip = Number.isFinite(roundTripMs) ? Math.max(0, roundTripMs) : 0;
  return {
    commit_to_poll_ms: commitAgeMs,
    commit_to_poll_upper_ms: commitAgeMs + roundTrip,
    polling_round_trip_ms: roundTrip,
  };
}

export function importPresentationTimings(observedAt: number, noticedAt: number, mountedAt?: number) {
  return {
    poll_to_first_visible_row_ms: observedAt >= noticedAt ? observedAt - noticedAt : undefined,
    poll_to_row_mount_ms: mountedAt !== undefined && mountedAt >= noticedAt ? mountedAt - noticedAt : undefined,
    row_visible_before_commit_notice: observedAt < noticedAt,
  };
}
