import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}

export function useWakeLock() {
  const [supported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in navigator
  );
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const requestLock = useCallback(async () => {
    if (!supported) return;
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
      };
      if (!nav.wakeLock) return;
      sentinelRef.current = await nav.wakeLock.request('screen');
      setActive(true);
    } catch {
      setActive(false);
    }
  }, [supported]);

  const releaseLock = useCallback(async () => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      try {
        await sentinelRef.current.release();
      } catch {
        // ignore
      }
    }
    sentinelRef.current = null;
    setActive(false);
  }, []);

  const toggle = useCallback(() => {
    if (active) {
      void releaseLock();
    } else {
      void requestLock();
    }
  }, [active, releaseLock, requestLock]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && active) {
        void requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void releaseLock();
    };
  }, [active, releaseLock, requestLock]);

  return { supported, active, toggle };
}
