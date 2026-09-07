import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
const useLocalEnv = process.env.EXPO_PUBLIC_USE_LOCAL_API;

/**
 * 🛠️ CENTRAL CONFIGURATION
 * Smart Environment & Device IP Auto-Resolution
 */
export const CONFIG = {
  // --- MASTER TOGGLE ---
  // If EXPO_PUBLIC_USE_LOCAL_API is explicitly set ("true" or "false"), respect it.
  // In release/preview APK builds, it automatically defaults to false (Live Render backend).
  USE_LOCAL: useLocalEnv !== undefined ? useLocalEnv === 'true' : isDev,

  // --- LIVE URL (Render) ---
  LIVE_URL: process.env.EXPO_PUBLIC_API_URL || 'https://mybackenda.onrender.com',

  // --- LOCAL FALLBACK IP ---
  // Over USB cable with adb reverse, 127.0.0.1 connects instantly to laptop!
  LOCAL_IP_FALLBACK: '127.0.0.1',
};

/**
 * Ye function dynamically base URL resolve karta hai for:
 * 1. Android Emulator (10.0.2.2:5001)
 * 2. iOS Simulator (localhost:5001)
 * 3. Physical Devices (Expo hostUri / Wi-Fi IP 10.61.61.5:5001)
 */
export const getBaseUrl = (withApiSfx: boolean = true) => {
  if (CONFIG.USE_LOCAL) {
    let resolvedIp = CONFIG.LOCAL_IP_FALLBACK;

    // 📱 Check if running inside Emulator / Simulator
    if (!Device.isDevice) {
      if (Platform.OS === 'android') {
        resolvedIp = '10.0.2.2'; // Android Emulator Loopback
      } else {
        resolvedIp = 'localhost'; // iOS Simulator Loopback
      }
    } else {
      // 📱 Physical Device — resolve Expo hostUri (e.g. 10.136.245.5) or fallback to 127.0.0.1 (with adb reverse)
      const hostUri =
        Constants.expoConfig?.hostUri ||
        (Constants as any).manifest?.debuggerHost ||
        (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

      const host = hostUri?.split(':')[0];
      if (host && host !== 'localhost' && !host.startsWith('127.')) {
        resolvedIp = host;
      } else {
        // USB connected phone with adb reverse
        resolvedIp = '127.0.0.1';
      }
    }

    const base = `http://${resolvedIp}:5001`;

    return withApiSfx ? `${base}/api` : base;
  }

  // 🚀 Live Mode
  return withApiSfx ? `${CONFIG.LIVE_URL}/api` : CONFIG.LIVE_URL;
};
