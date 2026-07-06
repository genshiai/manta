import { useEffect, useRef } from 'react';

/**
 * 値が変わってから delay ミリ秒アイドルで onIdle を呼ぶ（下書きの自動保存トリガ）。
 * KARTE_UI_SPEC §5.1: 3 秒 debounce で下書き保存。版確定は「書き終える」で別途行う。
 */
export function useAutosave(value: string, onIdle: () => void, delay = 3000, enabled = true) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const firstRun = useRef(true);

  // value を deps に含めるのは「値が変わるたびに debounce をやり直す」ため（意図的）。
  // onIdle は ref 経由なので deps 不要。
  // biome-ignore lint/correctness/useExhaustiveDependencies: value change is the debounce trigger
  useEffect(() => {
    if (!enabled) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const timer = setTimeout(() => onIdleRef.current(), delay);
    return () => clearTimeout(timer);
  }, [value, delay, enabled]);
}
