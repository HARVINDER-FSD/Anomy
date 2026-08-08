import { useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useBootstrapStore } from '../store/bootstrapStore';
import { AsyncStorageCacheService } from '../services/asyncStorageCache';
import { BootstrapApiService } from '../services/bootstrapApi';
import { backgroundPrefetchManager } from '../services/backgroundPrefetch';
import { socketManager } from '../services/socketManager';
import { BootstrapMode } from '../types/bootstrap';

export function useBootstrap() {
  const {
    isBootstrapped,
    isLoading,
    error,
    activeMode,
    userProfile,
    feed,
    stories,
    shorts,
    unreadNotificationCount,
    unreadChatCount,
    suggestedUsers,
    userSettings,
    featureFlags,
    applicationConfig,
    trendingInterests,
    setBootstrapData,
    setBothInitialCaches,
    switchMode,
  } = useBootstrapStore();

  /**
   * Main App Initialization Strategy (SWR + Instant Dual Cache Render + Socket + Background Prefetch)
   */
  const initBootstrap = useCallback(async () => {
    try {
      // Step 1: Read Auth Token
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        return;
      }

      // Step 2: Connect Socket.io immediately in parallel
      socketManager.connect();

      // Step 3: Read BOTH Normal and Anonymous Caches from AsyncStorage (<50ms)
      // This ensures Mode Switch is 100% INSTANT with ZERO feed reload delay!
      const { normal, anonymous, lastMode } =
        await AsyncStorageCacheService.getAllBootstrapCaches();

      if (normal || anonymous) {
        setBothInitialCaches(normal, anonymous, lastMode);
      }

      // Step 4: Execute GET /api/bootstrap to fetch fresh server state for active mode
      const response = await BootstrapApiService.fetchBootstrap(lastMode);

      if (response && response.success && response.data) {
        // Step 5: Save Fresh Data in Zustand & AsyncStorage
        setBootstrapData(response.data, false);

        // Step 6: Trigger Background Prefetch Engine (Feed P2/P3, Shorts, Explore, Chats + Opposite Mode Feed)
        backgroundPrefetchManager.startPrefetch(response.data.currentMode);
      }
    } catch (err: any) {
    }
  }, [setBootstrapData, setBothInitialCaches]);

  /**
   * Dual Mode Instant Switch Strategy (Zero Feed Reload Delay)
   */
  const handleModeSwitch = useCallback(
    async (targetMode: BootstrapMode) => {
      // 1. Instant Memory Cache Swap (<10ms UI update with zero feed reload!)
      switchMode(targetMode);

      try {
        // 2. Silent Background Revalidation for the target mode
        const res = await BootstrapApiService.fetchBootstrap(targetMode);
        if (res && res.success && res.data) {
          setBootstrapData(res.data, false);
          backgroundPrefetchManager.startPrefetch(targetMode);
        }
      } catch (err) {
      }
    },
    [switchMode, setBootstrapData]
  );

  useEffect(() => {
    initBootstrap();
  }, [initBootstrap]);

  return {
    isBootstrapped,
    isLoading,
    error,
    activeMode,
    userProfile,
    feed,
    stories,
    shorts,
    unreadNotificationCount,
    unreadChatCount,
    suggestedUsers,
    userSettings,
    featureFlags,
    applicationConfig,
    trendingInterests,
    refreshBootstrap: initBootstrap,
    handleModeSwitch,
  };
}
