const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const mobileRoot = path.resolve(__dirname, "..");
const root = path.resolve(mobileRoot, "..");
const stampPath = path.join(mobileRoot, "release-source.json");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const git = args => execFileSync("git", args, {cwd: root, encoding:"utf8"}).trim();
function sourceFiles() {
  return git(["ls-files", "-z", "--", "mobile", "shared", ".easignore", "package.json", "package-lock.json"]).split("\0").filter(Boolean).sort();
}
function digestFiles(files) {
  return Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
}
function fingerprint(files) { return hash(JSON.stringify(files)); }
function assertVersion(version, build) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(build) || build < 1) throw Error("Provide an explicit release version and positive integer build.");
}
function prepare({version, build, apiUrl}) {
  assertVersion(version, build);
  if (!["https://clover.ph", "https://staging.clover.ph"].includes(apiUrl)) throw Error("Unknown release API environment.");
  if (git(["status", "--porcelain", "--untracked-files=normal", "--", "mobile", "shared", ".easignore", "package.json", "package-lock.json"])) throw Error("Commit all mobile/shared changes before freezing a release.");
  const files = digestFiles(sourceFiles());
  const stamp = {schema:1, sourceCommit:git(["rev-parse","HEAD"]), sourceFingerprint:fingerprint(files), version, build, apiUrl, files};
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 2)+"\n");
  return stamp;
}
function validate(stamp, expectedApiUrl) {
  assertVersion(stamp.version, stamp.build);
  if (stamp.schema !== 1 || !/^[a-f0-9]{40}$/.test(stamp.sourceCommit) || stamp.apiUrl !== expectedApiUrl) throw Error("Release source/environment mismatch. Freeze this exact source again.");
  const files = stamp.files;
  if (!files || !Object.keys(files).length || Object.keys(files).some(file => !(/^(mobile|shared)\//.test(file) || [".easignore","package.json","package-lock.json"].includes(file)) || file.includes(".."))) throw Error("Invalid release source inventory.");
  if (fingerprint(files) !== stamp.sourceFingerprint || fingerprint(digestFiles(Object.keys(files))) !== stamp.sourceFingerprint) throw Error("Native/shared files changed after release freeze.");
  if (fs.existsSync(path.join(root, ".git"))) {
    if (git(["rev-parse","HEAD"]) !== stamp.sourceCommit || JSON.stringify(sourceFiles()) !== JSON.stringify(Object.keys(files))) throw Error("Checkout differs from the frozen release source.");
    if (git(["status","--porcelain","--untracked-files=normal","--","mobile","shared",".easignore","package.json","package-lock.json"])) throw Error("Release source has uncommitted changes.");
  }
  return {sourceCommit:stamp.sourceCommit, sourceFingerprint:stamp.sourceFingerprint, version:stamp.version, build:stamp.build, apiUrl:stamp.apiUrl};
}
function read(expectedApiUrl) {
  if (!fs.existsSync(stampPath)) throw Error("Store builds require release-source.json. Run npm run release:prepare -- VERSION BUILD API_URL from a clean committed checkout.");
  return validate(JSON.parse(fs.readFileSync(stampPath,"utf8")), expectedApiUrl);
}
module.exports={prepare, validate, read, fingerprint, digestFiles};
if (require.main === module) {
  const [version, build, apiUrl] = process.argv.slice(2);
  const stamp = prepare({version, build:Number(build), apiUrl});
  console.log(JSON.stringify({sourceCommit:stamp.sourceCommit,sourceFingerprint:stamp.sourceFingerprint,version:stamp.version,build:stamp.build,apiUrl:stamp.apiUrl}));
}
