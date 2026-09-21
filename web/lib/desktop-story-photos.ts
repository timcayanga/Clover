// Use the original photographs, never a resized export of the entire Figma frame.
// Reading gradients and current app screens are separate responsive layers.
const landing = ["01-organize", "01-organize", "02-upload", "03-picture", "04-adviser", "05-plan", "05-plan"];
const features: Record<string, string> = {
  "manage-money": "manage", "understand-your-money": "understand", "plan-ahead": "plan",
  "manage-money-together": "together", security: "security", pro: "pro",
};
export function desktopStoryPhoto(prefix: string, index: number, count: number) {
  if (prefix === "landing") return index === 7 ? "/assets/landing-story-v2/06-life.webp" : `/assets/landing-story-v3/${landing[index]}.webp`;
  return `/assets/feature-stories/${features[prefix]}-${index === count - 1 ? "end" : "hero"}.webp`;
}
