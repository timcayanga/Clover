type CloverRouteLoadingScreenProps = {
  label?: string;
};

const loadingCopy = {
  headline: "Loading your next financial move",
  detail: "Clover is gathering the details so you can keep moving with confidence.",
} as const;

export function CloverRouteLoadingScreen({ label = "page" }: CloverRouteLoadingScreenProps) {
  return (
    <div className="clover-loading-screen" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="clover-loading-screen__card glass">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <img className="clover-loading-screen__mark" src="/clover-mark.svg" alt="" loading="eager" fetchPriority="high" />
        </div>

        <div className="clover-loading-screen__copy">
          <p className="eyebrow">Loading {label}</p>
          <h2>{loadingCopy.headline}</h2>
          <p>{loadingCopy.detail}</p>
        </div>
      </div>
    </div>
  );
}
