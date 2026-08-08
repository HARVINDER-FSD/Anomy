const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAdMob(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application[0];
    
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const existingMeta = mainApplication['meta-data'].find(
      (item) => item.$ && item.$['android:name'] === 'com.google.android.gms.ads.APPLICATION_ID'
    );

    if (existingMeta) {
      existingMeta.$['android:value'] = 'ca-app-pub-9263147466443083~3186363669';
    } else {
      mainApplication['meta-data'].push({
        $: {
          'android:name': 'com.google.android.gms.ads.APPLICATION_ID',
          'android:value': 'ca-app-pub-9263147466443083~3186363669',
        },
      });
    }

    return config;
  });
};
