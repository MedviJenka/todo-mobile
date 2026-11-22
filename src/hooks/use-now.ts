import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs` while `active`. Keeps Date.now() out of render. */
export function useNow(intervalMs = 60_000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}
