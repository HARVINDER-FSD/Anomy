import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { socketService } from '../lib/socket';

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
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: User, token: string) => Promise<void>;
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

  // Jab User Login ya Signup kare to yeh call krna hoga: setup credential on app memory and phone storage
  setAuth: async (user, token) => {
    await AsyncStorage.setItem('auth-token', token);
    await AsyncStorage.setItem('auth-user', JSON.stringify(user));
    set({ user, token });
    socketService.connect(token);
  },

  // Logout ke liye:
  logout: async () => {
    await AsyncStorage.removeItem('auth-token');
    await AsyncStorage.removeItem('auth-user');
    set({ user: null, token: null });
    socketService.disconnect();
  },

  // App open hone par ye check karta h ki user pehle se logged in tha ya nai (persistent state check).
  initializeAuth: async () => {
    try {
      const token = await AsyncStorage.getItem('auth-token');
      const userStr = await AsyncStorage.getItem('auth-user');

      if (token && userStr) {
        const localUser = JSON.parse(userStr);
        set({ user: localUser, token, isLoading: false });
        socketService.connect(token);

        // Fetch latest user data in background to sync (blocked_users, etc.)
        try {
          const { apiClient } = await import('../api/client');
          const res = await apiClient.get('/users/me');
          if (res.data) {
            const updatedUser = { ...localUser, ...res.data };
            set({ user: updatedUser });
            await AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser));
          }
        } catch (syncErr) {
          console.log('[authStore] Failed to sync latest user profile:', syncErr);
        }
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('Error fetching auth state from storage:', error);
      set({ isLoading: false });
    }
  },

  toggleAnonymousMode: async () => {
    // Get latest snapshot
    const state = useAuthStore.getState();
    const user = state.user;
    const token = state.token;
    
    if (!user || !token) return;

    try {
      // Optimistic update
      const newMode = !user.isAnonymousMode;
      const updatedUser = { ...user, isAnonymousMode: newMode };
      
      set({ user: updatedUser });
      await AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser));

      // Call API
      const { apiClient } = await import('../api/client');
      const res = await apiClient.post('/users/anonymous/toggle');

      if (res.data.success) {
        // Use current store state for final merge (in case other things changed)
        const currentContext = useAuthStore.getState().user;
        const finalUser = {
          ...(currentContext || user),
          isAnonymousMode: res.data.isAnonymousMode !== undefined ? res.data.isAnonymousMode : newMode,
          anonymousPersona: res.data.anonymousPersona || user.anonymousPersona
        };
        
        set({ user: finalUser });
        await AsyncStorage.setItem('auth-user', JSON.stringify(finalUser));
      }
    } catch (error) {
      console.error('Error toggling anonymous mode:', error);
      // Rollback to PREVIOUS state (not necessarily the one from start of function)
      // but for simplicity we use the original 'user' snapshot
      set({ user: user });
      await AsyncStorage.setItem('auth-user', JSON.stringify(user));
    }
  },

  setCustomReactions: async (reactions: string[]) => {
    const state = useAuthStore.getState();
    if (!state.user) return;

    const updatedUser = { ...state.user, customReactions: reactions };
    set({ user: updatedUser });
    await AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser));
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
    AsyncStorage.setItem('auth-user', JSON.stringify(updatedUser)).catch((err) =>
      console.error('Error saving updated blocked list to storage:', err)
    );
  },
}));
