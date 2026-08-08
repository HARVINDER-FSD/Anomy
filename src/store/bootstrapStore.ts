import { create } from 'zustand';
import {
  BootstrapResponseData,
  BootstrapMode,
  BootstrapUserProfile,
  BootstrapFeedPost,
  BootstrapStory,
  BootstrapReel,
  BootstrapSuggestedUser,
  BootstrapUserSettings,
  BootstrapFeatureFlags,
  BootstrapAppConfig,
} from '../types/bootstrap';
import { AsyncStorageCacheService } from '../services/asyncStorageCache';

interface BootstrapStoreState {
  // Global App States
  isBootstrapped: boolean;
  isLoading: boolean;
  error: string | null;

  // Active Mode State
  activeMode: BootstrapMode;

  // Active Loaded Data
  userProfile: BootstrapUserProfile | null;
  feed: BootstrapFeedPost[];
  stories: BootstrapStory[];
  shorts: BootstrapReel[];
  unreadNotificationCount: number;
  unreadChatCount: number;
  suggestedUsers: BootstrapSuggestedUser[];
  userSettings: BootstrapUserSettings | null;
  featureFlags: BootstrapFeatureFlags | null;
  applicationConfig: BootstrapAppConfig | null;
  trendingInterests: string[];

  // Mode Isolation Memory Caches (For instant <10ms mode swap)
  normalData: Partial<BootstrapResponseData> | null;
  anonymousData: Partial<BootstrapResponseData> | null;

  // Actions & Setters
  setBootstrapData: (data: BootstrapResponseData, isFromCache?: boolean) => void;
  setOppositeModeData: (data: BootstrapResponseData) => void;
  setBothInitialCaches: (
    normal: Partial<BootstrapResponseData> | null,
    anonymous: Partial<BootstrapResponseData> | null,
    activeMode: BootstrapMode
  ) => void;
  switchMode: (newMode: BootstrapMode) => void;
  setUnreadNotificationCount: (count: number | ((prev: number) => number)) => void;
  setUnreadChatCount: (count: number | ((prev: number) => number)) => void;
  updateFeedPost: (postId: string, updater: Partial<BootstrapFeedPost>) => void;
  resetBootstrapStore: () => void;
}

