import { Calendar, Columns3, LayoutGrid } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';
import { type Lens, LENSES } from './streamModel';

type LensBarProps = {
  activeLens: Lens;
  onLensChange: (lens: Lens) => void;
  onOpenCalendar: () => void;
  onOpenLabs: () => void;
  onTogglePanels: () => void;
  showCalendarChip?: boolean;
};

/** SheetHead 42px: レンズ + カレンダー/検査を表/並べる。KARTE_UI_SPEC §3・§4.3 */
export function LensBar({
  activeLens,
  onLensChange,
  onOpenCalendar,
  onOpenLabs,
  onTogglePanels,
  showCalendarChip = true,
}: LensBarProps) {
  return (
    <div className="flex h-[42px] flex-none items-center gap-1.5 border-b border-border bg-card px-[22px]">
      {LENSES.map((lens) => (
        <button
          key={lens.value}
          type="button"
          onClick={() => onLensChange(lens.value)}
          className={cn(
            'inline-flex h-[26px] items-center rounded-full px-[11px] text-[11.5px] font-semibold transition-colors',
            activeLens === lens.value
              ? 'bg-text-primary text-surface-page'
              : 'text-text-secondary hover:bg-surface-subtle',
          )}
          aria-pressed={activeLens === lens.value}
        >
          {lens.label}
        </button>
      ))}
      <span className="flex-1" />
      {showCalendarChip ? (
        <button
          type="button"
          onClick={onOpenCalendar}
          className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-[11.5px] text-text-secondary hover:bg-surface-subtle"
        >
          <Calendar size={12} strokeWidth={1.7} />
          カレンダー
        </button>
      ) : null}
      <button
        type="button"
        onClick={onOpenLabs}
        className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-[11.5px] text-text-secondary hover:bg-surface-subtle"
      >
        <LayoutGrid size={12} strokeWidth={1.7} />
        検査を表で <Kbd>⌘L</Kbd>
      </button>
      <button
        type="button"
        onClick={onTogglePanels}
        className="inline-flex h-[26px] items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-[11.5px] text-text-secondary hover:bg-surface-subtle"
      >
        <Columns3 size={12} strokeWidth={1.7} />
        並べる <Kbd>⌘\</Kbd>
      </button>
    </div>
  );
}
