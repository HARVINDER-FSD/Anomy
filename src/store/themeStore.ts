import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
  initializeTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  themePreference: 'system',
  setThemePreference: async (pref) => {
    try {
      await AsyncStorage.setItem('theme-preference', pref);
    } catch (e) {
    }
    set({ themePreference: pref });
  },
  initializeTheme: async () => {
    try {
      const saved = await AsyncStorage.getItem('theme-preference') as ThemePreference | null;
      if (saved && (saved === 'light' || saved === 'dark' || saved === 'system')) {
        set({ themePreference: saved });
      }
    } catch (e) {
    }
  },
}));
