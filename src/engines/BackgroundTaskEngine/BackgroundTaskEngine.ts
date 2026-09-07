import { BaseEngine } from '../shared/BaseEngine';
import { SyncEngine } from '../../shared/SyncEngine';
import { OfflineQueue } from '../../shared/OfflineQueue';
import { Logger } from '../../shared/Logger';

export class BackgroundTaskEngineClass extends BaseEngine {
  readonly name = 'BackgroundTaskEngine';
  private syncTimer: any = null;

  protected async onInitialize(): Promise<void> {
    // Schedule periodic background sync every 60 seconds (only if queue has items)
    this.syncTimer = setInterval(() => {
      try {
        const queue = OfflineQueue.getQueue();
        if (queue && queue.length > 0) {
          SyncEngine.sync().catch(() => {});
        }
      } catch (_) {}
    }, 60000);
  }

  protected async onDestroy(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}

export const BackgroundTaskEngine = new BackgroundTaskEngineClass();
