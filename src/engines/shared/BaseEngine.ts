import { EngineStatus, IEngine, EngineContext } from './BaseTypes';
import { EventBus } from '../../shared/EventBus';
import { Logger } from '../../shared/Logger';

export abstract class BaseEngine implements IEngine {
  abstract readonly name: string;
  public status: EngineStatus = EngineStatus.UNINITIALIZED;
  protected context: EngineContext = {};

  async initialize(context?: EngineContext): Promise<void> {
    if (this.status === EngineStatus.READY) return;
    this.status = EngineStatus.INITIALIZING;
    if (context) this.context = { ...this.context, ...context };

    try {
      await this.onInitialize();
      this.status = EngineStatus.READY;
      EventBus.emit(`${this.name}_INITIALIZED`, { engine: this.name });
      Logger.info(this.name, 'Engine initialized successfully');
    } catch (error) {
      this.status = EngineStatus.ERROR;
      Logger.error(this.name, 'Engine initialization failed:', error);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    try {
      await this.onDestroy();
      this.status = EngineStatus.DESTROYED;
      EventBus.emit(`${this.name}_DESTROYED`, { engine: this.name });
      Logger.info(this.name, 'Engine destroyed');
    } catch (error) {
      Logger.error(this.name, 'Engine destruction failed:', error);
    }
  }

  protected abstract onInitialize(): Promise<void>;
  protected abstract onDestroy(): Promise<void>;
}
