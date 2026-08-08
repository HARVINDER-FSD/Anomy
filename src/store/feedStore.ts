import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 🚀 Custom error-resistant AsyncStorage wrapper to handle SQLITE_FULL and other errors
const safeAsyncStorage = {
  getItem: async (key: string) => {
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      // Fail silently to keep app running
    }
  },
  removeItem: async (key: string) => {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
    }
  },
};

interface FeedStore {
  cachedPosts: any[];
  setCachedPosts: (posts: any[] | ((prev: any[]) => any[])) => void;
  cachedAnonymousPosts: any[];
  setCachedAnonymousPosts: (posts: any[] | ((prev: any[]) => any[])) => void;
  clearAllFeedCaches: () => void;
}

export const useFeedStore = create<FeedStore>()(
  persist(
    (set, get) => ({
      cachedPosts: [],
      setCachedPosts: (posts) => set({ 
        cachedPosts: typeof posts === 'function' ? posts(get().cachedPosts || []) : posts 
      }),
      cachedAnonymousPosts: [],
      setCachedAnonymousPosts: (posts) => set({ 
        cachedAnonymousPosts: typeof posts === 'function' ? posts(get().cachedAnonymousPosts || []) : posts 
      }),
      clearAllFeedCaches: () => set({ cachedPosts: [], cachedAnonymousPosts: [] }),
    }),
    {
      name: 'anufy-feed-storage',
      storage: createJSONStorage(() => safeAsyncStorage),
      // 🚀 Persist both caches for instant toggle — keep SUPER lightweight
      partialize: (state) => {
        const minPost = (p: any) => {
          const authorObj = p.author || p.user;
          return {
            _id: (p._id || p.id)?.toString(),
            id: (p._id || p.id)?.toString(),
            content: typeof p.content === 'string' ? p.content.substring(0, 200) : '',
            likes_count: p.likes_count,
            comments_count: p.comments_count,
            // Keep only first media URL to reduce storage
            media_urls: Array.isArray(p.media_urls) ? p.media_urls.slice(0, 1) : [],
            media_type: p.media_type,
            thumbnail_url: p.thumbnail_url || p.thumbnail,
            isLiked: p.isLiked,
            is_liked: p.is_liked || p.isLiked,
            user_reaction: p.user_reaction || p.userReaction,
            userReaction: p.user_reaction || p.userReaction,
            is_anonymous: p.is_anonymous || p.isAnonymous,
            author: authorObj ? {
              _id: (authorObj._id || authorObj.id)?.toString(),
              username: authorObj.username,
              avatar_url: authorObj.avatar_url || authorObj.avatar,
            } : undefined,
          };
        };
        return {
          cachedPosts: (state.cachedPosts || []).slice(0, 5).map(minPost),
          cachedAnonymousPosts: (state.cachedAnonymousPosts || []).slice(0, 5).map(minPost),
        };
      },
    }
  )
);
