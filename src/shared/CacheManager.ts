import AsyncStorage from '@react-native-async-storage/async-storage';
import { Logger } from './Logger';

interface CacheItem<T = any> {
  value: T;
  timestamp: number;
  ttl?: number;
}

class CacheManagerService {
  private memoryCache: Map<string, CacheItem> = new Map();
  private maxMemoryItems = 200;

  set<T>(key: string, value: T, ttlMs?: number, persistToDisk = false): void {
    const item: CacheItem<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    };

    if (this.memoryCache.size >= this.maxMemoryItems) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }

    this.memoryCache.set(key, item);

    if (persistToDisk) {
      AsyncStorage.setItem(`anufy_cache_${key}`, JSON.stringify(item)).catch((err) => {
        Logger.error('CacheManager', `Failed to persist key ${key} to disk:`, err);
      });
    }
  }

  get<T>(key: string): T | null {
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem) {
      if (memoryItem.ttl && Date.now() - memoryItem.timestamp > memoryItem.ttl) {
        this.memoryCache.delete(key);
        return null;
      }
      return memoryItem.value as T;
    }
    return null;
  }

  async getAsync<T>(key: string): Promise<T | null> {
    const memoryValue = this.get<T>(key);
    if (memoryValue !== null) return memoryValue;

    try {
      const diskData = await AsyncStorage.getItem(`anufy_cache_${key}`);
      if (!diskData) return null;
      const parsed: CacheItem<T> = JSON.parse(diskData);
      if (parsed.ttl && Date.now() - parsed.timestamp > parsed.ttl) {
        AsyncStorage.removeItem(`anufy_cache_${key}`).catch(() => {});
        return null;
      }
      this.memoryCache.set(key, parsed);
      return parsed.value;
    } catch (e) {
      return null;
    }
  }

  remove(key: string): void {
    this.memoryCache.delete(key);
    AsyncStorage.removeItem(`anufy_cache_${key}`).catch(() => {});
  }

  clearMemory(): void {
    this.memoryCache.clear();
  }
}

export const CacheManager = new CacheManagerService();
