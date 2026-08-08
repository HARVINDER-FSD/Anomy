import { useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useMultiScreenStore } from '../store/multiScreenStore';
import { tabWarmupManager } from '../services/tabWarmupManager';
import { useBootstrapStore } from '../store/bootstrapStore';

export function useTabBootstrap(
  screenName?: 'explore' | 'reels' | 'chat' | 'notifications' | 'profile'
) {
  const activeMode = useBootstrapStore((s) => s.activeMode);
  const store = useMultiScreenStore();

  const exploreData = store.explore?.data || null;
  const reelsData = store.reels?.data || null;
  const chatData = store.chat?.data || null;
  const notificationsData = store.notifications?.data || null;
  const profileData = store.profile?.data || null;

  // 🚀 Screen Focus Refresh: When screen enters focus, refresh ONLY if TTL is stale
  useFocusEffect(
    useCallback(() => {
      if (screenName) {
        tabWarmupManager.refreshSingleScreen(screenName, activeMode, false);
      }
    }, [screenName, activeMode])
  );

  useEffect(() => {
    // Initial silent warmup if all caches are empty
    if (!exploreData && !reelsData && !chatData && !notificationsData && !profileData) {
      tabWarmupManager.warmupAllTabs(activeMode);
    }
  }, [activeMode, exploreData, reelsData, chatData, notificationsData, profileData]);

  return {
    exploreData,
    reelsData,
    chatData,
    notificationsData,
    profileData,
    refreshCurrentScreen: () => screenName && tabWarmupManager.refreshSingleScreen(screenName, activeMode, true),
    refreshAllTabs: () => tabWarmupManager.warmupAllTabs(activeMode, true),
  };
}
