import AsyncStorage from '@react-native-async-storage/async-storage';
import { BootstrapResponseData, BootstrapMode } from '../types/bootstrap';

const CACHE_KEYS = {
  BOOTSTRAP_NORMAL: '@anufy_bootstrap_cache_normal_v1',
  BOOTSTRAP_ANONYMOUS: '@anufy_bootstrap_cache_anonymous_v1',
  LAST_MODE: '@anufy_last_active_mode',
};

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 Minutes TTL

export interface CachedBootstrapEnvelope {
  timestamp: number;
  mode: BootstrapMode;
  data: Partial<BootstrapResponseData>;
}

export class AsyncStorageCacheService {
  /**
   * Save lightweight bootstrap payload to AsyncStorage for instant app startup (<50ms)
   */
  static async saveBootstrapCache(
    data: BootstrapResponseData,
    mode: BootstrapMode
  ): Promise<void> {
    try {
      const storageKey =
        mode === 'anonymous'
          ? CACHE_KEYS.BOOTSTRAP_ANONYMOUS
          : CACHE_KEYS.BOOTSTRAP_NORMAL;

      // Truncate payload to keep storage ultra-lightweight (Max 5 feed posts, 5 stories, 5 reels)
      const lightweightData: Partial<BootstrapResponseData> = {
        user: data.user,
        currentMode: mode,
        feed: (data.feed || []).slice(0, 5).map((p) => ({
          _id: p._id,
          id: p.id,
          content: p.content ? p.content.substring(0, 150) : '',
          media_urls: (p.media_urls || []).slice(0, 1),
          media_type: p.media_type,
          thumbnail_url: p.thumbnail_url,
          likes_count: p.likes_count,
          comments_count: p.comments_count,
          isLiked: p.isLiked,
          is_anonymous: p.is_anonymous,
          createdAt: p.createdAt,
          author: p.author,
        })),
        stories: (data.stories || []).slice(0, 5),
        shorts: (data.shorts || []).slice(0, 5),
        unreadNotificationCount: data.unreadNotificationCount,
        unreadChatCount: data.unreadChatCount,
        suggestedUsers: (data.suggestedUsers || []).slice(0, 3),
        userSettings: data.userSettings,
        featureFlags: data.featureFlags,
        applicationConfig: data.applicationConfig,
        trendingInterests: (data.trendingInterests || []).slice(0, 5),
      };

      const envelope: CachedBootstrapEnvelope = {
        timestamp: Date.now(),
        mode,
        data: lightweightData,
      };

      await Promise.all([
        AsyncStorage.setItem(storageKey, JSON.stringify(envelope)),
        AsyncStorage.setItem(CACHE_KEYS.LAST_MODE, mode),
      ]);
    } catch (e) {
    }
  }

  /**
   * Read cached bootstrap payload from AsyncStorage
   */
  static async getBootstrapCache(
    mode?: BootstrapMode
  ): Promise<CachedBootstrapEnvelope | null> {
    try {
      const activeMode = mode || (await this.getLastActiveMode());
      const storageKey =
        activeMode === 'anonymous'
          ? CACHE_KEYS.BOOTSTRAP_ANONYMOUS
          : CACHE_KEYS.BOOTSTRAP_NORMAL;

      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return null;

      const envelope: CachedBootstrapEnvelope = JSON.parse(raw);
      if (!envelope || !envelope.data) return null;

      // Check TTL (If cache is older than 30 mins, mark stale but still return for SWR)
      const isStale = Date.now() - envelope.timestamp > CACHE_TTL_MS;
      return {
        ...envelope,
        timestamp: isStale ? 0 : envelope.timestamp,
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Get last active mode ('normal' | 'anonymous')
   */
  static async getLastActiveMode(): Promise<BootstrapMode> {
    try {
      const mode = await AsyncStorage.getItem(CACHE_KEYS.LAST_MODE);
      return mode === 'anonymous' ? 'anonymous' : 'normal';
    } catch {
      return 'normal';
    }
  }

  /**
   * Read both normal and anonymous caches simultaneously on app startup
   */
  static async getAllBootstrapCaches(): Promise<{
    normal: Partial<BootstrapResponseData> | null;
    anonymous: Partial<BootstrapResponseData> | null;
    lastMode: BootstrapMode;
  }> {
    try {
      const [rawNormal, rawAnon, lastMode] = await Promise.all([
        AsyncStorage.getItem(CACHE_KEYS.BOOTSTRAP_NORMAL),
        AsyncStorage.getItem(CACHE_KEYS.BOOTSTRAP_ANONYMOUS),
        this.getLastActiveMode(),
      ]);

      const normalData = rawNormal ? JSON.parse(rawNormal)?.data || null : null;
      const anonymousData = rawAnon ? JSON.parse(rawAnon)?.data || null : null;

      return {
        normal: normalData,
        anonymous: anonymousData,
        lastMode,
      };
    } catch {
      return { normal: null, anonymous: null, lastMode: 'normal' };
    }
  }

  /**
   * Clear all bootstrap caches on logout
   */
  static async clearAllCaches(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.BOOTSTRAP_NORMAL,
        CACHE_KEYS.BOOTSTRAP_ANONYMOUS,
        CACHE_KEYS.LAST_MODE,
      ]);
    } catch (e) {
    }
  }
}
