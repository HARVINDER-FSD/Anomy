import { BaseEngine } from '../shared/BaseEngine';
import { EngineManager } from '../../shared/EngineManager';
import { OfflineQueue } from '../../shared/OfflineQueue';
import { ChatEngine } from '../ChatEngine';
import { InteractionEngine } from '../InteractionEngine';
import { PresenceEngine } from '../PresenceEngine';
import { FeedEngine } from '../FeedEngine';
import { StoryEngine } from '../StoryEngine';
import { MediaEngine } from '../MediaEngine';
import { AnonymousEngine } from '../AnonymousEngine';
import { NotificationEngine } from '../NotificationEngine';
import { FeatureFlagEngine } from '../FeatureFlagEngine';
import { PermissionEngine } from '../PermissionEngine';
import { BackgroundTaskEngine } from '../BackgroundTaskEngine';
import { CallEngine } from '../CallEngine';
import { AdEngine } from '../AdEngine';
import { Logger } from '../../shared/Logger';

export class BootstrapEngineClass extends BaseEngine {
  readonly name = 'BootstrapEngine';

  protected async onInitialize(): Promise<void> {
    Logger.info(this.name, 'Bootstrapping AnuFy Enterprise Engine Framework...');

    // 1. Initialize Shared Infrastructure
    await OfflineQueue.init();
    Logger.info(this.name, 'Shared infrastructure (OfflineQueue, CacheManager) ready');

    // 2. Register all enterprise engines with EngineManager in strict sequence
    EngineManager.register(PresenceEngine);
    EngineManager.register(ChatEngine);
    EngineManager.register(InteractionEngine);
    EngineManager.register(FeedEngine);
    EngineManager.register(StoryEngine);
    EngineManager.register(MediaEngine);
    EngineManager.register(AnonymousEngine);
    EngineManager.register(NotificationEngine);
    EngineManager.register(FeatureFlagEngine);
    EngineManager.register(PermissionEngine);
    EngineManager.register(BackgroundTaskEngine);
    EngineManager.register(CallEngine);
    EngineManager.register(AdEngine);

    // 3. Initialize all registered engines
    await EngineManager.initializeAll(this.context);
    Logger.info(this.name, 'All enterprise engines bootstrapped in exact sequence');
  }

  protected async onDestroy(): Promise<void> {
    await EngineManager.destroyAll();
  }
}

export const BootstrapEngine = new BootstrapEngineClass();
