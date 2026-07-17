import { X } from 'lucide-react';

type CalendarNavigatorProps = {
  dates: string[];
  onJump: (date: string) => void;
  onClose: () => void;
};

function parseDate(raw: string) {
  const date = new Date(raw.replace(/\//g, '-'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function CalendarNavigator({ dates, onJump, onClose }: CalendarNavigatorProps) {
  const grouped = new Map<number, Map<number, string>>();
  for (const raw of dates) {
    const date = parseDate(raw);
    if (!date) continue;
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (!grouped.has(year)) grouped.set(year, new Map());
    if (!grouped.get(year)?.has(month)) grouped.get(year)?.set(month, raw);
  }

  return (
    <div className="absolute end-5 top-[46px] z-30 w-[330px] rounded-xl border border-border-strong bg-popover px-3.5 py-3 shadow-[var(--shadow-popover)]">
      <div className="mb-2 flex items-center text-[12px] font-bold text-text-primary">
        カレンダー — 受診月へジャンプ
        <button aria-label="カレンダーを閉じる" className="ms-auto grid size-7 place-items-center rounded-md text-text-tertiary hover:bg-surface-subtle" onClick={onClose} type="button"><X size={13} /></button>
      </div>
      {Array.from(grouped.entries()).sort(([a], [b]) => b - a).map(([year, months]) => (
        <div className="grid grid-cols-[44px_1fr] gap-2 border-t border-border py-1.5 first:border-t-0" key={year}>
          <span className="text-[12px] font-bold text-text-secondary tabular-nums">{year}</span>
          <span className="flex flex-wrap gap-1">
            {Array.from(months.entries()).sort(([a], [b]) => b - a).map(([month, raw]) => (
              <button className="rounded-md bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-surface-muted" key={`${year}-${month}`} onClick={() => onJump(raw)} type="button">{month}月</button>
            ))}
          </span>
        </div>
      ))}
      {grouped.size === 0 ? <p className="py-3 text-center text-[11.5px] text-text-tertiary">受診日の記録がありません。</p> : null}
      <p className="mt-2 text-[10.5px] leading-[1.5] text-text-tertiary">月を選ぶと、その月の最初の記録へ移動します。</p>
    </div>
  );
}
