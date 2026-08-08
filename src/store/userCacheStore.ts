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
