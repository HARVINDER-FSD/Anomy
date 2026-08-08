import { BaseEngine } from '../shared/BaseEngine';
import { NativeModules } from 'react-native';
import mobileAds from '@/src/utils/adsLoader';
import { Logger } from '../../shared/Logger';
import { AdService } from '../../services/AdService';

export class AdEngineClass extends BaseEngine {
  readonly name = 'AdEngine';

  protected async onInitialize(): Promise<void> {
    const hasAdMobNative = !!NativeModules.RNGoogleMobileAdsModule;
    if (!hasAdMobNative) {
      Logger.warn(this.name, 'Google Mobile Ads native module is not available (running in Expo Go?). Skipping initialization.');
      return;
    }

    Logger.info(this.name, 'Initializing Google Mobile Ads SDK...');
    try {
      const adapterStatuses = await mobileAds().initialize();
      Logger.info(this.name, 'Google Mobile Ads SDK initialized successfully:', JSON.stringify(adapterStatuses));
      AdService.init();
    } catch (error) {
      Logger.error(this.name, 'Google Mobile Ads SDK initialization failed:', error);
      // Handle gracefully to ensure app bootstrap continues even if network or SDK errors occur
    }
  }

  protected async onDestroy(): Promise<void> {
    Logger.info(this.name, 'AdEngine destroyed');
  }
}

export const AdEngine = new AdEngineClass();
