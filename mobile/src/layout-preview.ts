/** Sample records only. Native release builds and public websites cannot opt in. */
export function allowLayoutPreview(enabled: boolean, platform: string, development: boolean, hostname = "") {
  if (!enabled) return false;
  return platform === "web" ? ["localhost", "127.0.0.1"].includes(hostname) : development;
}
