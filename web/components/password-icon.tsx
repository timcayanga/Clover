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
        d="M12 5c5.5 0 9.7 4 11 7-1.3 3-5.5 7-11 7S2.3 15 1 12c1.3-3 5.5-7 11-7Zm0 2C7.9 7 4.5 9.7 3.2 12 4.5 14.3 7.9 17 12 17s7.5-2.7 8.8-5C19.5 9.7 16.1 7 12 7Z"
      />
      <path
        fill="currentColor"
        d="M6.2 12c1 1.5 3.3 3.5 5.8 3.5 2.4 0 4.7-2 5.8-3.5-1-1.5-3.3-3.5-5.8-3.5-2.4 0-4.7 2-5.8 3.5Zm5.8-1a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
      />
      <path fill="currentColor" d="M7.5 9.2 9.1 10.8A4 4 0 0 1 14.8 14.8l1.6 1.6A6.4 6.4 0 0 0 7.5 9.2Z" />
    </svg>
  );
}
