import { BaseEngine } from '../shared/BaseEngine';
import { useStoryStore } from './StoryStore';
import { apiClient } from '../../api/client';
import { EventBus } from '../../shared/EventBus';
import { CacheManager } from '../../shared/CacheManager';

export class StoryEngineClass extends BaseEngine {
  readonly name = 'StoryEngine';

  protected async onInitialize(): Promise<void> {
    const cached = await CacheManager.getAsync<any[]>('stories_feed');
    if (cached) {
      useStoryStore.getState().setStoryGroups(cached);
    }
  }

  protected async onDestroy(): Promise<void> {}

  async fetchStories(): Promise<void> {
    try {
      const res = await apiClient.get('/stories/feed');
      const groups = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      useStoryStore.getState().setStoryGroups(groups);
      CacheManager.set('stories_feed', groups, 5 * 60 * 1000, true);
    } catch (err) {}
  }

  async markStoryViewed(storyId: string): Promise<void> {
    useStoryStore.getState().markStoryViewed(storyId);
    apiClient.post(`/stories/${storyId}/view`).catch(() => {});
    EventBus.emit('STORY_VIEWED', { storyId });
  }
}

export const StoryEngine = new StoryEngineClass();
