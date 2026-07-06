import { useState } from 'react';
import type { LabLongTrendItem } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';

type LabsMatrixProps = {
  open: boolean;
  onClose: () => void;
  trends: LabLongTrendItem[];
};

function shortDate(raw: string): string {
  const d = new Date(raw.replace(/\//g, '-').split(/[ T]/)[0]);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** ⌘L: 検査マトリクス表（行=項目 × 列=日付降順・sticky・H/L色）。KARTE_UI_SPEC §4.6 */
export function LabsMatrix({ open, onClose, trends }: LabsMatrixProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  if (!open) return null;

  const dates = Array.from(new Set(trends.flatMap((t) => t.points.map((p) => p.date))))
    .sort()
    .reverse()
    .slice(0, 12);

  const toggle = (item: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal keyboard host
    <div
      className="clinical fixed inset-0 z-50"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <button type="button" aria-label="閉じる" onClick={onClose} className="absolute inset-0 bg-[var(--dim)]" />
      <div
        role="dialog"
        aria-label="検査マトリクス"
        className="absolute left-1/2 top-16 flex max-h-[calc(100vh-128px)] w-[1100px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col overflow-hidden rounded-[14px] border border-border bg-popover shadow-[var(--shadow-modal)]"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <span className="text-[14px] font-bold text-text-primary">検査を表で見る</span>
          <span className="text-[11.5px] text-text-tertiary">行=項目 × 列=日付（降順）</span>
          <span className="flex-1" />
          {selected.size > 0 ? (
            <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11.5px] font-semibold text-brand">
              {selected.size}項目を推移グラフ
            </span>
          ) : null}
          <button type="button" onClick={onClose} className="text-[12px] text-text-secondary hover:text-text-primary">
            閉じる <Kbd>esc</Kbd>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[160px] border-b border-r border-border bg-surface-subtle px-3 py-2 text-left text-[11px] font-bold text-text-tertiary">
                  項目
                </th>
                {dates.map((d) => (
                  <th
                    key={d}
                    className="sticky top-0 z-10 min-w-[72px] border-b border-r border-border bg-surface-subtle px-3 py-2 text-right text-[11px] font-semibold text-text-secondary"
                  >
                    {shortDate(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trends.length === 0 ? (
                <tr>
                  <td colSpan={dates.length + 1} className="px-4 py-8 text-center text-[12.5px] text-text-tertiary">
                    検査トレンドがありません。
                  </td>
                </tr>
              ) : (
                trends.map((t) => {
                  const byDate = new Map(t.points.map((p) => [p.date, p]));
                  return (
                    <tr key={t.item}>
                      <th className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-left font-semibold text-text-primary">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(t.item)}
                            onChange={() => toggle(t.item)}
                            className="size-3.5 accent-[var(--brand)]"
                          />
                          {t.display || t.item}
                        </label>
                      </th>
                      {dates.map((d) => {
                        const point = byDate.get(d);
                        return (
                          <td
                            key={d}
                            className={cn(
                              'border-b border-r border-border px-3 py-1.5 text-right',
                              point?.flag === 'high' && 'font-semibold text-lab-high',
                              point &&
                                (point.flag === 'low' || (point.flag !== 'high' && /[↓]/.test(point.value))) &&
                                'font-semibold text-lab-low',
                            )}
                          >
                            {point ? point.value : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
