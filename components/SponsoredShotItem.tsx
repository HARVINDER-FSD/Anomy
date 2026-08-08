import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, NativeModules } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/theme/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize, TestIds } from '@/src/utils/adsLoader';

const { width, height } = Dimensions.get('window');

// Demo Ad Unit ID for Banner ad
const bannerAdUnitId = __DEV__
  ? TestIds.ADAPTIVE_BANNER
  : (Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-9263147466443083/9524541302');

export const SponsoredShotItem = React.memo(({ ad }: { ad?: any }) => {
  const [hasFailed, setHasFailed] = useState(false);

  const brandName = ad?.brandName || ad?.brand_name || 'AnuFy Sponsored';
  const caption = ad?.caption || 'Unlock special features and explore custom recommendations.';

  if (hasFailed || !NativeModules.RNGoogleMobileAdsModule) {
    // Return a fallback styled placeholder if the ad fails to load or native module is not linked
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.2)" />
        <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>Sponsored Content</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dark background overlay */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }]} />

      {/* Centered AdMob Banner (Medium Rectangle) */}
      <View style={styles.adWrapper}>
        <BannerAd
          unitId={bannerAdUnitId}
          size={BannerAdSize.MEDIUM_RECTANGLE}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdFailedToLoad={(error: any) => {
            console.warn('[SponsoredShotItem] Ad failed to load:', error);
            setHasFailed(true);
          }}
        />
      </View>
      
      {/* Overlay Gradients */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.85)']}
        style={styles.bottomGradient}
      />

      {/* Ad Info */}
      <View style={styles.bottomInfoFlow}>
        <View style={styles.metaData}>
          <View style={styles.headerProfilePill}>
            <Image 
              source={require('@/assets/images/logo.png')} 
              style={styles.pillAvatar} 
              contentFit="cover"
              transition={200}
            />
            <View style={styles.pillInfo}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.pillUsername}>{brandName}</Text>
                <View style={styles.sponsoredBadge}>
                  <Text style={styles.sponsoredText}>Ad</Text>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.userCaption}>{caption}</Text>
        </View>
      </View>

      {/* Sidebar Mock */}
      <View style={styles.interactionSidebar}>
        <View style={styles.sidebarItem}>
          <View style={styles.iconCircle}>
            <Ionicons name="star" size={26} color={COLORS.primary} />
          </View>
          <Text style={styles.sidebarText}>Sponsored</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width,
    height,
    backgroundColor: '#000',
  },
  adWrapper: {
    width: 300,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
  },
  bottomInfoFlow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 100,
    zIndex: 15,
    alignItems: 'flex-start',
  },
  metaData: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  pillAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  pillInfo: {
    marginLeft: 10,
  },
  pillUsername: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 14,
  },
  sponsoredBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sponsoredText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  userCaption: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
    maxWidth: width * 0.8,
  },
  interactionSidebar: {
    position: 'absolute',
    right: 12,
    bottom: 150,
    alignItems: 'center',
    gap: 20,
    zIndex: 15,
  },
  sidebarItem: {
    alignItems: 'center',
    gap: 5,
  },
  iconCircle: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sidebarText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
