import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from './authStore';

export interface ProfileCache {
  profileData: any;
  posts: any[];
  reels: any[];
  savedPosts: any[];
  savedReels: any[];
  mutualCount: number;
}

interface ProfileState {
  realityCache: ProfileCache | null;
  ghostCache: ProfileCache | null;
  isLoadingCache: boolean;
  loadCache: () => Promise<void>;
  setCache: (isAnonymous: boolean, newCache: Partial<ProfileCache>) => Promise<void>;
  clearCache: () => Promise<void>;
}

const DEFAULT_CACHE: ProfileCache = {
  profileData: null,
  posts: [],
  reels: [],
  savedPosts: [],
  savedReels: [],
  mutualCount: 0,
};

// Max bytes before skipping disk write (50KB)
const MAX_CACHE_BYTES = 50 * 1024;

// Only keep essential fields needed to render the grid thumbnail
const stripItem = (p: any) => ({
  _id: p._id || p.id,
  id: p._id || p.id,
  media_urls: Array.isArray(p.media_urls) ? p.media_urls.slice(0, 1) : (p.media_url ? [p.media_url] : []),
  media_type: p.media_type || 'image',
  thumbnail_url: p.thumbnail_url || p.thumbnail || null,
  is_anonymous: p.is_anonymous || false,
  likes_count: p.likes_count || 0,
  comments_count: p.comments_count || 0,
});

// Strip profile to only fields needed for header display
const stripProfile = (p: any) => {
  if (!p) return null;
  return {
    id: p.id || p._id,
    _id: p._id || p.id,
    username: p.username || '',
    full_name: p.full_name || p.name || '',
    bio: p.bio || '',
    avatar: p.avatar_url || p.avatar || '',
    avatar_url: p.avatar_url || p.avatar || '',
    followers_count: p.followers_count || 0,
    following_count: p.following_count || 0,
    posts_count: p.posts_count || 0,
    is_verified: p.is_verified || false,
    is_private: p.is_private || false,
    is_anonymous: p.is_anonymous || false,
    anonymousPersona: p.anonymousPersona || null,
  };
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  realityCache: null,
  ghostCache: null,
  isLoadingCache: true,

  loadCache: async () => {
    try {
      const currentUserId = useAuthStore.getState().user?.id || useAuthStore.getState().user?._id;
      const [realityStr, ghostStr] = await Promise.all([
        AsyncStorage.getItem('profile_cache_reality'),
        AsyncStorage.getItem('profile_cache_ghost'),
      ]);

      let realityCache: ProfileCache | null = realityStr ? JSON.parse(realityStr) : null;
      let ghostCache: ProfileCache | null = ghostStr ? JSON.parse(ghostStr) : null;

      // 🛡️ USER ID GUARD: Discard cached data if it belongs to a previous/deleted user account
      if (realityCache?.profileData && currentUserId) {
        const cachedId = realityCache.profileData.id || realityCache.profileData._id;
        if (cachedId && String(cachedId) !== String(currentUserId)) {
          AsyncStorage.removeItem('profile_cache_reality').catch(() => {});
          realityCache = null;
        }
      }

      if (ghostCache?.profileData && currentUserId) {
        const cachedId = ghostCache.profileData.id || ghostCache.profileData._id;
        if (cachedId && String(cachedId) !== String(currentUserId)) {
          AsyncStorage.removeItem('profile_cache_ghost').catch(() => {});
          ghostCache = null;
        }
      }

      set({
        realityCache,
        ghostCache,
        isLoadingCache: false,
      });
    } catch (e) {
      set({ isLoadingCache: false });
    }
  },

  setCache: async (isAnonymous, newCache) => {
    try {
      const key = isAnonymous ? 'profile_cache_ghost' : 'profile_cache_reality';
      const current = (isAnonymous ? get().ghostCache : get().realityCache) || { ...DEFAULT_CACHE };

      // Full data in memory (for display while app is open)
      const memoryUpdated: ProfileCache = {
        ...current,
        ...newCache,
      };

      // Minimal data for disk (prevents SQLITE_FULL)
      const diskUpdated: ProfileCache = {
        profileData: stripProfile(newCache.profileData ?? current.profileData),
        posts: (newCache.posts ?? current.posts).slice(0, 6).map(stripItem),
        reels: (newCache.reels ?? current.reels).slice(0, 6).map(stripItem),
        savedPosts: (newCache.savedPosts ?? current.savedPosts).slice(0, 3).map((p: any) => ({ _id: p._id || p.id })),
        savedReels: (newCache.savedReels ?? current.savedReels).slice(0, 3).map((p: any) => ({ _id: p._id || p.id })),
        mutualCount: newCache.mutualCount ?? current.mutualCount,
      };

      // Update memory state immediately with full data
      if (isAnonymous) {
        set({ ghostCache: memoryUpdated });
      } else {
        set({ realityCache: memoryUpdated });
      }

      // Write to disk with size guard
      try {
        const serialized = JSON.stringify(diskUpdated);
        if (serialized.length > MAX_CACHE_BYTES) {
          // Skip disk write — memory cache is still valid
          return;
        }
        await AsyncStorage.setItem(key, serialized);
      } catch (e: any) {
        // SQLITE_FULL: clear old data and retry with profile-only minimal cache
        try {
          await AsyncStorage.removeItem(key);
          const minimalDisk: ProfileCache = {
            profileData: stripProfile(newCache.profileData ?? current.profileData),
            posts: [],
            reels: [],
            savedPosts: [],
            savedReels: [],
            mutualCount: 0,
          };
          const minSerialized = JSON.stringify(minimalDisk);
          if (minSerialized.length <= MAX_CACHE_BYTES) {
            await AsyncStorage.setItem(key, minSerialized);
          }
        } catch {
          // Fail silently — memory cache is still intact for this session
        }
      }
    } catch (e) {
    }
  },

  clearCache: async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem('profile_cache_reality'),
        AsyncStorage.removeItem('profile_cache_ghost'),
      ]);
      set({ realityCache: null, ghostCache: null });
    } catch (e) {
    }
  },
}));
