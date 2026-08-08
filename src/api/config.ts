import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';

/**
 * 🛠️ CENTRAL CONFIGURATION
 * Smart Environment & Device IP Auto-Resolution
 */
export const CONFIG = {
  // --- MASTER TOGGLE ---
  // true = Local PC mode (Developer mode)
  // false = Hosted Render mode (Live mode)
  USE_LOCAL: true,

  // --- LIVE URL (Render) ---
  LIVE_URL: process.env.EXPO_PUBLIC_API_URL || 'https://mybackenda.onrender.com',

  // --- LOCAL FALLBACK IP ---
  // Active Laptop Wi-Fi IP address
  LOCAL_IP_FALLBACK: '10.61.61.5',
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
      // 📱 Physical Device — resolve Expo hostUri or Wi-Fi IP
      const hostUri =
        Constants.expoConfig?.hostUri ||
        (Constants as any).manifest?.debuggerHost ||
        (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;

      const localhost = hostUri?.split(':')[0];
      if (localhost && !localhost.startsWith('127.') && localhost !== 'localhost') {
        resolvedIp = localhost;
      }
    }

    const base = `http://${resolvedIp}:5001`;

    return withApiSfx ? `${base}/api` : base;
  }

  // 🚀 Live Mode
  return withApiSfx ? `${CONFIG.LIVE_URL}/api` : CONFIG.LIVE_URL;
};
