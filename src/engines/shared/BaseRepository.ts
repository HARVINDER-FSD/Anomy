import { IRepository } from './BaseTypes';
import { Logger } from '../../shared/Logger';

export abstract class BaseRepository implements IRepository {
  abstract readonly name: string;

  protected log(message: string, ...args: any[]) {
    Logger.debug(this.name, message, ...args);
  }

  protected logError(message: string, error?: any) {
    Logger.error(this.name, message, error);
  }
}
