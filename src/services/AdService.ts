import { Platform, NativeModules } from 'react-native';
import { InterstitialAd, RewardedAd, AdEventType, RewardedAdEventType, TestIds } from '@/src/utils/adsLoader';

// Demo Ad Unit IDs from Google
const INTERSTITIAL_AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : (Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712');

const REWARDED_AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : (Platform.OS === 'ios' ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917');

class AdServiceClass {
  private interstitial: any = null;
  private rewarded: any = null;

  private isInterstitialLoaded = false;
  private isRewardedLoaded = false;

  private onRewardEarnedCallback: (() => void) | null = null;

  // Initialize and preload ads
  init() {
    if (!NativeModules.RNGoogleMobileAdsModule) {
      console.warn('[AdService] Google Mobile Ads native module not found. Skipping ad preloading.');
      return;
    }
    this.initInterstitial();
    this.initRewarded();
  }

  private initInterstitial() {
    try {
      this.interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: true,
      });

      this.interstitial.addAdEventListener(AdEventType.LOADED, () => {
        this.isInterstitialLoaded = true;
        console.log('[AdService] Interstitial ad loaded');
      });

      this.interstitial.addAdEventListener(AdEventType.CLOSED, () => {
        this.isInterstitialLoaded = false;
        console.log('[AdService] Interstitial ad closed. Preloading next interstitial...');
        this.interstitial?.load();
      });

      this.interstitial.addAdEventListener(AdEventType.ERROR, (error: any) => {
        this.isInterstitialLoaded = false;
        console.warn('[AdService] Interstitial failed to load: ', error);
      });

      this.interstitial.load();
    } catch (e) {
      console.error('[AdService] Failed to initialize interstitial: ', e);
    }
  }

  private initRewarded() {
    try {
      this.rewarded = RewardedAd.createForAdRequest(REWARDED_AD_UNIT_ID, {
        requestNonPersonalizedAdsOnly: true,
      });

      this.rewarded.addAdEventListener(RewardedAdEventType.LOADED, () => {
        this.isRewardedLoaded = true;
        console.log('[AdService] Rewarded ad loaded');
      });

      this.rewarded.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward: any) => {
        console.log('[AdService] User earned reward: ', reward);
        if (this.onRewardEarnedCallback) {
          this.onRewardEarnedCallback();
        }
      });

      this.rewarded.addAdEventListener(AdEventType.CLOSED, () => {
        this.isRewardedLoaded = false;
        this.onRewardEarnedCallback = null;
        console.log('[AdService] Rewarded ad closed. Preloading next rewarded...');
        this.rewarded?.load();
      });

      this.rewarded.addAdEventListener(AdEventType.ERROR, (error: any) => {
        this.isRewardedLoaded = false;
        console.warn('[AdService] Rewarded failed to load: ', error);
      });

      this.rewarded.load();
    } catch (e) {
      console.error('[AdService] Failed to initialize rewarded ad: ', e);
    }
  }

  // Show preloaded interstitial
  showInterstitial() {
    if (this.isInterstitialLoaded && this.interstitial) {
      this.interstitial.show();
    } else {
      console.log('[AdService] Interstitial not ready. Requesting load...');
      this.interstitial?.load();
    }
  }

  // Show preloaded rewarded ad with reward callback
  showRewarded(onRewardEarned: () => void) {
    if (this.isRewardedLoaded && this.rewarded) {
      this.onRewardEarnedCallback = onRewardEarned;
      this.rewarded.show();
    } else {
      console.log('[AdService] Rewarded ad not ready. Requesting load...');
      this.rewarded?.load();
    }
  }
}

export const AdService = new AdServiceClass();
