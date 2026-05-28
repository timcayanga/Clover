type CloverRouteLoadingScreenProps = {
  label?: string;
};

const loadingTitles = [
  "Bringing your money into focus",
  "Finding clarity in your cash flow",
  "Getting your finances ready",
  "Building your next money move",
] as const;

export function CloverRouteLoadingScreen({ label = "page" }: CloverRouteLoadingScreenProps) {
  return (
    <div className="clover-loading-screen" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="clover-loading-screen__card">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <img className="clover-loading-screen__mark" src="/clover-splash-logo.svg" alt="" loading="eager" fetchPriority="high" />
        </div>

        <div className="clover-loading-screen__copy">
          <h2>
            {loadingTitles.map((title) => (
              <span key={title}>{title}</span>
            ))}
          </h2>
        </div>
      </div>
    </div>
  );
}
