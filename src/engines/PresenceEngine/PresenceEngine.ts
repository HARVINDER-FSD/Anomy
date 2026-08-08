import { BaseEngine } from '../shared/BaseEngine';
import { usePresenceStore } from './PresenceStore';
import { socketService } from '../../lib/socket';
import { EventBus } from '../../shared/EventBus';

export class PresenceEngineClass extends BaseEngine {
  readonly name = 'PresenceEngine';
  private typingTimeoutRef: any = null;

  protected async onInitialize(): Promise<void> {
    socketService.on('user:online', this.handleUserOnline);
    socketService.on('user:offline', this.handleUserOffline);
    socketService.on('chat:typing', this.handleTyping);
  }

  protected async onDestroy(): Promise<void> {
    socketService.off('user:online', this.handleUserOnline);
    socketService.off('user:offline', this.handleUserOffline);
    socketService.off('chat:typing', this.handleTyping);
  }

  sendTypingStatus(chatId: string, isTyping: boolean) {
    if (this.typingTimeoutRef) clearTimeout(this.typingTimeoutRef);

    socketService.sendTypingStatus({ chatId, isTyping });

    if (isTyping) {
      this.typingTimeoutRef = setTimeout(() => {
        socketService.sendTypingStatus({ chatId, isTyping: false });
      }, 3000);
    }
  }

  queryOnlineStatus(targetUserId: string) {
    socketService.queryOnlineStatus(targetUserId);
  }

  private handleUserOnline = ({ userId }: { userId: string }) => {
    usePresenceStore.getState().setOnlineStatus(userId, true);
    EventBus.emit('PRESENCE_USER_ONLINE', { userId });
  };

  private handleUserOffline = ({ userId }: { userId: string }) => {
    usePresenceStore.getState().setOnlineStatus(userId, false);
    EventBus.emit('PRESENCE_USER_OFFLINE', { userId });
  };

  private handleTyping = ({ chatId, userId, isTyping }: any) => {
    if (chatId && userId) {
      usePresenceStore.getState().setTyping(chatId, userId, !!isTyping);
    }
  };
}

export const PresenceEngine = new PresenceEngineClass();
