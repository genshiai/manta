import { useEffect, useState } from 'react';
import { cn } from './utils';

export type ToastTone = 'info' | 'success' | 'error';
export type ToastItem = { id: number; message: string; tone: ToastTone };

let counter = 0;
let items: ToastItem[] = [];
const listeners = new Set<(next: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) listener(items);
}

/** アプリのどこからでも呼べる軽量トースト（依存追加なし）。 */
export function toast(message: string, tone: ToastTone = 'info', durationMs = 4000) {
  const id = ++counter;
  items = [...items, { id, message, tone }];
  emit();
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, durationMs);
}

export const toastSuccess = (message: string) => toast(message, 'success');
export const toastError = (message: string) => toast(message, 'error', 6000);

const toneClass: Record<ToastTone, string> = {
  info: 'border-border bg-card text-text-primary',
  success: 'border-success/30 bg-card text-text-primary',
  error: 'border-destructive/40 bg-card text-destructive',
};

const dotClass: Record<ToastTone, string> = {
  info: 'bg-text-tertiary',
  success: 'bg-success',
  error: 'bg-destructive',
};

/** トーストの描画先。アプリのルートに一度だけマウントする。 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-[13px] font-semibold shadow-elevated',
            toneClass[item.tone],
          )}
        >
          <span className={cn('size-1.5 flex-none rounded-full', dotClass[item.tone])} />
          <span className="min-w-0 break-words">{item.message}</span>
        </div>
      ))}
    </div>
  );
}
