"use client";

type ErrorRecoveryScreenProps = {
  errorCode?: string;
  recoveryHref: string;
  recoveryLabel: string;
  onRefresh?: () => void;
};

export function ErrorRecoveryScreen({
  errorCode,
  recoveryHref,
  recoveryLabel,
  onRefresh,
}: ErrorRecoveryScreenProps) {
  const refreshPage = () => {
    if (onRefresh) {
      onRefresh();
      return;
    }

    window.location.reload();
  };

  return (
    <main className="error-screen">
      <section className="error-screen__card" aria-labelledby="error-screen-title">
        {/* A native image keeps the recovery UI independent of Next image services. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="error-screen__art"
          src="/assets/error-clover.webp"
          alt=""
          width={360}
          height={360}
        />
        <div className="error-screen__copy">
          <p className="eyebrow">Something went wrong</p>
          <h1 id="error-screen-title">Please try again.</h1>
          <p>Refresh this page to continue. If the issue persists, share the reference code with Clover Support.</p>
          {errorCode ? (
            <p className="error-screen__code" aria-label={`Error reference ${errorCode}`}>
              Reference: <strong>{errorCode}</strong>
            </p>
          ) : null}
          <div className="error-screen__actions">
            <button className="button button-primary" type="button" onClick={refreshPage}>
              Refresh page
            </button>
            <a className="button button-secondary" href={recoveryHref}>
              {recoveryLabel}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
