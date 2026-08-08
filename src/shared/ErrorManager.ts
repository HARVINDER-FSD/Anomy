import { Alert } from 'react-native';
import { Logger } from './Logger';

export interface RollbackAction {
  id: string;
  rollback: () => void;
}

class ErrorManagerService {
  private rollbackRegistry: Map<string, () => void> = new Map();

  registerRollback(id: string, rollbackFn: () => void) {
    this.rollbackRegistry.set(id, rollbackFn);
  }

  executeRollback(id: string) {
    const rollback = this.rollbackRegistry.get(id);
    if (rollback) {
      Logger.warn('ErrorManager', `Executing optimistic UI rollback for action: ${id}`);
      try {
        rollback();
      } catch (e) {
        Logger.error('ErrorManager', `Rollback failed for action: ${id}`, e);
      } finally {
        this.rollbackRegistry.delete(id);
      }
    }
  }

  handleError(source: string, message: string, error?: any, showToast = false) {
    Logger.error(source, message, error);
    if (showToast) {
      Alert.alert('Notice', message);
    }
  }
}

export const ErrorManager = new ErrorManagerService();
