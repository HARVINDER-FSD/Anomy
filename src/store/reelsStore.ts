import { create } from 'zustand';

interface ReelsStore {
  activeReelData: any | null;
  setActiveReelData: (data: any | null) => void;
  preloadedReels: any[];
  setPreloadedReels: (reels: any[]) => void;
}

export const useReelsStore = create<ReelsStore>((set) => ({
  activeReelData: null,
  setActiveReelData: (data) => set({ activeReelData: data }),
  preloadedReels: [],
  setPreloadedReels: (reels) => set({ preloadedReels: reels }),
}));
