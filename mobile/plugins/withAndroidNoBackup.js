const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidNoBackup(config) {
  return withAndroidManifest(config, (pluginConfig) => {
    const application = pluginConfig.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$['android:allowBackup'] = 'false';
    }

    return pluginConfig;
  });
};
