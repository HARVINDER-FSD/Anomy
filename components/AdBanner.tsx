import React, { useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, NativeModules } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from '@/src/utils/adsLoader';
import { useAppTheme } from '@/src/theme/colors';

// Demo Ad Unit ID for Banner ad
const adUnitId = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : (Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111');

export function AdBanner() {
  const COLORS = useAppTheme();
  const [hasFailed, setHasFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  if (hasFailed || !NativeModules.RNGoogleMobileAdsModule) {
    return null; // Return null so it doesn't leave an empty box or break the page layout if ad fails to load or native module is not linked
  }

  return (
    <View style={[styles.container, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
      {isLoading && (
        <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
      )}
      <BannerAd
        unitId={adUnitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setIsLoading(false);
        }}
        onAdFailedToLoad={(error: any) => {
          console.warn('[AdBanner] Failed to load banner ad:', error);
          setHasFailed(true);
          setIsLoading(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    width: '100%',
    minHeight: 50,
    borderWidth: 0.5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  loader: {
    position: 'absolute',
  },
});
