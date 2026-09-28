export function hasInternalEmail(
  emails: { emailAddress: string; verification?: { status: string } | null }[],
) {
  return emails.some(
    (email) =>
      email.emailAddress.toLowerCase() === "hello@clover.ph" &&
      email.verification?.status === "verified",
  );
}
