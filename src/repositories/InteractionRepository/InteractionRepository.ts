import { BaseRepository } from '../../engines/shared/BaseRepository';
import { socketService } from '../../lib/socket';
import { apiClient } from '../../api/client';

export class InteractionRepository extends BaseRepository {
  readonly name = 'InteractionRepository';

  async reactToMessage(messageId: string, emoji: string, chatId: string, forceAdd = false) {
    this.log(`Reacting to message ${messageId} with ${emoji} (forceAdd=${forceAdd})`);
    socketService.reactToMessage({ messageId, chatId, emoji, forceAdd });
  }

  async likePost(postId: string) {
    this.log(`Liking post ${postId}`);
    return apiClient.post(`/posts/${postId}/like`);
  }

  async bookmarkPost(postId: string) {
    this.log(`Bookmark post ${postId}`);
    return apiClient.post(`/posts/${postId}/bookmark`);
  }

  async followUser(targetUserId: string) {
    this.log(`Following user ${targetUserId}`);
    return apiClient.post(`/users/${targetUserId}/follow`);
  }

  async blockUser(targetUserId: string) {
    this.log(`Blocking user ${targetUserId}`);
    return apiClient.post(`/users/${targetUserId}/block`);
  }
}
