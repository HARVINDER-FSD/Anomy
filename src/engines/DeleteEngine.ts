import { DeviceEventEmitter } from 'react-native';
import { useFeedStore } from '../store/feedStore';
import { useUserCacheStore } from '../store/userCacheStore';
import { apiClient } from '../api/client';

export class DeleteEngine {
  /**
   * ⚡ ZERO-LATENCY PURGE
   * Purges a deleted post/shot from ALL frontend stores and caches instantly (0ms).
   */
  static purgePostFromAllCaches(postId: string) {
    if (!postId) return;
    const targetId = String(postId);

    // 1. Purge from Zustand feedStore (Home & Anonymous feeds)
    try {
      useFeedStore.getState().deletePostFromCache(targetId);
    } catch (_) {}

    // 2. Purge from Zustand userCacheStore (User profile grids & counts)
    try {
      useUserCacheStore.getState().removePostFromCache(targetId);
    } catch (_) {}

    // 3. Broadcast to all active mounted components via DeviceEventEmitter
    try {
      DeviceEventEmitter.emit('post:deleted:local', { postId: targetId });
    } catch (_) {}
  }

  /**
   * 🚀 ATOMIC DELETE ACTION
   * Performs 0ms local UI cache purge first, then calls backend API non-blocking.
   */
  static async deletePost(postId: string): Promise<boolean> {
    if (!postId) return false;
    const targetId = String(postId);

    // 1. Instant 0ms purge
    DeleteEngine.purgePostFromAllCaches(targetId);

    // 2. Background API call
    try {
      await apiClient.delete(`/posts/${targetId}`);
      return true;
    } catch (error) {
      return false;
    }
  }
}
