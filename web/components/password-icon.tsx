"use client";

type PasswordIconProps = {
  visible: boolean;
};

export function PasswordIcon({ visible }: PasswordIconProps) {
  return visible ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="clover-auth-password-toggle__icon">
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.7 4 11 7-1.3 3-5.5 7-11 7S2.3 15 1 12c1.3-3 5.5-7 11-7Zm0 2C7.9 7 4.5 9.7 3.2 12 4.5 14.3 7.9 17 12 17s7.5-2.7 8.8-5C19.5 9.7 16.1 7 12 7Zm0 2.5A2.5 2.5 0 1 1 12 14a2.5 2.5 0 0 1 0-5Z"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="clover-auth-password-toggle__icon">
      <path
        fill="currentColor"
        d="M12 5c5.5 0 9.7 4 11 7-1.3 3-5.5 7-11 7S2.3 15 1 12c1.3-3 5.5-7 11-7Zm0 2C7.9 7 4.5 9.7 3.2 12 4.5 14.3 7.9 17 12 17s7.5-2.7 8.8-5C19.5 9.7 16.1 7 12 7Zm0 2.5A2.5 2.5 0 1 1 12 14a2.5 2.5 0 0 1 0-5Z"
      />
      <path
        fill="currentColor"
        d="M4.7 12c.8 1.5 3.5 4 7.3 4 1.2 0 2.4-.2 3.4-.7l1.4 1.4c-1.3.7-2.9 1.1-4.8 1.1-5.5 0-9.7-4-11-7 .7-1.6 2.2-3.8 5-5.7l1.4 1.4C5.7 7.9 4.6 9.8 4 12Z"
      />
      <path fill="currentColor" d="M8.3 8.3A4.5 4.5 0 0 1 15.7 15.7L14.3 14.3A2.5 2.5 0 0 0 9.7 9.7L8.3 8.3Z" />
    </svg>
  );
}
