import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, NativeModules } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { scale, verticalScale, moderateScale, moderateFont } from '@/src/utils/responsive';
import { BannerAd, BannerAdSize, TestIds } from '@/src/utils/adsLoader';

// Demo Ad Unit ID for Banner ad
const bannerAdUnitId = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : (Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-9263147466443083/9524541302');

export const SponsoredPostRow = React.memo(() => {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed || !NativeModules.RNGoogleMobileAdsModule) {
    return null; // Return null so it hides completely and doesn't break the list layout if ad fails to load or native module is not linked
  }

  return (
    <View style={styles.postCard}>
      {/* Ad Header */}
      <View style={styles.postHeader}>
        <View style={styles.postUser}>
          <Image 
            source={require('@/assets/images/logo.png')} 
            style={styles.postAvatar} 
            contentFit="cover"
            transition={200}
          />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.postUsername}>Sponsored Ad</Text>
              <View style={styles.sponsoredBadge}>
                <Text style={styles.sponsoredText}>Sponsored</Text>
              </View>
            </View>
            <Text style={styles.postLocation}>Promoted via Google AdMob</Text>
          </View>
        </View>
        <TouchableOpacity hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.subtitle} />
        </TouchableOpacity>
      </View>

      {/* Ad Content Block (Google Medium Rectangle Banner) */}
      <View style={styles.adContainer}>
        <BannerAd
          unitId={bannerAdUnitId}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdFailedToLoad={(error: any) => {
            console.warn('[SponsoredPostRow] Ad failed to load:', error);
            setHasFailed(true);
          }}
        />
      </View>

      {/* Ad Caption Footer */}
      <View style={styles.postFooter}>
        <Text style={styles.captionText}>
          <Text style={styles.boldText}>Sponsored </Text>
          Discover featured recommendations, custom utilities, and exciting updates customized just for you.
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  postCard: {
    backgroundColor: COLORS.background,
    marginBottom: verticalScale(16),
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(12),
  },
  postUser: { flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  postAvatar: {
    width: moderateScale(38),
    height: moderateScale(38),
    borderRadius: moderateScale(19),
    backgroundColor: COLORS.surface,
  },
  postUsername: {
    fontSize: moderateFont(14),
    fontWeight: '700',
    color: COLORS.text,
  },
  sponsoredBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  sponsoredText: {
    fontSize: 10,
    color: COLORS.subtitle,
    fontWeight: '600',
  },
  postLocation: {
    fontSize: moderateFont(11),
    color: COLORS.subtitle,
    marginTop: 1,
  },
  adContainer: {
    width: '100%',
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
  },
  postFooter: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
  },
  captionText: {
    color: COLORS.text,
    fontSize: moderateFont(13.5),
    lineHeight: 18,
  },
  boldText: { fontWeight: '700' },
});
