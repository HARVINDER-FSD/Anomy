export interface EngineContext {
  userId?: string;
  token?: string;
  isAnonymous?: boolean;
}

export enum EngineStatus {
  UNINITIALIZED = 'UNINITIALIZED',
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  ERROR = 'ERROR',
  DESTROYED = 'DESTROYED',
}

export interface IEngine {
  readonly name: string;
  status: EngineStatus;
  initialize(context?: EngineContext): Promise<void>;
  destroy(): Promise<void>;
}

export interface IRepository {
  readonly name: string;
}

export interface EngineEvent<T = any> {
  type: string;
  payload: T;
  timestamp: string;
  engine: string;
}
