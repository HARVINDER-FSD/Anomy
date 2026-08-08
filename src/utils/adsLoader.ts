import { NativeModules } from 'react-native';

let mobileAds: any = () => ({
  initialize: () => Promise.resolve({}),
});
let BannerAd: any = () => null;
let BannerAdSize: any = {
  ANCHORED_ADAPTIVE_BANNER: 'BANNER',
  MEDIUM_RECTANGLE: 'MEDIUM_RECTANGLE',
};
let TestIds: any = {
  ADAPTIVE_BANNER: 'ca-app-pub-3940256099942544/6300978111',
  MEDIUM_RECTANGLE: 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED: 'ca-app-pub-3940256099942544/5224354917',
};
let InterstitialAd: any = {
  createForAdRequest: () => ({
    load: () => {},
    show: () => {},
    addAdEventListener: () => () => {},
  }),
};
let RewardedAd: any = {
  createForAdRequest: () => ({
    load: () => {},
    show: () => {},
    addAdEventListener: () => () => {},
  }),
};
let AdEventType: any = {
  LOADED: 'loaded',
  CLOSED: 'closed',
  ERROR: 'error',
};
let RewardedAdEventType: any = {
  LOADED: 'loaded',
  EARNED_REWARD: 'earned_reward',
};

const hasAdMobNative = !!NativeModules.RNGoogleMobileAdsModule;

if (hasAdMobNative) {
  try {
    const googleAds = require('react-native-google-mobile-ads');
    mobileAds = googleAds.default || googleAds;
    BannerAd = googleAds.BannerAd;
    BannerAdSize = googleAds.BannerAdSize;
    TestIds = googleAds.TestIds;
    InterstitialAd = googleAds.InterstitialAd;
    RewardedAd = googleAds.RewardedAd;
    AdEventType = googleAds.AdEventType;
    RewardedAdEventType = googleAds.RewardedAdEventType;
  } catch (e) {
    console.warn('[AdsLoader] Failed to load react-native-google-mobile-ads:', e);
  }
} else {
  console.warn('[AdsLoader] Google Mobile Ads native module not found. Using mock fallback definitions.');
}

export default mobileAds;
export {
  BannerAd,
  BannerAdSize,
  TestIds,
  InterstitialAd,
  RewardedAd,
  AdEventType,
  RewardedAdEventType,
  hasAdMobNative
};
