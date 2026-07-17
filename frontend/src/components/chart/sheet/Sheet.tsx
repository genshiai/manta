import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../../ui/utils';
import type { ActsColumn } from './ActsColumn';
import { AdmissionBlock } from './AdmissionBlock';
import { TodayDayBlock, VisitDayBlock } from './DayBlock';
import { LabResultBlock } from './LabResultBlock';
import { LensBar } from './LensBar';
import { formatMonthFloat, type Lens, type StreamBlock } from './streamModel';

type SheetProps = {
  blocks: StreamBlock[];
  activeLens: Lens;
  onLensChange: (lens: Lens) => void;
  onOpenCalendar: () => void;
  onOpenLabs: () => void;
  onTogglePanels: () => void;
  expandedVisits: Set<string>;
  onToggleVisit: (id: string) => void;
  onCompose?: () => void;
  onActAction?: ComponentProps<typeof ActsColumn>['onActAction'];
  aiCard?: ReactNode;
  /** 検査・処方・オーダー・画像文書など、時系列とは異なる専用レンズ */
  lensView?: ReactNode;
  calendarPopover?: ReactNode;
  /** Write モード時、本日ブロックの代わりにその場エディタを表示する */
  writeEditor?: ReactNode;
  streamEndLabel?: string;
  wide?: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  scrollRef?: RefObject<HTMLDivElement>;
};

/** 中央シート = 唯一のスクロール領域。KARTE_UI_SPEC §3・§4 */
export function Sheet({
  blocks,
  activeLens,
  onLensChange,
  onOpenCalendar,
  onOpenLabs,
  onTogglePanels,
  expandedVisits,
  onToggleVisit,
  onCompose,
  onActAction,
  aiCard,
  lensView,
  calendarPopover,
  writeEditor,
  streamEndLabel,
  wide = false,
  isLoading = false,
  errorMessage = null,
  scrollRef,
}: SheetProps) {
  const localRef = useRef<HTMLDivElement>(null);
  const scrollEl = scrollRef ?? localRef;
  const [monthLabel, setMonthLabel] = useState('');

  const updateMonth = useCallback(() => {
    const container = scrollEl.current;
    if (!container) return;
    const top = container.getBoundingClientRect().top;
    const nodes = container.querySelectorAll<HTMLElement>('[data-datekey]');
    let current = '';
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.top - top <= 24) {
        current = formatMonthFloat(node.dataset.datekey ?? '') || current;
      } else {
        break;
      }
    }
    if (!current && nodes.length > 0) {
      current = formatMonthFloat(nodes[0].dataset.datekey ?? '');
    }
    if (current) setMonthLabel(current);
  }, [scrollEl]);

  // ブロック内容が変わったら月フロートを再計算（意図的な依存）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute month when blocks change
  useEffect(() => {
    updateMonth();
  }, [updateMonth, blocks]);

  if (writeEditor) {
    return (
      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-full items-start justify-center overflow-y-auto px-[22px] pt-5">
          {writeEditor}
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <LensBar
        activeLens={activeLens}
        onLensChange={onLensChange}
        onOpenCalendar={onOpenCalendar}
        onOpenLabs={onOpenLabs}
        onTogglePanels={onTogglePanels}
      />
      {calendarPopover}
      <div className="relative min-h-0 flex-1">
        {monthLabel && lensView == null ? (
          <div className="pointer-events-none absolute right-6 top-2.5 z-[6] rounded-full border border-border bg-popover px-3 py-[3px] text-[11px] font-semibold text-text-secondary shadow-[var(--shadow-popover)] tabular-nums">
            {monthLabel}
          </div>
        ) : null}
        <div
          ref={scrollEl}
          onScroll={() => requestAnimationFrame(updateMonth)}
          className="h-full overflow-y-auto px-7 pb-[60px] pt-5"
        >
          <div
            className={cn(
              'mx-auto flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card',
              wide ? 'max-w-[860px]' : 'max-w-[860px]',
            )}
          >
            {aiCard}
            {activeLens === 'exam' && lensView == null ? (
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[14px] font-bold text-text-primary">診察 — SOAPと受診履歴</h2>
                  <p className="text-[11.5px] text-text-tertiary">本日の記載と過去のA/Pを時系列で確認</p>
                </div>
              </div>
            ) : null}
            {lensView != null ? (
              lensView
            ) : errorMessage ? (
              <div className="p-6 text-[13px] text-destructive">{errorMessage}</div>
            ) : isLoading ? (
              <div className="p-6 text-[13px] text-text-tertiary">カルテを読み込んでいます…</div>
            ) : blocks.length === 0 ? (
              <div className="p-10 text-center text-[13px] text-text-tertiary">
                このレンズに該当する記録はありません。
              </div>
            ) : (
              blocks.map((block) => {
                switch (block.kind) {
                  case 'today':
                    return (
                      <TodayDayBlock
                        key={block.id}
                        block={block}
                        onCompose={onCompose}
                        onActAction={onActAction}
                      />
                    );
                  case 'visit':
                    return (
                      <VisitDayBlock
                        key={block.id}
                        block={block}
                        expanded={expandedVisits.has(block.id)}
                        onToggle={() => onToggleVisit(block.id)}
                      />
                    );
                  case 'lab':
                    return <LabResultBlock key={block.id} block={block} />;
                  case 'admission':
                    return <AdmissionBlock key={block.id} data={block} />;
                  default:
                    return null;
                }
              })
            )}
            {lensView == null && streamEndLabel && blocks.length > 0 ? (
              <div className="px-5 py-3.5 text-center text-[11.5px] text-text-tertiary">{streamEndLabel}</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
