import { MoreHorizontal } from 'lucide-react';
import type { LabResultEntry } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import type { LabBlock } from './streamModel';

function severity(result: LabResultEntry): 'high' | 'low' | 'normal' {
  if (result.flag === 'high') return 'high';
  if (result.flag === 'low' || /[↓]|低/.test(result.result)) return 'low';
  return 'normal';
}

function arrow(sev: 'high' | 'low' | 'normal'): string {
  if (sev === 'high') return ' ↑';
  if (sev === 'low') return ' ↓';
  return '';
}

/** 検査結果ブロック（3〜6列グリッド・H/L色）。KARTE_UI_SPEC §4.1 */
export function LabResultBlock({ block, onMenu }: { block: LabBlock; onMenu?: () => void }) {
  const cols = Math.min(6, Math.max(3, block.results.length));
  return (
    <article data-datekey={block.dateKey} className="border-b border-border">
      <div className="flex items-center gap-2.5 px-5 pt-[11px] pb-[9px]">
        <span className="text-[14px] font-bold text-text-primary tabular-nums">
          {block.dateLabel}
          {block.time ? ` ${block.time}` : ''}
        </span>
        <span className="text-[11.5px] text-text-tertiary">{block.meta}</span>
        <span className="flex-1" />
        {onMenu ? (
          <button
            type="button"
            aria-label="ブロック操作"
            onClick={onMenu}
            className="grid size-[26px] place-items-center rounded-[7px] text-text-tertiary hover:bg-surface-subtle"
          >
            <MoreHorizontal size={16} strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
      <div className="px-5 pb-3.5">
        <div
          className="grid gap-x-[18px] gap-y-[5px] rounded-lg bg-surface-subtle px-3.5 py-2.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {block.results.map((r) => {
            const sev = severity(r);
            return (
              <div key={r.item} className="flex items-baseline justify-between text-[12.5px]">
                <span className="text-text-tertiary">{r.item}</span>
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    sev === 'high' && 'text-lab-high',
                    sev === 'low' && 'text-lab-low',
                    sev === 'normal' && 'text-text-primary',
                  )}
                >
                  {r.result}
                  {arrow(sev)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
