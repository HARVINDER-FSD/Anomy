import { create } from 'zustand';

export interface StoryGroup {
  user: any;
  stories: any[];
  hasUnseen: boolean;
}

interface StoryStoreState {
  storyGroups: StoryGroup[];
  isLoading: boolean;

  setStoryGroups: (groups: StoryGroup[]) => void;
  markStoryViewed: (storyId: string) => void;
}

export const useStoryStore = create<StoryStoreState>((set) => ({
  storyGroups: [],
  isLoading: false,

  setStoryGroups: (storyGroups) => set({ storyGroups }),
  markStoryViewed: (storyId) =>
    set((state) => ({
      storyGroups: state.storyGroups.map((g) => ({
        ...g,
        stories: g.stories.map((s) => (s._id === storyId ? { ...s, is_viewed: true } : s)),
      })),
    })),
}));
