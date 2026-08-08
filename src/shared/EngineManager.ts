import { BaseEngine } from '../engines/shared/BaseEngine';
import { EngineContext } from '../engines/shared/BaseTypes';
import { Logger } from './Logger';

class EngineManagerService {
  private engines: Map<string, BaseEngine> = new Map();
  private isInitialized = false;

  register(engine: BaseEngine): void {
    if (this.engines.has(engine.name)) {
      Logger.warn('EngineManager', `Engine ${engine.name} is already registered`);
      return;
    }
    this.engines.set(engine.name, engine);
    Logger.info('EngineManager', `Registered engine: ${engine.name}`);
  }

  get<T extends BaseEngine>(name: string): T {
    const engine = this.engines.get(name);
    if (!engine) {
      throw new Error(`[EngineManager] Engine ${name} is not registered!`);
    }
    return engine as T;
  }

  async initializeAll(context?: EngineContext): Promise<void> {
    if (this.isInitialized) return;
    Logger.info('EngineManager', 'Initializing all registered frontend engines...');

    for (const [name, engine] of this.engines.entries()) {
      try {
        await engine.initialize(context);
      } catch (err) {
        Logger.error('EngineManager', `Failed to initialize engine ${name}:`, err);
      }
    }

    this.isInitialized = true;
    Logger.info('EngineManager', 'All frontend engines initialized');
  }

  async destroyAll(): Promise<void> {
    for (const [name, engine] of this.engines.entries()) {
      try {
        await engine.destroy();
      } catch (err) {
        Logger.error('EngineManager', `Failed to destroy engine ${name}:`, err);
      }
    }
    this.engines.clear();
    this.isInitialized = false;
  }
}

export const EngineManager = new EngineManagerService();
