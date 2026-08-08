import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'react-native';
import { useBootstrapStore } from '../store/bootstrapStore';
import { tabWarmupManager } from './tabWarmupManager';
import { getBaseUrl } from '../api/config';
import { getAuthToken } from '../utils/tokenUtils';

class BackgroundPrefetchService {
  private isRunning = false;

  /**
   * Start sequential background prefetch after home screen renders (Instagram Strategy)
   */
  async startPrefetch(mode: 'normal' | 'anonymous'): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const token = await getAuthToken();
      if (!token) {
        this.isRunning = false;
        return;
      }

      const baseUrl = getBaseUrl(false);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-Mode': mode,
      };


      // Task 1: Trigger Multi-Screen Tab Warmup Engine (Explore, Shorts, Chat, Notifications, Profile)
      await tabWarmupManager.warmupAllTabs(mode);

      // Task 2: Prefetch Opposite Mode's Bootstrap Feed (So Mode Switch is 100% Instant!)
      await this.sleep(200);
      const oppositeMode = mode === 'anonymous' ? 'normal' : 'anonymous';
      const oppositeBootstrap = await this.safeFetch(
        `${baseUrl}/api/bootstrap?mode=${oppositeMode}`,
        {
          ...headers,
          'X-App-Mode': oppositeMode,
        }
      );

      if (oppositeBootstrap && oppositeBootstrap.success && oppositeBootstrap.data) {
        useBootstrapStore.getState().setOppositeModeData(oppositeBootstrap.data);
      }

    } catch (e) {
    } finally {
      this.isRunning = false;
    }
  }

  private async safeFetch(url: string, headers: Record<string, string>): Promise<any> {
    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const backgroundPrefetchManager = new BackgroundPrefetchService();
