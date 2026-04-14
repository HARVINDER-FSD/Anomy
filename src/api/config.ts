import Constants from 'expo-constants';

/**
 * 🛠️ CENTRAL CONFIGURATION
 * Yahan se aap local aur production ke beech switch kar sakte hain.
 */
export const CONFIG = {
  // --- MASTER TOGGLE ---
  // true = Local PC mode (Developer mode)
  // false = Hosted Render mode (Live mode)
  USE_LOCAL: false, // Set to false for production/Render mode

  // --- LIVE URL (Render) ---
  LIVE_URL: process.env.EXPO_PUBLIC_API_URL || 'https://mybackenda.onrender.com',

  // --- LOCAL FALLBACK IP ---
  // Agar phone PC ka IP auto-detect nahi kar paata tab ye use hoga.
  LOCAL_IP_FALLBACK: '10.88.158.5',
};

/**
 * Ye function dynamically base URL resolve karta hai.
 */
export const getBaseUrl = (withApiSfx: boolean = true) => {
  if (CONFIG.USE_LOCAL) {
    // 🏠 Localhost Mode
    // Expo debuggerHost se PC ka IP nikaalte hain
    const debuggerHost = Constants.expoConfig?.hostUri;
    const localhost = debuggerHost?.split(':')[0];

    const base = `http://${localhost || CONFIG.LOCAL_IP_FALLBACK}:5001`;
    return withApiSfx ? `${base}/api` : base;
  }

  // 🚀 Live Mode
  return withApiSfx ? `${CONFIG.LIVE_URL}/api` : CONFIG.LIVE_URL;
};
