export function CloverMascot({ pose = "guiding", size = 144 }: { pose?: "welcome" | "thinking" | "guiding" | "celebrating" | "resting" | "reassuring"; size?: number }) {
  return <img className="clover-mascot" src={`/assets/mascots/${pose}.svg`} alt="" aria-hidden="true" width={size} height={size} loading="lazy" decoding="async" />;
}
