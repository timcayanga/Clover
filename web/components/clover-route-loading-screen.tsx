import { CloverLoadingTitle } from "@/components/clover-loading-title";
import { CloverLoadingMark } from "@/components/clover-loading-mark";

type CloverRouteLoadingScreenProps = {
  label?: string;
  prompt?: boolean;
  viewport?: boolean;
};

export function CloverRouteLoadingScreen({
  label = "page",
  prompt = false,
  viewport = false,
}: CloverRouteLoadingScreenProps) {
  return (
    <div
      className={`clover-loading-screen${prompt ? " clover-loading-screen--prompt" : ""}${viewport ? " clover-loading-screen--viewport" : ""}`}
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
