import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../debug/logger';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
};

export function useWakeLock() {
  const [supported] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      Boolean((navigator as NavigatorWithWakeLock).wakeLock)
  );
  const [active, setActive] = useState(false);
  const [failed, setFailed] = useState(false);
  const desiredRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const releaseListenerRef = useRef<(() => void) | null>(null);

  const detachSentinelListener = useCallback((sentinel: WakeLockSentinelLike | null) => {
    if (sentinel && releaseListenerRef.current) {
      sentinel.removeEventListener?.('release', releaseListenerRef.current);
      releaseListenerRef.current = null;
    }
  }, []);

  const requestLock = useCallback(async () => {
    if (!supported) return;
    if (sentinelRef.current && !sentinelRef.current.released) {
      setActive(true);
      return;
    }
    const reqId = ++requestIdRef.current;
    try {
      const nav = navigator as NavigatorWithWakeLock;
      if (!nav.wakeLock) return;
      const sentinel = await nav.wakeLock.request('screen');

      if (requestIdRef.current !== reqId || !desiredRef.current || !mountedRef.current) {
        try {
          if (!sentinel.released) {
            await sentinel.release();
          }
        } catch {
          // ignore cleanup release errors
        }
        return;
      }

      detachSentinelListener(sentinelRef.current);
      sentinelRef.current = sentinel;

      const onRelease = () => {
        if (sentinelRef.current !== sentinel) return;
        sentinelRef.current = null;
        releaseListenerRef.current = null;
        if (!mountedRef.current) return;
        // Browsers release wake locks when hidden; keep desiredRef true so visibilitychange re-acquires.
        if (!desiredRef.current || document.visibilityState === 'visible') {
          desiredRef.current = false;
          setActive(false);
        }
      };

      releaseListenerRef.current = onRelease;
      sentinel.addEventListener?.('release', onRelease);

      setFailed(false);
      setActive(true);
      logger.debug('WAKELOCK', 'Screen WakeLock acquired');
    } catch (err) {
      if (requestIdRef.current === reqId && mountedRef.current) {
        desiredRef.current = false;
        setActive(false);
        setFailed(true);
      }
      logger.warn('WAKELOCK', 'Screen WakeLock request failed', err);
    }
  }, [detachSentinelListener, supported]);

  const releaseLock = useCallback(async () => {
    ++requestIdRef.current;
    const sentinel = sentinelRef.current;
    detachSentinelListener(sentinel);
    sentinelRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
        logger.debug('WAKELOCK', 'Screen WakeLock released');
      } catch (err) {
        logger.warn('WAKELOCK', 'Screen WakeLock release failed', err);
      }
    }
    if (mountedRef.current) {
      setActive(false);
    }
  }, [detachSentinelListener]);

  const toggle = useCallback(() => {
    if (!supported) return;
    setFailed(false);
    if (desiredRef.current) {
      desiredRef.current = false;
      void releaseLock();
    } else {
      desiredRef.current = true;
      void requestLock();
    }
  }, [releaseLock, requestLock, supported]);

  useEffect(() => {
    mountedRef.current = true;
    const onVis = () => {
      if (document.visibilityState === 'visible' && desiredRef.current) {
        void requestLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mountedRef.current = false;
      document.removeEventListener('visibilitychange', onVis);
      desiredRef.current = false;
      void releaseLock();
    };
  }, [releaseLock, requestLock]);

  return { supported, active, failed, toggle };
}
