const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const packageJson = require('../package.json');

function withReactNativeFirebaseStatic(config) {
  return withPodfile(config, (nextConfig) => {
    const result = mergeContents({
      tag: 'zelio-rnfirebase-static-linkage',
      src: nextConfig.modResults.contents,
      newSrc: '$RNFirebaseDisableSPM = true\n$RNFirebaseAsStaticFramework = true',
      anchor: /prepare_react_native_project!/,
      offset: 1,
      comment: '#',
    });
    nextConfig.modResults.contents = result.contents;
    return nextConfig;
  });
}

module.exports = createRunOncePlugin(
  withReactNativeFirebaseStatic,
  'zelio-rnfirebase-static-linkage',
  packageJson.version,
);
