import { BaseEngine } from '../shared/BaseEngine';
import { useNotificationEngineStore } from './NotificationStore';
import { apiClient } from '../../api/client';
import { EventBus } from '../../shared/EventBus';

export class NotificationEngineClass extends BaseEngine {
  readonly name = 'NotificationEngine';

  protected async onInitialize(): Promise<void> {
    this.fetchUnreadCount();
  }

  protected async onDestroy(): Promise<void> {}

  async fetchUnreadCount(): Promise<number> {
    try {
      const res = await apiClient.get('/notifications/unread-count');
      const count = res.data?.count || res.data?.unreadCount || 0;
      useNotificationEngineStore.getState().setUnreadCount(count);
      EventBus.emit('NOTIFICATION_COUNT_UPDATED', { count });
      return count;
    } catch {
      return 0;
    }
  }

  async markAllAsRead(): Promise<void> {
    useNotificationEngineStore.getState().setUnreadCount(0);
    apiClient.post('/notifications/mark-read').catch(() => {});
  }
}

export const NotificationEngine = new NotificationEngineClass();
