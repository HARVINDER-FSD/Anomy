import { BaseEngine } from '../shared/BaseEngine';
import { SyncEngine } from '../../shared/SyncEngine';
import { Logger } from '../../shared/Logger';

export class BackgroundTaskEngineClass extends BaseEngine {
  readonly name = 'BackgroundTaskEngine';
  private syncTimer: any = null;

  protected async onInitialize(): Promise<void> {
    // Schedule periodic background sync every 60 seconds
    this.syncTimer = setInterval(() => {
      Logger.debug(this.name, 'Running periodic background sync...');
      SyncEngine.sync().catch((err) => {
        Logger.error(this.name, 'Periodic sync error:', err);
      });
    }, 60000);
  }

  protected async onDestroy(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer);
  }
}

export const BackgroundTaskEngine = new BackgroundTaskEngineClass();
