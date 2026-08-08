import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from './Logger';

export interface QueuedAction {
  id: string;
  type: string;
  payload: any;
  createdAt: number;
  retryCount: number;
}

class OfflineQueueService {
  private queue: QueuedAction[] = [];
  private STORAGE_KEY = 'anufy_offline_queue';

  async init() {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        Logger.info('OfflineQueue', `Loaded ${this.queue.length} pending queued items`);
      }
    } catch (e) {
      Logger.error('OfflineQueue', 'Failed to load offline queue from disk', e);
    }
  }

  async enqueue(type: string, payload: any): Promise<QueuedAction> {
    const action: QueuedAction = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.queue.push(action);
    await this.persist();
    Logger.info('OfflineQueue', `Enqueued action: ${type}`, action);
    return action;
  }

  async dequeue(id: string): Promise<void> {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.persist();
  }

  getQueue(): QueuedAction[] {
    return [...this.queue];
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      Logger.error('OfflineQueue', 'Failed to persist queue to disk', e);
    }
  }
}

export const OfflineQueue = new OfflineQueueService();
