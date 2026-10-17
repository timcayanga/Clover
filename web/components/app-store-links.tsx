import styles from "./app-store-links.module.css";

function StoreArrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>;
}

export function StoreAvailability() {
  return (
    <div
      className={styles.links}
      aria-label="Available on iOS and Android"
    >
      <a
        href="https://apps.apple.com/ph/app/clover-personal-finance/id6811711508"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download Clover on the App Store"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.7 12.7c0-2 1.6-3 1.7-3.1-1-1.4-2.5-1.6-3-1.6-1.3-.2-2.6.8-3.3.8-.7 0-1.8-.8-3-.8-1.5 0-2.8.8-3.6 2.1-1.5 2.6-.4 6.5 1.1 8.6.7 1 1.5 2.1 2.6 2.1 1.1 0 1.5-.7 2.9-.7s1.8.7 3 .7 1.9-1 2.6-2c.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.2-.8-2.2-3.6ZM14.5 6.6c.6-.8 1.1-1.8 1-2.9-1 .1-2.1.7-2.8 1.4-.6.7-1.2 1.7-1.1 2.8 1.1.1 2.2-.5 2.9-1.3Z"
          />
        </svg>
        iOS
        <StoreArrow />
      </a>
      <a
        href="https://play.google.com/store/apps/details?id=ph.clover.app"
        aria-label="Get Clover on Google Play"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="m17.5 7 1.4-2.4-.9-.5-1.4 2.4a9.9 9.9 0 0 0-9.2 0L6 4.1l-.9.5L6.5 7A8.4 8.4 0 0 0 3 14h18a8.4 8.4 0 0 0-3.5-7ZM7.5 11a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm9 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM4 15h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
          />
        </svg>
        Android
        <StoreArrow />
      </a>
    </div>
  );
}
