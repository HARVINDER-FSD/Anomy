import { Appearance } from 'react-native';
import { useThemeStore } from '../store/themeStore';

export const CHAT_THEME_ORDER = ['default', 'sunset', 'ocean', 'forest', 'lavender', 'midnight'] as const;

export function getChatTheme(themeId?: string | null) {
  const pref = useThemeStore.getState().themePreference;
  const sysDark = Appearance.getColorScheme() === 'dark';
  const isDark = pref === 'dark' || (pref === 'system' && sysDark);

  const PRESETS: Record<string, { label: string; tint: string; surface: string; bubbleOther: string }> = {
    default: isDark 
      ? { label: 'Classic', tint: '#121212', surface: '#1E1E1E', bubbleOther: '#2A2A2A' }
      : { label: 'Classic', tint: '#F8F9FB', surface: '#FFFFFF', bubbleOther: '#EDE9F7' },
    sunset: { label: 'Sunset', tint: '#FFF1EE', surface: '#FFF5F2', bubbleOther: '#FFD8CC' },
    ocean: { label: 'Ocean', tint: '#E8FBFF', surface: '#F0FDFF', bubbleOther: '#C5EEF5' },
    forest: { label: 'Forest', tint: '#EEF8EE', surface: '#F4FBF4', bubbleOther: '#CDE8CF' },
    midnight: { label: 'Midnight', tint: '#12121A', surface: '#1A1A24', bubbleOther: '#2A2A38' },
    lavender: { label: 'Lavender', tint: '#F6F0FF', surface: '#FAF7FF', bubbleOther: '#E4D4F5' },
  };

  const id = themeId && PRESETS[themeId] ? themeId : 'default';
  return { id, ...PRESETS[id] };
}
