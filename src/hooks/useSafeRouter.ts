import { useRouter as useExpoRouter, Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Prevent duplicate taps on the same route — allow different destinations immediately.
 * Uses per-instance refs (not global variables) to avoid cross-component blocking.
 */
const MIN_SAME_ROUTE_INTERVAL_MS = 600;

function navKey(href: Href): string {
  if (typeof href === 'string') return href;
  const pathname = (href as any).pathname || '';
  const params = (href as any).params ? JSON.stringify((href as any).params) : '';
  return `${pathname}?${params}`;
}

export function useSafeRouter() {
  const router = useExpoRouter();

  // Per-instance refs — NOT global — so different screens don't block each other
  const lastNavTimeRef = useRef(0);
  const lastNavKeyRef = useRef('');
  const isNavigatingRef = useRef(false);

  const canNavigate = useCallback((key: string): boolean => {
    const now = Date.now();
    // Allow different routes immediately, only debounce same route
    if (key !== lastNavKeyRef.current) {
      lastNavTimeRef.current = now;
      lastNavKeyRef.current = key;
      return true;
    }
    // Same route: debounce
    if (now - lastNavTimeRef.current < MIN_SAME_ROUTE_INTERVAL_MS) {
      return false;
    }
    lastNavTimeRef.current = now;
    lastNavKeyRef.current = key;
    return true;
  }, []);

  const safePush = useCallback(
    (href: Href) => {
      const key = navKey(href);
      if (!canNavigate(key)) return;
      try {
        router.push(href);
      } catch (e) {
        // Reset so next press works
        lastNavTimeRef.current = 0;
        lastNavKeyRef.current = '';
      }
    },
    [router, canNavigate]
  );

  const safeReplace = useCallback(
    (href: Href) => {
      const key = navKey(href);
      if (!canNavigate(key)) return;
      try {
        router.replace(href);
      } catch (e) {
        lastNavTimeRef.current = 0;
        lastNavKeyRef.current = '';
      }
    },
    [router, canNavigate]
  );

  const safeBack = useCallback(() => {
    const key = '__back__';
    if (!canNavigate(key)) return;
    try {
      router.back();
    } catch (e) {
      lastNavTimeRef.current = 0;
      lastNavKeyRef.current = '';
    }
  }, [router, canNavigate]);

  return { ...router, push: safePush, replace: safeReplace, back: safeBack };
}
