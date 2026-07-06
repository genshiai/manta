import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

type AiStripProps = {
  /** 1行要約（太字ハイライトは summary 側で <b> を含めず、ここでは plain text） */
  oneLiner: ReactNode;
  generatedFrom: string;
  updatedAt: string;
  onExpand: () => void;
};

/** AIStrip 34px: ✦ 1行サマリー … [全文と根拠 ›]。KARTE_UI_SPEC §4.4 A状態 */
export function AiStrip({ oneLiner, generatedFrom, updatedAt, onExpand }: AiStripProps) {
  return (
    <div className="flex h-[34px] flex-none items-center gap-2.5 overflow-hidden border-b border-border bg-card px-4 text-[12px] text-text-secondary">
      <span className="grid size-5 flex-none place-items-center rounded-md bg-brand-tint text-brand">
        <Sparkles size={12} strokeWidth={1.8} />
      </span>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {oneLiner}{' '}
        <button type="button" onClick={onExpand} className="text-brand hover:underline">
          全文と根拠 ›
        </button>
      </span>
      <span className="ms-auto flex-none whitespace-nowrap text-[10.5px] text-text-tertiary tabular-nums">
        ✦ AIサマリー · {generatedFrom} · {updatedAt}
      </span>
    </div>
  );
}
