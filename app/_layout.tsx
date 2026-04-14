import { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CustomSplashScreen } from '@/components/CustomSplashScreen';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuthStore } from '@/src/store/authStore';
import { CallProvider } from '@/src/context/CallContext';
import { IncomingCallModal } from '@/src/components/IncomingCallModal';
import { ActiveCallScreen } from '@/src/components/ActiveCallScreen';
import { NotificationManager } from '@/src/components/NotificationManager';

import { getBaseUrl } from '@/src/api/config';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  
  const { initializeAuth, isLoading, user } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  const [showSplash, setShowSplash] = useState(true);

  // --- 🚀 BACKEND WARM-UP ---
  // If backend is on Render free tier, it sleeps after 15m.
  // This pings the server immediately on app start to "wake it up".
  useEffect(() => {
    const warmup = async () => {
      try {
        const baseUrl = getBaseUrl(false); // Get base URL without /api
        console.log('🚀 Warming up backend...', baseUrl);
        // We use a small timeout so the app doesn't hang if the server is really slow
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        await fetch(`${baseUrl}/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        console.log('✅ Backend warm-up ping sent');
      } catch (e) {
        // We ignore errors here as it's just a warm-up ping
        console.log('⚠️ Backend warm-up ping failed (might still be waking up)');
      }
    };
    warmup();
  }, []);

  // App start pe check karte hain localStorage me token
  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    // Keep splash screen visible for at least 4000ms to allow animation to finish and be clearly seen
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Hide the NATIVE splash screen quickly so our custom animated one takes over
    const timer = setTimeout(async () => {
      await SplashScreen.hideAsync();
    }, 100);
    return () => clearTimeout(timer);
  }, []);


  // Jaise hi state change hoti hai ya routing start hoti hai check running
  useEffect(() => {
    if (isLoading || showSplash) return; // Wait to finish async storage load and splash

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      // User is not logged in and not in an auth screen
      // Redirect to login screen unconditionally
      router.replace('/(auth)/login');
    }
  }, [user, isLoading, showSplash, segments]);

  if (isLoading || showSplash) {
    return <CustomSplashScreen />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <NotificationManager>
          <CallProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="notifications" />
              <Stack.Screen name="messages" />
              <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
            </Stack>
            <IncomingCallModal />
            <ActiveCallScreen />
          </CallProvider>
        </NotificationManager>
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
