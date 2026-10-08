const poses = { reports: "reports", investments: "investments", accounts: "accounts", banks: "banks", circles: "circles", receipt: "receipt", calendar: "calendar", budget: "budget", chat: "chat", manual: "manual", notfound: "notfound", error: "error",  welcome: "welcome", thinking: "thinking", guiding: "statement", celebrating: "wave", resting: "thinking", reassuring: "thinking", savings: "savings", compact: "compact" } as const;
export function CloverMascot({ pose = "guiding", size = 112 }: { pose?: keyof typeof poses; size?: number }) {
  return <img className="clover-mascot" src={`/assets/mascots/velvet-${poses[pose]}.webp`} alt="" aria-hidden="true" width={size} height={size} decoding="async" />;
}
