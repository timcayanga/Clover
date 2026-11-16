const { withPodfile } = require("expo/config-plugins");
// CocoaPods' counter can restart before Expo/RN post-install hooks create
// additional objects. Guard every generated UUID, including build phases.
// Related upstream fix: https://github.com/react/react-native/pull/57576
module.exports = function withUniquePodUUIDs(config) {
  return withPodfile(config, config => {
    const marker = "# Clover: avoid CocoaPods post-install UUID collisions";
    if (!config.modResults.contents.includes(marker)) {
      const hook = `${marker}
module CloverUniquePodUUIDs
  def generate_uuid
    uuid = super
    uuid = super while objects_by_uuid.key?(uuid)
    uuid
  end
end
Pod::Project.prepend(CloverUniquePodUUIDs)

`;
      config.modResults.contents = hook + config.modResults.contents;
    }
    return config;
  });
};
