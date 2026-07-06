import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage } from '../../../lib/storage';

export type PinState = { left: boolean; right: boolean };

/**
 * パネルのピン状態（overlay-first, pin optional）。ロール別の既定を localStorage に永続化。
 * KARTE_UI_SPEC §7: 外来医師=両方OFF / 病棟看護=左OFF・温度板ピンON / 事務=右ON。
 */
function defaultFor(role: string): PinState {
  if (role === '看護師') return { left: false, right: true };
  if (role === '管理者' || role === '事務') return { left: false, right: true };
  return { left: false, right: false };
}

export function usePins(userId: string, role: string) {
  const key = `manta-panel-pins:${userId}:${role}`;
  const [pins, setPins] = useState<PinState>(() => readStorage<PinState>(key, defaultFor(role)));

  useEffect(() => {
    writeStorage(key, pins);
  }, [key, pins]);

  const toggleLeft = useCallback(() => setPins((p) => ({ ...p, left: !p.left })), []);
  const toggleRight = useCallback(() => setPins((p) => ({ ...p, right: !p.right })), []);
  const setLeft = useCallback((value: boolean) => setPins((p) => ({ ...p, left: value })), []);
  const setRight = useCallback((value: boolean) => setPins((p) => ({ ...p, right: value })), []);

  return { pins, toggleLeft, toggleRight, setLeft, setRight };
}
