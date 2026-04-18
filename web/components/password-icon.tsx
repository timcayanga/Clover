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
        d="M2.1 4.3 3.5 2.9l17.6 17.6-1.4 1.4-2.7-2.7C15.5 20.4 13.9 21 12 21 6.5 21 2.3 17 1 14c.7-1.6 2.2-3.8 5-5.7L2.1 4.3ZM6.9 9.1c-1.9 1.3-3.3 2.9-3.9 4 1.3 2.3 4.7 5 8.9 5 1.2 0 2.3-.2 3.3-.6l-1.9-1.9a2.5 2.5 0 0 1-3.3-3.3L6.9 9.1Zm4.2-3.1c4.1 0 8.3 3.4 9.7 6.1-.5 1-1.3 2.2-2.5 3.4l-1.5-1.5c.9-.9 1.6-1.8 2-2.4C17.5 9.3 14.1 6.8 11 6.8c-.5 0-1 0-1.5.1l-2-2c1.1-.5 2.4-.8 3.6-.9ZM12 9.5a2.5 2.5 0 0 1 2.4 3.1l-2.9-2.9c.2-.1.3-.2.5-.2Z"
      />
    </svg>
  );
}
