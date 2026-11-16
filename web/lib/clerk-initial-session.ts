/** A remember-me preference chooses an override; it does not invalidate a live session. */
export function selectExistingClerkSession<T extends {id: string}>(client: {sessions: T[];lastActiveSessionId: string | null}, rememberedSessionId = "") {
  return (rememberedSessionId ? client.sessions.find(session => session.id === rememberedSessionId) : null)
    ?? client.sessions.find(session => session.id === client.lastActiveSessionId)
    ?? client.sessions[0]
    ?? null;
}
