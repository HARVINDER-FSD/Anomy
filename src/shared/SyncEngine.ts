import { OfflineQueue, QueuedAction } from './OfflineQueue';
import { Logger } from './Logger';
import { EventBus } from './EventBus';

type SyncHandler = (action: QueuedAction) => Promise<boolean>;

class SyncEngineService {
  private handlers: Map<string, SyncHandler> = new Map();
  private isSyncing = false;

  registerHandler(type: string, handler: SyncHandler) {
    this.handlers.set(type, handler);
  }

  async sync(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    Logger.info('SyncEngine', 'Starting offline queue synchronization...');

    EventBus.emit('SYNC_STARTED');

    const queue = OfflineQueue.getQueue();
    for (const action of queue) {
      const handler = this.handlers.get(action.type);
      if (handler) {
        try {
          const success = await handler(action);
          if (success) {
            await OfflineQueue.dequeue(action.id);
            Logger.info('SyncEngine', `Successfully processed queued action: ${action.type}`);
          }
        } catch (e) {
          Logger.error('SyncEngine', `Failed to sync action ${action.id}:`, e);
        }
      }
    }

    this.isSyncing = false;
    EventBus.emit('SYNC_COMPLETED');
    Logger.info('SyncEngine', 'Offline queue sync finished');
  }
}

export const SyncEngine = new SyncEngineService();
