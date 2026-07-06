import { ChevronDown, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { cn } from '../../ui/utils';
import type { SummaryContract } from './summaryModel';

type SummaryFormat = 'prose' | 'briefing';

type AiSummaryCardProps = {
  summary: SummaryContract;
  format: SummaryFormat;
  onFormatChange: (format: SummaryFormat) => void;
  onCollapse: () => void;
  onJumpTo: (blockRef: string) => void;
  onAsk: () => void;
};

/** B: AIO カード（既定の展開形）。C 定型行 / D 追い質問チップを同梱。KARTE_UI_SPEC §4.4 */
export function AiSummaryCard({
  summary,
  format,
  onFormatChange,
  onCollapse,
  onJumpTo,
  onAsk,
}: AiSummaryCardProps) {
  return (
    <article
      className="mx-3.5 mb-1 mt-3.5 overflow-hidden rounded-[13px] border"
      style={{
        borderColor: 'color-mix(in srgb, var(--brand) 28%, var(--border))',
        background: 'linear-gradient(180deg, var(--brand-tint), var(--card) 55%)',
      }}
    >
      {/* header */}
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <span
          className="grid size-6 flex-none place-items-center rounded-lg border bg-card text-brand"
          style={{ borderColor: 'color-mix(in srgb, var(--brand) 30%, var(--border))' }}
        >
          <Sparkles size={13} strokeWidth={1.8} />
        </span>
        <span className="text-[13px] font-bold text-text-primary">AIサマリー</span>
        <span className="text-[11px] text-text-tertiary">
          {summary.generatedFrom} · {summary.generatedAt} 更新
        </span>
        <span className="flex-1" />
        <div className="flex overflow-hidden rounded-md border border-border">
          {(['prose', 'briefing'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onFormatChange(f)}
              className={cn(
                'px-2 py-0.5 text-[10.5px] font-semibold transition-colors',
                format === f ? 'bg-brand-tint text-brand' : 'bg-card text-text-tertiary',
              )}
            >
              {f === 'prose' ? '散文' : '定型'}
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 text-text-tertiary">
          <button type="button" aria-label="役に立った" className="grid size-[26px] place-items-center rounded-[7px] hover:bg-card">
            <ThumbsUp size={12} strokeWidth={1.7} />
          </button>
          <button type="button" aria-label="役に立たない" className="grid size-[26px] place-items-center rounded-[7px] hover:bg-card">
            <ThumbsDown size={12} strokeWidth={1.7} />
          </button>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
        >
          畳む <ChevronDown size={12} strokeWidth={1.7} />
        </button>
      </div>

      {/* body */}
      {format === 'prose' ? (
        <div className="grid grid-cols-[1fr_236px] gap-4 px-4 pb-3 pt-2.5">
          <div className="flex flex-col gap-[7px] text-[13.5px] leading-[1.8] text-text-primary">
            {summary.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">根拠</div>
            {summary.evidence.map((ev) => (
              <button
                key={`${ev.date}-${ev.label}`}
                type="button"
                onClick={() => onJumpTo(ev.blockRef)}
                className="rounded-lg border border-border bg-card px-2.5 py-[7px] text-left text-[11px] leading-[1.5] text-text-secondary hover:border-border-strong"
              >
                <b className="block text-[11.5px] font-semibold text-text-primary">
                  {ev.date} {ev.kind === 'lab' ? '検査' : ev.kind === 'admission' ? '入院' : '受診'}
                </b>
                {ev.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-0 py-1">
          {(
            [
              { k: '管理中', v: summary.briefing.managing, warn: false },
              { k: '変化', v: summary.briefing.change, warn: false },
              { k: '本日', v: summary.briefing.today, warn: false },
              { k: '注意', v: summary.briefing.caution, warn: true },
            ] as const
          ).map((row) => (
            <div key={row.k} className="flex items-baseline gap-2.5 border-b border-border px-4 py-[9px] text-[13px] leading-[1.65] last:border-b-0">
              <span
                className={cn(
                  'w-14 flex-none text-[11px] font-bold tracking-[0.04em]',
                  row.warn ? 'text-warning' : 'text-text-tertiary',
                )}
              >
                {row.k}
              </span>
              <span className="text-text-primary">{row.v}</span>
            </div>
          ))}
        </div>
      )}

      {/* follow-up chips (D) */}
      <div className="flex flex-wrap gap-1.5 px-4 pb-2 pt-0.5">
        {summary.followUps.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={onAsk}
            className="inline-flex h-7 items-center rounded-full border bg-card px-3 text-[12px] font-semibold text-brand"
            style={{ borderColor: 'color-mix(in srgb, var(--brand) 30%, var(--border))' }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* footer */}
      <div
        className="flex items-center justify-between gap-2.5 border-t px-4 py-2 text-[10.5px] text-text-tertiary"
        style={{ borderTopColor: 'color-mix(in srgb, var(--brand) 14%, var(--border))' }}
      >
        <span>AIによる要約です。診療上の判断は原本を確認してください。</span>
        <button type="button" onClick={onAsk} className="whitespace-nowrap font-semibold text-brand">
          この患者について質問 ⌘J
        </button>
      </div>
    </article>
  );
}
