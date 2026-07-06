import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../ui/utils';
import type { BillingPreview, SheetAct } from './streamModel';

type ActsColumnProps = {
  heading?: string;
  acts: SheetAct[];
  billing: BillingPreview;
  onAdd?: () => void;
  onActAction?: (act: SheetAct, action: 'edit' | 'cancel' | 'copy') => void;
};

function ActRow({
  act,
  onActAction,
}: {
  act: SheetAct;
  onActAction?: ActsColumnProps['onActAction'];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover コンテナ（⋯メニューの閉じ制御）
    <div
      className="group relative flex flex-col gap-px"
      onMouseLeave={() => setMenuOpen(false)}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold leading-[1.45] text-text-primary">
            {act.name}
            {act.isNew ? (
              <span className="ms-1.5 rounded bg-brand-tint px-1.5 text-[10px] font-bold text-brand">新規</span>
            ) : null}
          </div>
          {act.usage ? (
            <div className="text-[11px] leading-[1.4] text-text-tertiary tabular-nums">{act.usage}</div>
          ) : null}
          {act.warn ? <div className="text-[11px] leading-[1.4] text-warning">{act.warn}</div> : null}
        </div>
        {onActAction ? (
          <button
            type="button"
            aria-label="操作"
            onClick={() => setMenuOpen((v) => !v)}
            className="mt-px hidden size-5 flex-none place-items-center rounded text-text-tertiary hover:bg-surface-subtle group-hover:grid"
          >
            <MoreHorizontal size={14} strokeWidth={1.7} />
          </button>
        ) : null}
      </div>
      {menuOpen && onActAction ? (
        <div className="absolute right-0 top-6 z-10 w-28 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-[var(--shadow-popover)]">
          {(['edit', 'cancel', 'copy'] as const).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                onActAction(act, action);
                setMenuOpen(false);
              }}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-[12px] hover:bg-surface-subtle',
                action === 'cancel' ? 'text-destructive' : 'text-text-primary',
              )}
            >
              {action === 'edit' ? '編集' : action === 'cancel' ? '取消' : 'コピー'}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 行為列（記述の右）。薬剤・検査・画像・処置 + 点数行。KARTE_UI_SPEC §4.2 */
export function ActsColumn({ heading = '行為', acts, billing, onAdd, onActAction }: ActsColumnProps) {
  return (
    <div className="flex flex-col gap-2 border-l border-border pl-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
        {heading}
        <span className="flex-1" />
        {onAdd ? (
          <button
            type="button"
            aria-label="行為を追加"
            onClick={onAdd}
            className="grid size-4 place-items-center rounded text-text-tertiary hover:text-brand"
          >
            <Plus size={12} strokeWidth={1.9} />
          </button>
        ) : null}
      </div>
      {acts.map((act) => (
        <ActRow key={act.id} act={act} onActAction={onActAction} />
      ))}
      {billing ? (
        <div className="mt-0.5 flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-[7px] text-[11px] text-text-secondary tabular-nums">
          <span className="min-w-0 truncate">{billing.lines.map((l) => `${l.label} ${l.points}`).join(' + ')}</span>
          <span className="flex items-baseline gap-1">
            <span className="rounded bg-muted px-1 text-[9px] font-bold not-italic text-text-tertiary tabular-nums">概算</span>
            <b className="font-bold text-text-primary">{billing.total}点</b>
          </span>
        </div>
      ) : acts.length > 0 ? (
        <div className="mt-0.5 flex justify-between border-t border-dashed border-border pt-[7px] text-[11px] text-text-tertiary tabular-nums">
          <span />
          <span>—点</span>
        </div>
      ) : null}
    </div>
  );
}
