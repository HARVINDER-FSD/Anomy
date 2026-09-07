import { create } from 'zustand';

export interface UserCacheData {
  userData: any;
  posts: any[];
  shots: any[];
  followersCount: number;
  followingCount: number;
  lastUpdated: number;
}

interface UserCacheState {
  cache: Record<string, UserCacheData>;
  getUserCache: (key: string) => UserCacheData | null;
  setUserCache: (key: string, data: Partial<UserCacheData>) => void;
  removePostFromCache: (postId: string) => void;
  clearUserCache: (key?: string) => void;
}

export const useUserCacheStore = create<UserCacheState>((set, get) => ({
  cache: {},

  getUserCache: (key: string) => {
    if (!key) return null;
    const item = get().cache[key.toLowerCase()];
    if (!item) return null;
    // Cache valid for 10 minutes
    if (Date.now() - item.lastUpdated > 10 * 60 * 1000) {
      return item; // SWR will refresh in background
    }
    return item;
  },

  setUserCache: (key: string, data: Partial<UserCacheData>) => {
    if (!key) return;
    const lowerKey = key.toLowerCase();
    const existing = get().cache[lowerKey] || {
      userData: null,
      posts: [],
      shots: [],
      followersCount: 0,
      followingCount: 0,
      lastUpdated: Date.now(),
    };

    set((state) => ({
      cache: {
        ...state.cache,
        [lowerKey]: {
          ...existing,
          ...data,
          lastUpdated: Date.now(),
        },
      },
    }));
  },

  removePostFromCache: (postId: string) => {
    if (!postId) return;
    const targetId = String(postId);
    set((state) => {
      const nextCache: Record<string, UserCacheData> = {};
      Object.keys(state.cache).forEach((key) => {
        const item = state.cache[key];
        const newPosts = (item.posts || []).filter((p) => String(p._id || p.id) !== targetId);
        const newShots = (item.shots || []).filter((s) => String(s._id || s.id) !== targetId);
        const postsRemoved = (item.posts || []).length - newPosts.length;
        nextCache[key] = {
          ...item,
          posts: newPosts,
          shots: newShots,
          userData: item.userData ? {
            ...item.userData,
            posts_count: Math.max(0, (item.userData.posts_count || 1) - postsRemoved),
          } : item.userData,
        };
      });
      return { cache: nextCache };
    });
  },

  clearUserCache: (key?: string) => {
    if (!key) {
      set({ cache: {} });
    } else {
      set((state) => {
        const next = { ...state.cache };
        delete next[key.toLowerCase()];
        return { cache: next };
      });
    }
  },
}));
