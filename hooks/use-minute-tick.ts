import { useEffect, useState } from 'react';

/**
 * Takvim günü / oturum değişince günlük % yeniden hesaplansın diye ~1 dk’da bir artar.
 */
export function useMinuteTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return tick;
}
