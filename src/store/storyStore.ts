import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

interface Story {
  _id: string;
  user: {
    _id: string;
    username: string;
    avatar_url?: string;
  };
  hasUnread: boolean;
  lastStoryId: string;
}

interface StoryStore {
  stories: Story[];
  lastFetched: number;
  setStories: (stories: Story[]) => void;
  fetchStories: (currentUser: any) => Promise<void>;
}

export const useStoryStore = create<StoryStore>()(
  persist(
    (set, get) => ({
      stories: [],
      lastFetched: 0,
      setStories: (stories) => set({ stories }),
      fetchStories: async (currentUser) => {
        try {
          const res = await apiClient.get('/stories');
          if (res.data?.success) {
            const rawStories = res.data.data || [];
            const userGroups: Record<string, Story> = {};
            const myId = (currentUser?.id || currentUser?._id)?.toString();
            
            rawStories.forEach((s: any) => {
              const uid = s.user_id;
              if (uid === myId) return;

              if (!userGroups[uid]) {
                userGroups[uid] = {
                  _id: uid,
                  user: {
                    _id: uid,
                    username: s.username,
                    avatar_url: s.avatar_url,
                  },
                  hasUnread: !s.is_viewed,
                  lastStoryId: s.id,
                };
              } else {
                if (!s.is_viewed) {
                  userGroups[uid].hasUnread = true;
                }
              }
            });

            const myStories = rawStories.filter((s: any) => s.user_id === myId);
            const hasMyStories = myStories.length > 0;
            const myUnread = myStories.some((s: any) => !s.is_viewed);

            const finalStories = [
              {
                _id: 'me',
                user: {
                  _id: myId || 'me',
                  username: 'Your Story',
                  avatar_url: currentUser?.avatar_url || currentUser?.avatar,
                },
                hasUnread: myUnread,
                lastStoryId: hasMyStories ? myStories[0].id : '',
              },
              ...Object.values(userGroups),
            ];

            set({ stories: finalStories, lastFetched: Date.now() });
          }
        } catch (error) {
        }
      },
    }),
    {
      name: 'anufy-story-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        stories: (state.stories || []).slice(0, 15).map((s: any) => ({
          _id: s._id,
          hasUnread: s.hasUnread,
          lastStoryId: s.lastStoryId,
          user: s.user ? {
            _id: s.user._id,
            username: s.user.username,
            avatar_url: s.user.avatar_url,
          } : undefined,
        })),
        lastFetched: state.lastFetched,
      }),
    }
  )
);
