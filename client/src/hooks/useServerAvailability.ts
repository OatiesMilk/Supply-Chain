import { useCallback, useEffect, useRef, useState } from 'react';
import { checkServerHealth, SERVER_CHECK_EVENT } from '@/api/availability';

export function useServerAvailability() {
  const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [retrying, setRetrying] = useState(false);
  const probe = useRef<() => Promise<void>>(async () => {});
  const retry = useCallback(() => { void probe.current(); }, []);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | undefined;

    const check = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      setRetrying(true);
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 5000);
      try {
        const healthy = await checkServerHealth(controller.signal);
        if (!disposed) setStatus(healthy ? 'available' : 'unavailable');
      } catch {
        if (!disposed) setStatus('unavailable');
      } finally {
        window.clearTimeout(timeout);
        inFlight = false;
        if (!disposed) setRetrying(false);
      }
    };

    probe.current = check;
    void check();
    const interval = window.setInterval(() => { void check(); }, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener(SERVER_CHECK_EVENT, retry);
    window.addEventListener('online', retry);
    window.addEventListener('offline', retry);
    window.addEventListener('focus', retry);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener(SERVER_CHECK_EVENT, retry);
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', retry);
      window.removeEventListener('focus', retry);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [retry]);

  return { status, retrying, retry };
}
