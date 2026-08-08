import { BaseEngine } from '../shared/BaseEngine';
import { useFeedStore } from './FeedStore';
import { apiClient } from '../../api/client';
import { InteractionEngine } from '../InteractionEngine';
import { EventBus } from '../../shared/EventBus';
import { CacheManager } from '../../shared/CacheManager';

export class FeedEngineClass extends BaseEngine {
  readonly name = 'FeedEngine';

  protected async onInitialize(): Promise<void> {
    const cached = await CacheManager.getAsync<any[]>('home_feed');
    if (cached) {
      useFeedStore.getState().setPosts(cached);
    }
  }

  protected async onDestroy(): Promise<void> {}

  async fetchHomeFeed(refresh = false): Promise<void> {
    try {
      useFeedStore.getState().setLoading(true);
      const res = await apiClient.get('/posts/feed');
      const posts = Array.isArray(res.data) ? res.data : (res.data?.data || []);

      useFeedStore.getState().setPosts(posts);
      CacheManager.set('home_feed', posts, 10 * 60 * 1000, true);
      EventBus.emit('FEED_LOADED', { count: posts.length });
    } catch (err) {
      this.context;
    } finally {
      useFeedStore.getState().setLoading(false);
    }
  }

  async likePost(postId: string): Promise<void> {
    await InteractionEngine.likePost(postId);
  }
}

export const FeedEngine = new FeedEngineClass();
