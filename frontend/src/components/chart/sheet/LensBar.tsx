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
  showCalendarChip = true,
}: LensBarProps) {
  return (
    <div className="relative flex min-h-10 flex-none flex-wrap items-center gap-1 border-b border-border bg-card px-5">
      {LENSES.map((lens) => (
        <button
          key={lens.value}
          type="button"
          onClick={() => onLensChange(lens.value)}
          className={cn(
            'inline-flex flex-none items-center whitespace-nowrap rounded-full px-3 py-[4.5px] text-[12.5px] font-semibold transition-colors',
            activeLens === lens.value
              ? 'bg-text-primary text-surface-page'
              : 'text-text-secondary hover:bg-surface-subtle',
          )}
          aria-pressed={activeLens === lens.value}
        >
          {lens.label}
        </button>
      ))}
      <div className="ms-auto flex gap-1.5">
        <span className="inline-flex whitespace-nowrap rounded-[7px] border border-border-strong bg-card px-[9px] py-1 text-[11.5px] font-semibold text-text-tertiary">ビュー: 医師標準</span>
        {showCalendarChip ? (
          <button type="button" onClick={onOpenCalendar} className="inline-flex items-center gap-1.5 rounded-[7px] border border-border-strong bg-card px-[9px] py-1 text-[11.5px] font-semibold text-text-secondary hover:bg-surface-subtle">カレンダー</button>
        ) : null}
        <button type="button" onClick={onOpenLabs} className="inline-flex items-center gap-1.5 rounded-[7px] border border-border-strong bg-card px-[9px] py-1 text-[11.5px] font-semibold text-text-secondary hover:bg-surface-subtle">検査を表で <Kbd>⌘L</Kbd></button>
      </div>
    </div>
  );
}
