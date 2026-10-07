const poses = { welcome: "welcome", thinking: "thinking", guiding: "statement", celebrating: "wave", resting: "thinking", reassuring: "thinking", savings: "savings", compact: "compact" } as const;
export function CloverMascot({ pose = "guiding", size = 112 }: { pose?: keyof typeof poses; size?: number }) {
  return <img className="clover-mascot" src={`/assets/mascots/velvet-${poses[pose]}.webp`} alt="" aria-hidden="true" width={size} height={size} decoding="async" />;
}
