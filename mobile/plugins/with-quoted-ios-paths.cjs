const { withPodfile, withXcodeProject } = require("expo/config-plugins");
// Expo 57's Constants phase evaluates an unquoted path in a second shell and
// also passes PROJECT_DIR unquoted to basename. Call its Node wrapper directly
// with the same project root and resource destination, preserving spaces.
const constantsScript = `set -eo pipefail
export PROJECT_ROOT="\${PROJECT_ROOT:-$PROJECT_DIR/../..}"
cd "$PROJECT_ROOT"
case "$BUNDLE_FORMAT" in
  shallow) RESOURCE_DEST="$CONFIGURATION_BUILD_DIR/EXConstants.bundle" ;;
  deep) RESOURCE_DEST="$CONFIGURATION_BUILD_DIR/EXConstants.bundle/Contents/Resources" ;;
  *) echo "Unsupported bundle format: $BUNDLE_FORMAT" >&2; exit 1 ;;
esac
mkdir -p "$RESOURCE_DEST"
"$PODS_TARGET_SRCROOT/../scripts/with-node.sh" "$PODS_TARGET_SRCROOT/../scripts/getAppConfig.js" "$PROJECT_ROOT" "$RESOURCE_DEST"
`;
function patchPodfile(contents) {
  const marker = "# Clover: quote Expo Constants paths";
  if (contents.includes(marker)) return contents;
  const hook = "post_install do |installer|";
  if (!contents.includes(hook)) throw new Error("Clover requires the Expo Podfile post_install hook.");
  return contents.replace(hook, `${hook}
    ${marker}
    installer.pods_project.targets.select { |target| target.name == 'EXConstants' }.each do |target|
      target.shell_script_build_phases.each do |phase|
        if phase.shell_script.include?('get-app-config-ios.sh')
          phase.shell_script = <<'CLOVER_CONSTANTS_SCRIPT'
${constantsScript}CLOVER_CONSTANTS_SCRIPT
        end
      end
    end
`);
}
function patchXcodeProject(project) {
  for (const phase of Object.values(project.hash.project.objects.PBXShellScriptBuildPhase)) {
    if (!phase || typeof phase !== "object" || !phase.shellScript) continue;
    const script = JSON.parse(phase.shellScript);
    const fixed = script.split("\n").flatMap(line => {
      if (!line.startsWith("`") || !line.includes("react-native-xcode.sh")) return [line];
      return [
        `REACT_NATIVE_XCODE_SCRIPT="$("$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'")"`,
        '"$REACT_NATIVE_XCODE_SCRIPT"',
      ];
    }).join("\n");
    if (fixed !== script) phase.shellScript = JSON.stringify(fixed);
  }
  return project;
}
module.exports = config => {
  config = withPodfile(config, config => {
    config.modResults.contents = patchPodfile(config.modResults.contents);
    return config;
  });
  return withXcodeProject(config, config => {
    config.modResults = patchXcodeProject(config.modResults);
    return config;
  });
};
module.exports.patchPodfile = patchPodfile;
module.exports.patchXcodeProject = patchXcodeProject;
