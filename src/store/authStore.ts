import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { socketService } from '../lib/socket';
import { apiClient } from '../api/client';
import { useChatStore } from './chatStore';
import { useBootstrapStore } from './bootstrapStore';

export interface User {
  id: string;
  _id?: string;
  name?: string;
  full_name?: string;
  username: string;
  email: string;
  avatar?: string;
  avatar_url?: string;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  is_verified?: boolean;
  badge_type?: string | null;
  is_private?: boolean;
  blocked_users?: string[];
  restricted_users?: string[];
  isAnonymousMode?: boolean;
  anonymousReputation?: number;
  anonymousPersona?: {
    username: string;
    name: string;
    avatar: string;
  };
  customReactions?: string[];
  phone?: string;
  dob?: string;
  birthday?: string;
  gender?: string;
  website?: string;
  location?: string;
  account_type?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string, refreshToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;
  toggleAnonymousMode: () => Promise<void>;
  setCustomReactions: (reactions: string[]) => Promise<void>;
  updateBlockedUsers: (userId: string, isBlocked: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true, // App start hotie hi true rhega taaki pehle async check ho ki token h nai.

  setAuth: async (user, token, refreshToken) => {
    const current = useAuthStore.getState().user;

    // 🛡️ ACCOUNT SWITCH GUARD: If logging into a different user account, clear old user profile cache!
    if (current && user && String(current.id || current._id) !== String(user.id || user._id)) {
      try {
        const { useProfileStore } = await import('./profileStore');
        await useProfileStore.getState().clearCache();
      } catch (_) {}
    }

    const finalUser = user ? {
      ...user,
      anonymousPersona: user.anonymousPersona || (current && String(current.id || current._id) === String(user.id || user._id) ? current.anonymousPersona : undefined)
    } : user;

    // Update state FIRST for instant UI update!
    set({ user: finalUser, token });
    socketService.connect(token);

    // Then persist to storage in background, with error handling
    try {
      await AsyncStorage.setItem('auth-token', token);
      await AsyncStorage.setItem('auth-user', JSON.stringify(finalUser));
      if (refreshToken) {
        await AsyncStorage.setItem('auth-refresh-token', refreshToken);
      }
    } catch (e) {
    }
  },

  // Logout ke liye:
  logout: async () => {
    // Update state FIRST!
    set({ user: null, token: null });
    socketService.disconnect();

    // Clear profile store in-memory cache
    try {
      const { useProfileStore } = await import('./profileStore');
      await useProfileStore.getState().clearCache();
    } catch (_) {}

    // Clear explore store cache
    try {
      const { useExploreStore } = await import('./exploreStore');
      useExploreStore.getState().clearAllExploreCaches();
    } catch (_) {}

    // Clear storage in background with error handling
    try {
      await AsyncStorage.removeItem('auth-token');
      await AsyncStorage.removeItem('auth-user');
      await AsyncStorage.removeItem('auth-refresh-token');
      await AsyncStorage.removeItem('profile_cache_reality');
      await AsyncStorage.removeItem('profile_cache_ghost');
      await AsyncStorage.removeItem('anufy-explore-storage');
    } catch (e) {
    }
  },

  // App open hone par ye check karta h ki user pehle se logged in tha ya nai (persistent state check).
  initializeAuth: async () => {
    // If AsyncStorage is full, try to clear non-essential data first
    const tryClearNonEssentialCache = async () => {
      try {
        // Get all keys first
        const keys = await AsyncStorage.getAllKeys();
        const keysToClear = keys.filter(key => 
          !key.startsWith('auth-') // Keep auth keys only
        );
        if (keysToClear.length > 0) {
          await AsyncStorage.multiRemove(keysToClear);
        }
      } catch (e) {
      }
    };

    try {
      const token = await AsyncStorage.getItem('auth-token');
      const userStr = await AsyncStorage.getItem('auth-user');

      if (token && userStr) {
        const localUser = JSON.parse(userStr);
        // ✅ Instantly set user from local cache — no waiting
        set({ user: localUser, token, isLoading: false });
        socketService.connect(token);

        // 🔄 Background sync — fetch latest user data WITHOUT blocking login
        setTimeout(async () => {
          try {
            const { apiClient } = await import('../api/client');
            const res = await apiClient.get('/users/me');
            if (res.data) {
              const updatedUser = { ...localUser, ...res.data };
              set({ user: updatedUser });
              // Save silently — don't block UI
              AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser)).catch(() => {});
            }
          } catch (syncErr: any) {
            if (
              syncErr.status === 401 ||
              syncErr.status === 403 ||
              syncErr.status === 404 ||
              syncErr.message?.includes('User not found') ||
              syncErr.message?.includes('Invalid or expired token')
            ) {
              const { logout } = useAuthStore.getState();
              await logout();
            }
          }
        }, 0); // Fire immediately but off the render-blocking thread
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      await tryClearNonEssentialCache();
      set({ isLoading: false });
    }
  },

