import { useCallback, useSyncExternalStore } from 'react';

/** CSS 미디어 쿼리의 일치 여부를 구독한다(서랍 전환 시점을 CSS와 같은 기준으로 맞추기 위함). */
export function useMedia(query) {
  const subscribe = useCallback((cb) => {
    const m = window.matchMedia(query);
    m.addEventListener('change', cb);
    return () => m.removeEventListener('change', cb);
  }, [query]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
