import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import { useThemeStore } from '@/src/store/themeStore';

export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const systemScheme = useRNColorScheme();
  const themePreference = useThemeStore((state) => state.themePreference);

  if (themePreference === 'dark') return 'dark';
  if (themePreference === 'light') return 'light';

  if (hasHydrated) {
    return systemScheme;
  }

  return 'light';
}
