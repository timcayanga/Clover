// Base fills of Clover's category icon artwork, before gradients and shadows.
const categoryIconColors = new Map<string, string>([
  ["income", "#4ADE80"],
  ["food & dining", "#FDBA74"],
  ["transport", "#BAE6FD"],
  ["housing", "#991B1B"],
  ["bills & utilities", "#FACC15"],
  ["travel & lifestyle", "#FEF08A"],
  ["entertainment", "#A78BFA"],
  ["shopping", "#FB923C"],
  ["subscriptions", "#DDD6FE"],
  ["health & wellness", "#F87171"],
  ["education", "#60A5FA"],
  ["financial", "#6B21A8"],
  ["cash & atm", "#BBF7D0"],
  ["gifts & donations", "#F9A8D4"],
  ["business", "#2563EB"],
  ["transfers", "#5EEAD4"],
  ["other", "#B45309"],
  ["groceries", "#FBAC58"],
  ["medical", "#EF646D"],
  ["salary", "#22C55E"],
  ["investments", "#15803D"],
  ["uncategorized", "#94A3B8"],
  ["children", "#FDA4AF"],
  ["utilities", "#FACC15"],
  ["investment", "#15803D"],
]);

export function categoryIconColor(name: string): string {
  return categoryIconColors.get(name.trim().toLowerCase()) ?? "#94A3B8";
}
