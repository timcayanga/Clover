export const CIRCLE_INVITATION_DURATION_DAYS = 14;

const circleInvitationTokenPattern = /^[a-f0-9]{48}$/;

export const isCircleInvitationToken = (value: unknown): value is string =>
  typeof value === "string" && circleInvitationTokenPattern.test(value);

export const getCircleInvitationPath = (
  token: string,
  options: { accept?: boolean } = {},
) =>
  `/circles/join/${encodeURIComponent(token)}${options.accept ? "?accept=1" : ""}`;

export const getCircleInviteeDisplayName = (email: string, name?: string | null) =>
  name?.trim() || email.split("@")[0] || "Circle member";
