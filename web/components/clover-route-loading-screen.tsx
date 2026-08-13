import { CloverLoadingTitle } from "@/components/clover-loading-title";
import { CloverLoadingMark } from "@/components/clover-loading-mark";

type CloverRouteLoadingScreenProps = {
  label?: string;
  prompt?: boolean;
};

export function CloverRouteLoadingScreen({ label = "page", prompt = false }: CloverRouteLoadingScreenProps) {
  return (
    <div
      className={`clover-loading-screen${prompt ? " clover-loading-screen--prompt" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={`Loading ${label}`}
    >
      <div className="clover-loading-screen__card">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <CloverLoadingMark />
        </div>

        <div className="clover-loading-screen__copy">
          <CloverLoadingTitle />
        </div>
      </div>
    </div>
  );
}
