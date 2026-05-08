import { useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { ReservationSlot } from '../../types/workflow';

type NextVisitDialogProps = {
  open: boolean;
  slots: ReservationSlot[];
  isMutating: boolean;
  onClose: () => void;
  /** 予約せずに診察終了 */
  onSkip: () => void;
  /** 予約 + 診察終了 */
  onBook: (slotId: string | null, comment: string) => void;
};

const slotStateLabel = (state: ReservationSlot['state']) => {
  if (state === 'available') return '空き';
  if (state === 'few') return '残わずか';
  return '満枠';
};

const slotStateClass = (state: ReservationSlot['state']) => {
  if (state === 'available') return 'text-success';
  if (state === 'few') return 'text-warning';
  return 'text-text-disabled';
};

/**
 * 診察終了時に「次回予約」を取るダイアログ。
 * - スキップ可能 (予約せずに終了)
 * - 予約スロット選択 + 任意コメント
 */
export const NextVisitDialog = ({
  open,
  slots,
  isMutating,
  onClose,
  onSkip,
  onBook,
}: NextVisitDialogProps) => {
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [comment, setComment] = useState('');
  const [isDateUndecided, setIsDateUndecided] = useState(false);

  if (!open) return null;

  const selected = slots.find((s) => s.id === selectedSlotId);
  const canBook = isDateUndecided || Boolean(selected && selected.state !== 'full');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="閉じる"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-t-xl bg-card p-6 shadow-modal sm:rounded-xl">
        <header className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-brand" />
            <div>
              <h3 className="text-[18px] font-bold leading-snug text-text-primary">次回予約</h3>
              <p className="text-[12px] text-text-tertiary">診察終了前に、次回受診の予約を取れます</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-text-tertiary hover:bg-surface-subtle"
          >
            <X size={16} />
          </button>
        </header>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsDateUndecided(false)}
            className={`h-9 rounded-md border px-3 text-[13px] font-medium ${
              isDateUndecided
                ? 'border-border text-text-secondary hover:bg-surface-subtle'
                : 'border-brand bg-brand-tint text-brand'
            }`}
          >
            予約枠
          </button>
          <button
            type="button"
            onClick={() => {
              setIsDateUndecided(true);
              setSelectedSlotId('');
            }}
            className={`h-9 rounded-md border px-3 text-[13px] font-medium ${
              isDateUndecided
                ? 'border-brand bg-brand-tint text-brand'
                : 'border-border text-text-secondary hover:bg-surface-subtle'
            }`}
          >
            日未定
          </button>
        </div>

        <div className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-border">
          {isDateUndecided ? (
            <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">
              次回来院日は未定として保存します
            </p>
          ) : slots.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-text-tertiary">
              空きスロットがありません
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {slots.map((s) => {
                const isSelected = s.id === selectedSlotId;
                const isFull = s.state === 'full';
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => !isFull && setSelectedSlotId(s.id)}
                      disabled={isFull}
                      className={`flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-brand-tint' : isFull ? 'opacity-50' : 'hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-text-primary">
                          {s.date} {s.time}
                        </p>
                        <p className="text-[11px] text-text-tertiary">
                          {s.department} ・ {s.doctor}
                        </p>
                      </div>
                      <span className={`text-[11px] font-medium ${slotStateClass(s.state)}`}>
                        {slotStateLabel(s.state)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="備考 (任意)"
          className="mb-4"
        />

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={isMutating}>
            予約せず終了
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => canBook && onBook(isDateUndecided ? null : selectedSlotId, comment)}
            disabled={!canBook || isMutating}
          >
            予約して終了
          </Button>
        </div>
      </div>
    </div>
  );
};
