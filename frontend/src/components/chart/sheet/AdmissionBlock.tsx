import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../ui/utils';
import type { AdmissionBlockData } from './streamModel';
import { VitalsBoard, type VitalsPeriod } from './VitalsBoard';

const LENSES = ['温度板', '経過抄録', '指示', '看護記録', '文書'] as const;
type AdmLens = (typeof LENSES)[number];

const WINDOW: Record<VitalsPeriod, number> = { '3日': 3, '7日': 7, '14日': 14, 全期間: 99 };

/** 入院ブロック（外来と同じシート・同じ文法）。KARTE_UI_SPEC §8 */
export function AdmissionBlock({ data }: { data: AdmissionBlockData }) {
  const [lens, setLens] = useState<AdmLens>('温度板');
  const [period, setPeriod] = useState<VitalsPeriod>('7日');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const size = Math.min(WINDOW[period], data.days.length);
  const start = Math.max(0, Math.min(offset, data.days.length - size));
  const windowDays = data.days.slice(start, start + size);
  const rangeLabel =
    windowDays.length > 0
      ? `${windowDays[0].date}（病日${windowDays[0].byoubi}）– ${windowDays[windowDays.length - 1].date}`
      : data.rangeLabel;

  return (
    <article data-datekey={data.dateKey} className="border-b border-border">
      <div className="flex items-center gap-2.5 px-5 pt-[11px] pb-[9px]">
        <span className="text-[14px] font-bold text-text-primary tabular-nums">{data.headerRange}</span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{data.diagnosis}</span>
        <span className="text-[11.5px] text-text-tertiary">{data.location}</span>
        <span className="flex-1" />
        <button type="button" aria-label="ブロック操作" className="grid size-[26px] place-items-center rounded-[7px] text-text-tertiary hover:bg-surface-subtle">
          <MoreHorizontal size={16} strokeWidth={1.7} />
        </button>
      </div>

      <div className="px-5 pb-4">
        <div className="flex gap-1 pb-2.5 pt-0.5">
          {LENSES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLens(l)}
              className={cn(
                'inline-flex h-[26px] items-center rounded-full px-[11px] text-[11.5px] font-semibold transition-colors',
                lens === l ? 'bg-text-primary text-surface-page' : 'text-text-secondary hover:bg-surface-subtle',
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {lens === '温度板' ? (
          <VitalsBoard
            days={windowDays}
            rangeLabel={rangeLabel}
            subLabel={data.rangeSubLabel}
            period={period}
            onPrev={() => setOffset((o) => Math.max(0, o - 1))}
            onNext={() => setOffset((o) => Math.min(data.days.length - size, o + 1))}
            onPeriodChange={(p) => {
              setPeriod(p);
              setOffset(0);
            }}
          />
        ) : lens === '経過抄録' ? (
          <div className="rounded-[10px] border border-border bg-card px-4 py-3 text-[13.5px] leading-[1.8] text-text-primary">
            {data.abstract}
          </div>
        ) : lens === '文書' ? (
          <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-4 py-3">
            {data.documents.map((doc) => (
              <div key={doc.name} className="flex items-center justify-between text-[12.5px]">
                <span className="font-semibold text-text-primary">{doc.name}</span>
                <span className={cn('text-[11px]', doc.ok ? 'text-success' : 'text-text-tertiary')}>{doc.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-border bg-surface-subtle px-4 py-6 text-center text-[12px] text-text-tertiary">
            {lens} は展開して読む（デモ）。
          </div>
        )}
      </div>

      {/* 抄録 + 文書サマリ（2カラム） */}
      <div className="grid grid-cols-[1fr_232px] gap-x-[18px] px-5 pb-3.5 pt-0.5">
        <div className="grid grid-cols-[22px_1fr] gap-2.5">
          <span className="grid size-[22px] place-items-center rounded-md bg-muted text-[11.5px] font-bold text-text-secondary">抄</span>
          <div className="text-[13.5px] leading-[1.75] text-text-primary">{data.abstract}</div>
        </div>
        <div className="flex flex-col gap-2 border-l border-border pl-4">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-text-tertiary">この入院の文書</div>
          {data.documents.map((doc) => (
            <div key={doc.name} className="flex flex-col gap-px">
              <div className="text-[12px] font-semibold text-text-primary">{doc.name}</div>
              <div className={cn('text-[11px]', doc.ok ? 'text-success' : 'text-text-tertiary')}>{doc.status}</div>
            </div>
          ))}
          <div className="mt-0.5 flex justify-between border-t border-dashed border-border pt-[7px] text-[11px] text-text-secondary">
            <span>入院会計</span>
            <b className="font-bold text-text-primary">{data.billingLabel}</b>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-[7px] px-5 pb-3 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronRight size={12} strokeWidth={1.9} className={cn('transition-transform', expanded && 'rotate-90')} />
        {data.foldLabel}
      </button>
    </article>
  );
}
