import AsyncStorage from '@react-native-async-storage/async-storage';
import { BootstrapResponse, BootstrapMode } from '../types/bootstrap';

import { getBaseUrl } from '../api/config';
import { getAuthToken } from '../utils/tokenUtils';

let inFlightController: AbortController | null = null;
let inFlightPromise: Promise<BootstrapResponse> | null = null;

export class BootstrapApiService {
  /**
   * Fetch bootstrap API with Request Deduplication, AbortController, and Exponential Retry Logic
   */
  static async fetchBootstrap(
    mode?: BootstrapMode,
    maxRetries = 3
  ): Promise<BootstrapResponse> {
    // 1. If an identical call is already running, deduplicate & return in-flight promise
    if (inFlightPromise) {
      return inFlightPromise;
    }

    // 2. Setup AbortController
    if (inFlightController) {
      inFlightController.abort();
    }
    inFlightController = new AbortController();
    const signal = inFlightController.signal;

    inFlightPromise = (async () => {
      let attempt = 0;
      let delay = 1000;

      while (attempt < maxRetries) {
        try {
          const token = await getAuthToken();
          if (!token) {
            throw new Error('No authentication token found');
          }

          const activeMode = mode || (await AsyncStorage.getItem('@anufy_last_active_mode')) || 'normal';
          const apiBaseUrl = getBaseUrl(false);

          const response = await fetch(`${apiBaseUrl}/api/bootstrap?mode=${activeMode}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
              'X-App-Mode': activeMode,
            },
            signal,
          });

          if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error || `Bootstrap failed with HTTP ${response.status}`);
          }

          const result: BootstrapResponse = await response.json();
          return result;
        } catch (err: any) {
          if (err.name === 'AbortError') {
            throw new Error('Bootstrap request aborted');
          }

          attempt++;
          if (attempt >= maxRetries) {
            throw err;
          }

          // Exponential Backoff with Jitter
          await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * 300));
          delay *= 2;
        }
      }

      throw new Error('Bootstrap retries exhausted');
    })();

    try {
      const res = await inFlightPromise;
      return res;
    } finally {
      inFlightPromise = null;
      inFlightController = null;
    }
  }

  /**
   * Cancel any pending bootstrap HTTP request
   */
  static cancelPendingRequest() {
    if (inFlightController) {
      inFlightController.abort();
      inFlightController = null;
      inFlightPromise = null;
    }
  }
}
