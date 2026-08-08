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

// Hide native splash immediately — our CustomSplashScreen handles it
SplashScreen.hideAsync();

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/src/store/authStore';
import { useThemeStore } from '@/src/store/themeStore';
import { CallProvider } from '@/src/context/CallContext';
import { IncomingCallModal } from '@/src/components/IncomingCallModal';
import { ActiveCallScreen } from '@/src/components/ActiveCallScreen';
import { NotificationManager } from '@/src/components/NotificationManager';

import { getBaseUrl } from '@/src/api/config';
import { Platform, Text, TextInput } from 'react-native';
import { useSafeRouter } from '@/src/hooks/useSafeRouter';
import { usePushNotifications } from '@/src/hooks/usePushNotifications';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black
} from '@expo-google-fonts/outfit';

// --- GLOBAL FONT OVERRIDE HACK ---
const oldTextRender = (Text as any).render;
if (oldTextRender) {
  (Text as any).render = function (...args: any[]) {
    const origin = oldTextRender.call(this, ...args);

    // Map existing font weights to correct font families if we wanted, 
    // but applying the regular font as a base is sufficient.
    return React.cloneElement(origin, {
      style: [{ fontFamily: 'Outfit_500Medium' }, origin.props.style] // Default to medium for a sleek look
    });
  };
}
const oldTextInputRender = (TextInput as any).render;
if (oldTextInputRender) {
  (TextInput as any).render = function (...args: any[]) {
    const origin = oldTextInputRender.call(this, ...args);
    return React.cloneElement(origin, {
      style: [{ fontFamily: 'Outfit_500Medium' }, origin.props.style]
    });
  };
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const { initializeAuth, isLoading, user } = useAuthStore();
  const { initializeTheme } = useThemeStore();
  const segments = useSegments();
  const router = useSafeRouter();
  const { expoPushToken } = usePushNotifications();

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
    // Keep splash screen visible for at least 4000ms to allow animation to finish and be clearly seen
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);




  // Auth guard — redirect to login if not authenticated
  // Uses a ref to prevent double-navigation on rapid state changes
  const redirectingRef = React.useRef(false);
  useEffect(() => {
    if (isLoading || showSplash) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      if (redirectingRef.current) return; // Prevent double-redirect
      redirectingRef.current = true;
      router.replace('/(auth)/login');
      // Reset after a short delay so future auth changes can trigger again
      setTimeout(() => { redirectingRef.current = false; }, 1000);
    } else {
      redirectingRef.current = false;
    }
  }, [user, isLoading, showSplash, segments]);

  if (isLoading || showSplash || !fontsLoaded) {
    return <CustomSplashScreen />;
  }

  return (
    <>
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
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
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
    </>
  );
}
