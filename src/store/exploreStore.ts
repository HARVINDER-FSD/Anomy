import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ExploreStore {
  cachedTrendingWhispers: any[];
  setCachedTrendingWhispers: (whispers: any[]) => void;
  cachedNormalWhispers: any[];
  setCachedNormalWhispers: (whispers: any[]) => void;
  cachedGhostRooms: any[];
  setCachedGhostRooms: (rooms: any[]) => void;
  clearAllExploreCaches: () => void;
}

export const useExploreStore = create<ExploreStore>()(
  persist(
    (set) => ({
      cachedTrendingWhispers: [],
      setCachedTrendingWhispers: (whispers) => set({ cachedTrendingWhispers: whispers }),
      cachedNormalWhispers: [],
      setCachedNormalWhispers: (whispers) => set({ cachedNormalWhispers: whispers }),
      cachedGhostRooms: [],
      setCachedGhostRooms: (rooms) => set({ cachedGhostRooms: rooms }),
      clearAllExploreCaches: () => set({ cachedTrendingWhispers: [], cachedNormalWhispers: [], cachedGhostRooms: [] }),
    }),
    {
      name: 'anufy-explore-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Store first 10 items to prevent SQLite storage limits
        cachedTrendingWhispers: state.cachedTrendingWhispers.slice(0, 10).map((p: any) => ({
          _id: p._id, id: p.id,
          content: p.content, timestamp: p.timestamp, created_at: p.created_at,
          likes: p.likes, likes_count: p.likes_count,
          comments: p.comments, comments_count: p.comments_count,
          user: p.user ? { username: p.user.username } : undefined,
        })),
        cachedNormalWhispers: state.cachedNormalWhispers.slice(0, 10).map((p: any) => ({
          _id: p._id, id: p.id,
          content: p.content, timestamp: p.timestamp, created_at: p.created_at,
          likes: p.likes, likes_count: p.likes_count,
          comments: p.comments, comments_count: p.comments_count,
          user: p.user ? { username: p.user.username } : undefined,
        })),
        cachedGhostRooms: state.cachedGhostRooms.slice(0, 10).map((r: any) => ({
          _id: r._id, id: r.id,
          name: r.name,
          participants: r.participants ? r.participants.map((p: any) => ({ user: p.user })) : [],
        })),
      }),
    }
  )
);
