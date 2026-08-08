import { BaseEngine } from '../shared/BaseEngine';
import { InteractionRepository } from '../../repositories/InteractionRepository/InteractionRepository';
import { useInteractionStore } from './InteractionStore';
import { EventBus } from '../../shared/EventBus';
import { ErrorManager } from '../../shared/ErrorManager';

export class InteractionEngineClass extends BaseEngine {
  readonly name = 'InteractionEngine';
  public repository: InteractionRepository;

  constructor() {
    super();
    this.repository = new InteractionRepository();
  }

  protected async onInitialize(): Promise<void> {}
  protected async onDestroy(): Promise<void> {}

  // ── APP-WIDE INTERACTIONS ─────────────────────────────────────────────

  async reactToMessage(messageId: string, emoji: string, chatId: string, forceAdd = false) {
    await this.repository.reactToMessage(messageId, emoji, chatId, forceAdd);
    EventBus.emit('INTERACTION_MESSAGE_REACTED', { messageId, emoji, chatId });
  }

  async likePost(postId: string) {
    const currentState = !!useInteractionStore.getState().likedPosts[postId];
    const newState = !currentState;

    // Optimistic Update
    useInteractionStore.getState().setLiked(postId, newState);

    ErrorManager.registerRollback(`like_post_${postId}`, () => {
      useInteractionStore.getState().setLiked(postId, currentState);
    });

    try {
      await this.repository.likePost(postId);
      EventBus.emit('INTERACTION_POST_LIKED', { postId, liked: newState });
    } catch (err) {
      ErrorManager.executeRollback(`like_post_${postId}`);
      ErrorManager.handleError(this.name, 'Failed to update post like', err, true);
    }
  }

  async bookmarkPost(postId: string) {
    const currentState = !!useInteractionStore.getState().bookmarkedPosts[postId];
    const newState = !currentState;

    useInteractionStore.getState().setBookmarked(postId, newState);

    try {
      await this.repository.bookmarkPost(postId);
      EventBus.emit('INTERACTION_POST_BOOKMARKED', { postId, bookmarked: newState });
    } catch (err) {
      useInteractionStore.getState().setBookmarked(postId, currentState);
      ErrorManager.handleError(this.name, 'Failed to bookmark post', err, true);
    }
  }

  async followUser(targetUserId: string) {
    const currentState = !!useInteractionStore.getState().followingUsers[targetUserId];
    const newState = !currentState;

    useInteractionStore.getState().setFollowing(targetUserId, newState);

    try {
      await this.repository.followUser(targetUserId);
      EventBus.emit('INTERACTION_USER_FOLLOWED', { targetUserId, following: newState });
    } catch (err) {
      useInteractionStore.getState().setFollowing(targetUserId, currentState);
      ErrorManager.handleError(this.name, 'Failed to follow user', err, true);
    }
  }
}

export const InteractionEngine = new InteractionEngineClass();
