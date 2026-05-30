import { CloverLoadingTitle } from "@/components/clover-loading-title";

type CloverRouteLoadingScreenProps = {
  label?: string;
};

export function CloverRouteLoadingScreen({ label = "page" }: CloverRouteLoadingScreenProps) {
  return (
    <div className="clover-loading-screen" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="clover-loading-screen__card">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <img className="clover-loading-screen__mark" src="/assets/logos/Logos%20V3/logo_color.svg" alt="" loading="eager" fetchPriority="high" />
        </div>

        <div className="clover-loading-screen__copy">
          <CloverLoadingTitle />
        </div>
      </div>
    </div>
  );
}
