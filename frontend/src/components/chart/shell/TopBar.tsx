import { Search } from 'lucide-react';
import { Kbd } from '../primitives/Kbd';

type TopBarProps = {
  crumbRoot: string;
  patientName: string;
  crumbTail?: string;
  agentCount: number;
  onBack: () => void;
  onOpenSearch: () => void;
  onOpenAgent: () => void;
};

/** TopBar 52px: 戻る+パンくず / ⌘K検索 / エージェント✦N / アバター。KARTE_UI_SPEC §3 */
export function TopBar({
  crumbRoot,
  patientName,
  crumbTail,
  agentCount,
  onBack,
  onOpenSearch,
  onOpenAgent,
}: TopBarProps) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-[7px] whitespace-nowrap text-[12px] text-text-tertiary">
        <button type="button" onClick={onBack} className="hover:text-text-secondary hover:underline">
          {crumbRoot}
        </button>
        <span className="text-border-strong">/</span>
        {crumbTail ? (
          <>
            <span>{patientName}</span>
            <span className="text-border-strong">/</span>
            <span className="font-semibold text-text-primary">{crumbTail}</span>
          </>
        ) : (
          <span className="font-semibold text-text-primary">{patientName}</span>
        )}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        className="mx-auto flex h-8 w-full max-w-[400px] items-center gap-[7px] rounded-lg border border-border bg-surface-page px-2.5 text-[12px] text-text-tertiary transition-colors hover:border-border-strong"
      >
        <Search size={14} strokeWidth={1.7} />
        患者・アクションを検索
        <span className="ms-auto">
          <Kbd>⌘K</Kbd>
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenAgent}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-strong px-2.5 py-[5.5px] text-[12px] font-semibold text-text-secondary hover:bg-surface-page"
      >
        <span className="text-brand">✦</span>
        エージェント {agentCount > 0 ? <span className="tabular-nums">{agentCount}</span> : null}
      </button>
    </>
  );
}