  toggleAnonymousMode: async () => {
    const state = useAuthStore.getState();
    const user = state.user;
    const token = state.token;

    if (!user || !token) return;

    try {
      const newMode = !user.isAnonymousMode;

      // 🚀 INSTANT OPTIMISTIC UI UPDATE
      const { LayoutAnimation, Platform, UIManager } = require('react-native');
      const isNewArch = !!((global as any).nativeFabricUIScheduler || (global as any).RN$Bridgeless);
      if (Platform.OS === 'android' && !isNewArch && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      // Build local anonymous persona if needed
      let persona = user.anonymousPersona;
      if (newMode && (!persona || !persona.avatar || !persona.name)) {
        const seed = user.username || user.id || 'ghost';
        persona = {
          name: `@ghost_${seed.substring(0, 6)}`,
          username: `ghost_${seed.substring(0, 6)}`,
          avatar: `https://api.dicebear.com/7.x/bottts/png?seed=${encodeURIComponent(seed)}`,
        };
      }

      // Optimistically update local state
      const optimisticUser = {
        ...user,
        isAnonymousMode: newMode,
        ...(newMode && persona ? { anonymousPersona: persona } : {}),
      };
      set({ user: optimisticUser });
      try { AsyncStorage.setItem('auth-user', JSON.stringify(optimisticUser)); } catch {}

      const startTime = Date.now();

      // Emit immediately for feed & chat to switch with cached data
      DeviceEventEmitter.emit('mode_switched', { isAnonymous: newMode });

      try {
        const { performanceEngine } = await import('../engines/PerformanceEngine/PerformanceEngine');
        performanceEngine.trackCacheAccess('Feed', true);
        performanceEngine.addTimelineEntry(
          newMode ? 'Ghost Mode Switched' : 'Normal Mode Switched',
          Date.now() - startTime,
          true
        );
      } catch (_) {}

      // Chat store switch
      try {
        if (typeof useChatStore.getState().switchMode === 'function') {
          useChatStore.getState().switchMode(newMode);
        }
        void useChatStore.getState().refreshConversations(newMode);
      } catch (e) {
      }

      // 🔄 SINGLE ATOMIC API CALL: switch mode + get fresh bootstrap data
      const targetMode = newMode ? 'anonymous' : 'normal';
      const res = await apiClient.post('/bootstrap/switch-mode', { mode: targetMode });

      if (res.data?.success) {
        // Confirm final mode from server
        const serverMode: boolean = res.data.newMode === 'anonymous';
        const currentUser = useAuthStore.getState().user;
        if (currentUser && currentUser.isAnonymousMode !== serverMode) {
          const finalUser = {
            ...currentUser,
            isAnonymousMode: serverMode,
            anonymousPersona: optimisticUser.anonymousPersona,
          };
          set({ user: finalUser });
          try { AsyncStorage.setItem('auth-user', JSON.stringify(finalUser)); } catch {}
          DeviceEventEmitter.emit('mode_switched', { isAnonymous: serverMode });
        }

        // Push fresh screen data to bootstrap store
        if (res.data.data) {
          try {
            useBootstrapStore.getState().setBootstrapData(res.data.data);
          } catch (e) {
          }
        }
      }
    } catch (error) {
      // Rollback on API failure
      set({ user });
      const { DeviceEventEmitter } = require('react-native');
      DeviceEventEmitter.emit('mode_switched', { isAnonymous: user.isAnonymousMode });
    }
  },

  setCustomReactions: async (reactions: string[]) => {
    const state = useAuthStore.getState();
    if (!state.user) return;

    const updatedUser = { ...state.user, customReactions: reactions };
    set({ user: updatedUser });
    // Persist in background, fail silently
    try {
      await AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser));
    } catch (e) {
    }
  },

  updateBlockedUsers: (targetId: string, isBlocked: boolean) => {
    const state = useAuthStore.getState();
    const user = state.user;
    if (!user) return;

    let blockedList = user.blocked_users || [];
    if (isBlocked) {
      if (!blockedList.includes(targetId)) {
        blockedList = [...blockedList, targetId];
      }
    } else {
      blockedList = blockedList.filter((id) => id !== targetId);
    }

    const updatedUser = { ...user, blocked_users: blockedList };
    set({ user: updatedUser });
    // Persist in background, fail silently
    try {
      AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser));
    } catch (err) {
    }
  },
}));
