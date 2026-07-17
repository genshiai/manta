import type { ReactNode } from 'react';

type AiStripProps = {
  /** 1行要約（太字ハイライトは summary 側で <b> を含めず、ここでは plain text） */
  oneLiner: ReactNode;
  generatedFrom: string;
  updatedAt: string;
  expanded: boolean;
  onToggle: () => void;
};

/** AIStrip 34px: ✦ 1行サマリー … [全文と根拠 ›]。KARTE_UI_SPEC §4.4 A状態 */
export function AiStrip({ oneLiner, updatedAt, expanded, onToggle }: AiStripProps) {
  return (
    <div className="flex min-h-8 flex-none items-center gap-2 overflow-hidden border-b border-border bg-card px-5 py-1 text-[12.5px] text-text-secondary">
      <span className="flex-none text-brand">✦</span>
      {expanded ? (
        <span className="overflow-hidden text-ellipsis whitespace-nowrap text-text-tertiary">
          全文と根拠を表示中 — 畳むと 1行サマリーに戻ります
        </span>
      ) : (
        <>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{oneLiner}</span>
          <button
            type="button"
            aria-expanded="false"
            onClick={onToggle}
            className="flex-none whitespace-nowrap text-[12px] font-semibold text-brand hover:underline"
          >
            全文と根拠 ›
          </button>
        </>
      )}
      <span className="ms-auto flex-none whitespace-nowrap text-[10.5px] text-text-tertiary tabular-nums">
        AIサマリー · {updatedAt}
      </span>
    </div>
  );
}
