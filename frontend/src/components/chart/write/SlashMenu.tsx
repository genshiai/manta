import { AtSign, FileText, FlaskConical, Pill, ScanLine, Shapes, Sparkles } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { SlashIcon, SlashItem } from './slashModel';

const ICONS: Record<SlashIcon, typeof Pill> = {
  rx: Pill,
  flask: FlaskConical,
  xray: ScanLine,
  at: AtSign,
  schema: Shapes,
  spark: Sparkles,
  doc: FileText,
};

type SlashMenuProps = {
  items: SlashItem[];
  query: string;
  triggerType: '/' | '@';
  activeIndex: number;
  position: { top: number; left: number };
  onHover: (index: number) => void;
  onSelect: (item: SlashItem) => void;
};

/** ／・@ メニュー（KARTE_UI_SPEC §5.2・§5.3）。キャレット直下ポップオーバー。 */
export function SlashMenu({
  items,
  query,
  triggerType,
  activeIndex,
  position,
  onHover,
  onSelect,
}: SlashMenuProps) {
  const groups = Array.from(new Set(items.map((i) => i.group)));
  let flatIndex = -1;

  return (
    <div
      className="absolute z-30 w-[328px] overflow-hidden rounded-[11px] border border-border bg-popover shadow-[var(--shadow-modal)]"
      style={{ top: position.top, left: position.left }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-[12.5px]">
        <span className="text-text-tertiary">{triggerType === '@' ? '@' : '／'}</span>
        <span className="font-semibold text-text-primary">{query || (triggerType === '@' ? 'データ差込' : 'コマンド')}</span>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-text-tertiary">該当なし</p>
        ) : (
          groups.map((group) => (
            <div key={group} className="border-b border-border px-1.5 py-1.5 last:border-b-0">
              <div className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
                {group}
              </div>
              {items
                .filter((i) => i.group === group)
                .map((item) => {
                  flatIndex += 1;
                  const idx = flatIndex;
                  const Icon = ICONS[item.icon];
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => onHover(idx)}
                      onClick={() => onSelect(item)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px]',
                        active ? 'bg-brand-tint' : 'hover:bg-surface-subtle',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-[22px] flex-none place-items-center rounded-md',
                          active ? 'bg-brand/15 text-brand' : 'bg-surface-subtle text-text-tertiary',
                        )}
                      >
                        <Icon size={13} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-text-primary">{item.label}</span>
                      {item.sub ? (
                        <span className="ms-auto whitespace-nowrap text-[10.5px] text-text-tertiary tabular-nums">
                          {item.sub}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          ))
        )}
      </div>
      <div className="flex gap-3 border-t border-border px-3 py-1.5 text-[10.5px] text-text-tertiary">
        <span>↑↓ 選択</span>
        <span>⏎ 挿入</span>
        <span>①②③ 最近を即実行</span>
        <span>esc 閉じる</span>
      </div>
    </div>
  );
}
