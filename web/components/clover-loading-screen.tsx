import { CloverLoadingTitle } from "@/components/clover-loading-title";
import { CloverLoadingMark } from "@/components/clover-loading-mark";

type CloverLoadingScreenProps = {
  label?: string;
};

export function CloverLoadingScreen({ label = "page" }: CloverLoadingScreenProps) {
  return (
    <div className="clover-loading-screen" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="clover-loading-screen__card">
        <div className="clover-loading-screen__logo" aria-hidden="true">
          <span className="clover-loading-screen__orbit clover-loading-screen__orbit--outer" />
          <span className="clover-loading-screen__orbit clover-loading-screen__orbit--inner" />
          <CloverLoadingMark />
        </div>

        <div className="clover-loading-screen__copy">
          <CloverLoadingTitle />
          <div className="clover-loading-screen__meter" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}