export const useBootstrapStore = create<BootstrapStoreState>((set, get) => ({
  isBootstrapped: false,
  isLoading: false,
  error: null,

  activeMode: 'normal',

  userProfile: null,
  feed: [],
  stories: [],
  shorts: [],
  unreadNotificationCount: 0,
  unreadChatCount: 0,
  suggestedUsers: [],
  userSettings: null,
  featureFlags: null,
  applicationConfig: null,
  trendingInterests: [],

  normalData: null,
  anonymousData: null,

  /**
   * Apply fresh or cached bootstrap data to Zustand memory
   */
  setBootstrapData: (data: BootstrapResponseData, isFromCache = false) => {
    const mode = data.currentMode || get().activeMode;
    const isAnon = mode === 'anonymous';

    set((state) => ({
      isBootstrapped: true,
      isLoading: false,
      error: null,
      activeMode: mode,
      userProfile: data.user,
      feed: data.feed || [],
      stories: data.stories || [],
      shorts: data.shorts || [],
      unreadNotificationCount: data.unreadNotificationCount ?? 0,
      unreadChatCount: data.unreadChatCount ?? 0,
      suggestedUsers: data.suggestedUsers || [],
      userSettings: data.userSettings || state.userSettings,
      featureFlags: data.featureFlags || state.featureFlags,
      applicationConfig: data.applicationConfig || state.applicationConfig,
      trendingInterests: data.trendingInterests || state.trendingInterests,
      normalData: isAnon ? state.normalData : data,
      anonymousData: isAnon ? data : state.anonymousData,
    }));

    // Persist to AsyncStorage if fresh network response
    if (!isFromCache) {
      AsyncStorageCacheService.saveBootstrapCache(data, mode);
    }
  },

  /**
   * Silently populate opposite mode memory cache in background (prevents feed reload on mode switch)
   */
  setOppositeModeData: (data: BootstrapResponseData) => {
    const mode = data.currentMode;
    const isAnon = mode === 'anonymous';

    set((state) => ({
      normalData: !isAnon ? data : state.normalData,
      anonymousData: isAnon ? data : state.anonymousData,
    }));

    AsyncStorageCacheService.saveBootstrapCache(data, mode);
  },

  /**
   * Load both mode caches from storage on cold app start
   */
  setBothInitialCaches: (normal, anonymous, activeMode) => {
    const activeCache = activeMode === 'anonymous' ? anonymous : normal;

    set((state) => ({
      isBootstrapped: !!activeCache,
      activeMode,
      normalData: normal,
      anonymousData: anonymous,
      userProfile: activeCache?.user || state.userProfile,
      feed: (activeCache?.feed as any) || [],
      stories: (activeCache?.stories as any) || [],
      shorts: (activeCache?.shorts as any) || [],
      unreadNotificationCount: activeCache?.unreadNotificationCount ?? 0,
      unreadChatCount: activeCache?.unreadChatCount ?? 0,
      suggestedUsers: (activeCache?.suggestedUsers as any) || [],
    }));
  },

  /**
   * Instant Cache Swap for Dual Mode Switch (<10ms UI update with zero feed reload)
   */
  switchMode: (newMode: BootstrapMode) => {
    const state = get();
    if (state.activeMode === newMode) return;

    const targetCache = newMode === 'anonymous' ? state.anonymousData : state.normalData;

    if (targetCache) {
      // Instant Swap from Memory Cache — ZERO loading or reload delay!
      set({
        activeMode: newMode,
        userProfile: targetCache.user || state.userProfile,
        feed: (targetCache.feed as any) || [],
        stories: (targetCache.stories as any) || [],
        shorts: (targetCache.shorts as any) || [],
        unreadNotificationCount: targetCache.unreadNotificationCount ?? 0,
        unreadChatCount: targetCache.unreadChatCount ?? 0,
        suggestedUsers: (targetCache.suggestedUsers as any) || [],
      });
    } else {
      set({ activeMode: newMode, feed: [], stories: [], shorts: [] });
    }

    // Save last active mode
    AsyncStorageCacheService.saveBootstrapCache(
      {
        user: state.userProfile!,
        currentMode: newMode,
        feed: state.feed,
        stories: state.stories,
        shorts: state.shorts,
        unreadNotificationCount: state.unreadNotificationCount,
        unreadChatCount: state.unreadChatCount,
        suggestedUsers: state.suggestedUsers,
        userSettings: state.userSettings!,
        featureFlags: state.featureFlags!,
        applicationConfig: state.applicationConfig!,
        trendingInterests: state.trendingInterests,
      },
      newMode
    );
  },

  setUnreadNotificationCount: (count) =>
    set((state) => ({
      unreadNotificationCount:
        typeof count === 'function' ? count(state.unreadNotificationCount) : count,
    })),

  setUnreadChatCount: (count) =>
    set((state) => ({
      unreadChatCount:
        typeof count === 'function' ? count(state.unreadChatCount) : count,
    })),

  updateFeedPost: (postId, updater) =>
    set((state) => ({
      feed: state.feed.map((p) =>
        p._id === postId || p.id === postId ? { ...p, ...updater } : p
      ),
    })),

  resetBootstrapStore: () => {
    set({
      isBootstrapped: false,
      isLoading: false,
      error: null,
      activeMode: 'normal',
      userProfile: null,
      feed: [],
      stories: [],
      shorts: [],
      unreadNotificationCount: 0,
      unreadChatCount: 0,
      suggestedUsers: [],
      normalData: null,
      anonymousData: null,
    });
    AsyncStorageCacheService.clearAllCaches();
  },
}));
