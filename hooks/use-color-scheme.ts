import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore } from '@/src/store/themeStore';

export function useColorScheme() {
  const systemScheme = useRNColorScheme();
  const themePreference = useThemeStore((state) => state.themePreference);

  if (themePreference === 'dark') return 'dark';
  if (themePreference === 'light') return 'light';
  return systemScheme;
}
