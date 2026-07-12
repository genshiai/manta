import { ChevronRight, Lock, MoreHorizontal } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { VitalEntry } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import { ActsColumn } from './ActsColumn';
import type { RichText, SoapText, TodayBlock, VisitBlock } from './streamModel';

const SOAP_ROWS: Array<{ key: keyof SoapText; label: string }> = [
  { key: 'subjective', label: 'S' },
  { key: 'objective', label: 'O' },
  { key: 'assessment', label: 'A' },
  { key: 'plan', label: 'P' },
];

/** 赤入れ（差分）レンダラ。文字列はそのまま、セグメント列は ins(緑)/del(赤・取消線) で描く。P2 */
function Redline({ value }: { value: RichText }) {
  if (typeof value === 'string') return <>{value}</>;
  return (
    <>
      {value.map((seg, i) => {
        const key = `${i}-${seg.t}-${seg.text}`;
        if (seg.t === 'ins') {
          return (
            <ins key={key} className="rounded-[3px] bg-success-bg px-0.5 text-success no-underline">
              {seg.text}
            </ins>
          );
        }
        if (seg.t === 'del') {
          return (
            <del key={key} className="rounded-[3px] bg-destructive-bg px-0.5 text-destructive line-through">
              {seg.text}
            </del>
          );
        }
        return <span key={key}>{seg.text}</span>;
      })}
    </>
  );
}

function SoapRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[22px_1fr] gap-2.5">
      <span className="grid size-[22px] place-items-center rounded-md bg-muted text-[11.5px] font-bold text-text-secondary">
        {label}
      </span>
      <div className="text-[14.5px] leading-[1.75] text-text-primary">{children}</div>
    </div>
  );
}

function VitalsChips({ vitals }: { vitals: VitalEntry[] }) {
  if (vitals.length === 0) return null;
  return (
    <div className="mt-[7px] mb-0.5 flex flex-wrap gap-1.5">
      {vitals.map((v) => (
        <span
          key={v.label}
          className="inline-flex items-baseline gap-1 rounded-[5px] bg-surface-subtle px-2 py-0.5 text-[12px] text-text-secondary tabular-nums"
        >
          {v.label} <b className="font-semibold text-text-primary">{v.value}</b>
          {v.unit}
        </span>
      ))}
    </div>
  );
}

function DayHeader({
  dateLabel,
  time,
  meta,
  todayChip,
  finalized,
  onMenu,
}: {
  dateLabel: string;
  time?: string;
  meta: string;
  todayChip?: boolean;
  finalized?: { at: string; version: number };
  onMenu?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-[11px] pb-[9px]">
      <span className="text-[14px] font-bold text-text-primary tabular-nums">
        {dateLabel}
        {time ? ` ${time}` : ''}
      </span>
      {todayChip ? (
        <span className="rounded-md bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand">本日</span>
      ) : null}
      {finalized ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success tabular-nums">
          <Lock size={11} strokeWidth={2.2} />
          確定 v{finalized.version} · {finalized.at}
        </span>
      ) : null}
      <span className="text-[11.5px] text-text-tertiary">{meta}</span>
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
  );
}

type TodayDayBlockProps = {
  block: TodayBlock;
  /** ／⌘O コンポーザを開く（行為列の + と addline） */
  onCompose?: () => void;
  onActAction?: ComponentProps<typeof ActsColumn>['onActAction'];
};

/** 本日ブロック（View 表示）。border-l 3px brand + 本日 chip。 */
export function TodayDayBlock({ block, onCompose, onActAction }: TodayDayBlockProps) {
  return (
    <article
      data-datekey={block.dateKey}
      className="relative border-b border-border shadow-[inset_3px_0_0_var(--brand)]"
    >
      <DayHeader
        dateLabel={block.dateLabel}
        time={block.time}
        meta={block.meta}
        todayChip
        finalized={block.finalized}
      />
      <div className="grid grid-cols-[1fr_232px] gap-x-[18px] px-5 pb-3.5">
        <div className="flex min-w-0 flex-col gap-2.5">
          {SOAP_ROWS.map(({ key, label }) => {
            const text = block.soap[key];
            if (!text && key !== 'objective') return null;
            return (
              <SoapRow key={key} label={label}>
                {text}
                {key === 'objective' ? <VitalsChips vitals={block.vitals} /> : null}
              </SoapRow>
            );
          })}
        </div>
        <ActsColumn
          heading="行為・オーダー"
          acts={block.acts}
          billing={block.billing}
          onAdd={onCompose}
          onActAction={onActAction}
        />
      </div>
      {block.amendments && block.amendments.length > 0 ? (
        <div className="flex flex-col gap-2.5 px-5 pb-1">
          {block.amendments.map((am) => (
            <div key={`${am.at}-${am.author}`} className="border-l-[2.5px] border-brand pl-3">
              <div className="pb-0.5 text-[10.5px] text-text-tertiary tabular-nums">
                追記 · {am.author} · {am.at}
              </div>
              <div className="text-[13.5px] leading-[1.7] text-text-primary">
                <Redline value={am.body} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onCompose}
        className="flex w-full items-center gap-2 px-5 pt-2 pb-3 text-left text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <span className="grid size-5 place-items-center rounded-md border border-dashed border-border-strong text-[12px] font-bold">
          ／
        </span>
        追記・オーダー・病名・文書 —
        <b className="font-semibold text-text-secondary">／ か ⌘O で呼び出し</b>
      </button>
    </article>
  );
}

type VisitDayBlockProps = {
  block: VisitBlock;
  expanded: boolean;
  onToggle: () => void;
};

/** 過去受診ブロック。A/P要約 + 行為サマリ常時、S/O全文は折畳。 */
export function VisitDayBlock({ block, expanded, onToggle }: VisitDayBlockProps) {
  const hasActs = block.acts.length > 0;
  return (
    <article data-datekey={block.dateKey} className="border-b border-border">
      <DayHeader dateLabel={block.dateLabel} time={block.time} meta={block.meta} />
      <div className={cn('grid gap-x-[18px] px-5 pb-3.5', hasActs ? 'grid-cols-[1fr_232px]' : 'grid-cols-1')}>
        <div className="flex min-w-0 flex-col gap-2.5">
          <SoapRow label="A">
            <span className="text-[13.5px]">{block.assessment}</span>
          </SoapRow>
          {expanded && block.soap ? (
            <>
              <SoapRow label="S">
                <span className="text-[13.5px]">{block.soap.subjective}</span>
              </SoapRow>
              <SoapRow label="O">
                <span className="text-[13.5px]">{block.soap.objective}</span>
              </SoapRow>
              <SoapRow label="P">
                <span className="text-[13.5px]">{block.soap.plan}</span>
              </SoapRow>
            </>
          ) : null}
        </div>
        {hasActs ? <ActsColumn acts={block.acts} billing={block.billing} /> : null}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-[7px] px-5 pb-3 text-[12px] text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronRight
          size={12}
          strokeWidth={1.9}
          className={cn('transition-transform', expanded && 'rotate-90')}
        />
        {block.foldLabel}
      </button>
    </article>
  );
}
