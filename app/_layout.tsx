import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CustomSplashScreen } from '@/components/CustomSplashScreen';
import * as SplashScreen from 'expo-splash-screen';
import Toast from 'react-native-toast-message';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/src/store/authStore';
import { useThemeStore } from '@/src/store/themeStore';
import { CallProvider } from '@/src/context/CallContext';
import { IncomingCallModal } from '@/src/components/IncomingCallModal';
import { ActiveCallScreen } from '@/src/components/ActiveCallScreen';
import { NotificationManager } from '@/src/components/NotificationManager';

import { getBaseUrl } from '@/src/api/config';
import { Platform, LogBox } from 'react-native';

LogBox.ignoreLogs([
  '[expo-av]: Expo AV has been deprecated',
  'Expo AV has been deprecated',
  'VideoPlayer.replace loads the asset data synchronously',
  'Switch to `replaceAsync`',
]);

// 🔍 Expose all JS errors explicitly
if (typeof (global as any).ErrorUtils !== 'undefined') {
  const defaultHandler = (global as any).ErrorUtils.getGlobalHandler();
  (global as any).ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    console.error('🚨 [GLOBAL UNHANDLED ERROR]:', error?.message || error);
    console.error('🚨 [STACK TRACE]:', error?.stack);
    if (defaultHandler) {
      defaultHandler(error, isFatal);
    }
  });
}
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black
} from '@expo-google-fonts/outfit';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const { initializeAuth, isLoading, user } = useAuthStore();
  const { initializeTheme } = useThemeStore();
  const segments = useSegments();
  const router = useSafeRouter();

  const [showSplash, setShowSplash] = useState(true);

  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black
  });

  // --- 🚀 BACKEND WARM-UP ---
  // Fire-and-forget with a short 5s timeout — NEVER block the JS thread
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s max
    const baseUrl = getBaseUrl(false);
    fetch(`${baseUrl}/health`, { signal: controller.signal })
      .catch(() => { /* silent — warm-up is best-effort */ })
      .finally(() => clearTimeout(timeoutId));
  }, []);

  // App start pe check karte hain localStorage me token
  useEffect(() => {
    initializeAuth();
    initializeTheme();

    // 🚀 Bootstrap Enterprise Engine Framework
    import('@/src/engines/BootstrapEngine').then(({ BootstrapEngine }) => {
      BootstrapEngine.initialize().catch((err) => {
      });
    });

    // 🧹 One-time stale storage cleanup — removes old oversized keys from previous app versions
    import('@react-native-async-storage/async-storage').then(({ default: AS }) => {
      AS.getAllKeys().then(keys => {
        if (!keys) return;
        // Remove any old anonymous or feed caches that don't match current zustand key names
        const staleKeys = keys.filter((k: string) => 
          k.startsWith('anon_') || k.startsWith('feed_cache') || k.startsWith('conversation_cache')
        );
        if (staleKeys.length > 0) AS.multiRemove(staleKeys).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  }, []);



  useEffect(() => {
    if (isLoading || !fontsLoaded) return;

    SplashScreen.hideAsync().catch(() => {});

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [isLoading, fontsLoaded]);

  // Auth guard — redirect smoothly without infinite blinking loops
  const redirectingRef = React.useRef(false);
  useEffect(() => {
    if (isLoading || showSplash || !fontsLoaded) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace('/(auth)/login');
      setTimeout(() => { redirectingRef.current = false; }, 800);
    } else if (user && inAuthGroup) {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      router.replace('/(tabs)');
      setTimeout(() => { redirectingRef.current = false; }, 800);
    } else {
      redirectingRef.current = false;
    }
  }, [user, isLoading, showSplash, fontsLoaded, segments]);

  if (isLoading || showSplash || !fontsLoaded) {
    return <CustomSplashScreen />;
  }

  return (
    <GlobalErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <NotificationManager>
            <CallProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  freezeOnBlur: true,
                  animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
                  animationDuration: 130,
                  fullScreenGestureEnabled: true,
                  contentStyle: { backgroundColor: colorScheme === 'dark' ? '#000' : '#FFF' },
                }}
              >
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="notifications" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen
                  name="chat"
                  options={{
                    animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
                    animationDuration: 130,
                    gestureEnabled: true,
                    fullScreenGestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="chat-info/[id]"
                  options={{
                    animation: Platform.OS === 'ios' ? 'ios_from_right' : 'slide_from_right',
                    animationDuration: 130,
                    gestureEnabled: true,
                    fullScreenGestureEnabled: true,
                  }}
                />
                <Stack.Screen
                  name="reels/[id]"
                  options={{
                    animation: 'fade',
                    gestureEnabled: true,
                    fullScreenGestureEnabled: true,
                  }}
                />
                <Stack.Screen name="report" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </Stack>
              <IncomingCallModal />
              <ActiveCallScreen />
            </CallProvider>
          </NotificationManager>
          <StatusBar style="auto" />
        </ThemeProvider>
      </GestureHandlerRootView>
      <Toast />
    </GlobalErrorBoundary>
  );
}
