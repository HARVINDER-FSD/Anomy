import { useMultiScreenStore } from '../store/multiScreenStore';
import { getAuthToken } from '../utils/tokenUtils';
import { getBaseUrl } from '../api/config';

class TabWarmupManager {
  private isWarmingUp = false;

  /**
   * Smart Tab Warmup Engine: Refreshes ONLY stale screens based on TTL
   */
  async warmupAllTabs(mode: 'normal' | 'anonymous', force = false): Promise<void> {
    if (this.isWarmingUp) return;

    const store = useMultiScreenStore.getState();

    // Check which screens actually need refreshing based on TTL
    const needExplore = force || store.isStale('explore');
    const needReels = force || store.isStale('reels');
    const needChat = force || store.isStale('chat');
    const needNotif = force || store.isStale('notifications');
    const needProfile = force || store.isStale('profile');

    if (!needExplore && !needReels && !needChat && !needNotif && !needProfile) {
      return;
    }

    this.isWarmingUp = true;

    try {
      const token = await getAuthToken();
      if (!token) {
        this.isWarmingUp = false;
        return;
      }

      const baseUrl = getBaseUrl(false);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-Mode': mode,
      };


      const tasks: Promise<any>[] = [];

      if (needExplore) tasks.push(this.safeFetch(`${baseUrl}/api/bootstrap/explore`, headers, 'explore'));
      if (needReels) tasks.push(this.safeFetch(`${baseUrl}/api/bootstrap/reels`, headers, 'reels'));
      if (needChat) tasks.push(this.safeFetch(`${baseUrl}/api/bootstrap/chat`, headers, 'chat'));
      if (needNotif) tasks.push(this.safeFetch(`${baseUrl}/api/bootstrap/notifications`, headers, 'notifications'));
      if (needProfile) tasks.push(this.safeFetch(`${baseUrl}/api/bootstrap/profile`, headers, 'profile'));

      await Promise.allSettled(tasks);

    } catch (e) {
    } finally {
      this.isWarmingUp = false;
    }
  }

  /**
   * Refresh a single screen when user opens or focuses it if TTL expired
   */
  async refreshSingleScreen(
    screen: 'explore' | 'reels' | 'chat' | 'notifications' | 'profile' | 'stories' | 'search' | 'anonymous',
    mode: 'normal' | 'anonymous',
    force = false
  ): Promise<void> {
    const store = useMultiScreenStore.getState();
    if (!force && !store.isStale(screen)) {
      return; // Fresh cache!
    }

    try {
      const token = await getAuthToken();
      if (!token) return;

      const baseUrl = getBaseUrl(false);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-App-Mode': mode,
      };

      await this.safeFetch(`${baseUrl}/api/bootstrap/${screen}`, headers, screen);
    } catch (e) {
    }
  }

  private async safeFetch(
    url: string,
    headers: Record<string, string>,
    screenKey: 'explore' | 'reels' | 'chat' | 'notifications' | 'profile' | 'stories' | 'search' | 'anonymous'
  ): Promise<any> {
    try {
      const res = await fetch(url, { method: 'GET', headers });
      if (!res.ok) return null;
      const result = await res.json();
      if (result && result.success && result.data) {
        const store = useMultiScreenStore.getState();
        if (screenKey === 'explore') store.setExploreData(result.data);
        if (screenKey === 'reels') store.setReelsData(result.data);
        if (screenKey === 'chat') store.setChatData(result.data);
        if (screenKey === 'notifications') store.setNotificationsData(result.data);
        if (screenKey === 'profile') store.setProfileData(result.data);
        if (screenKey === 'stories') store.setStoriesData(result.data);
        if (screenKey === 'search') store.setSearchData(result.data);
        if (screenKey === 'anonymous') store.setAnonymousData(result.data);
      }
      return result;
    } catch {
      return null;
    }
  }
}

export const tabWarmupManager = new TabWarmupManager();
