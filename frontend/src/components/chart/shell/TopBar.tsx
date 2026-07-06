import { ChevronLeft, Search, Sparkles } from 'lucide-react';
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
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-text-tertiary transition-colors hover:text-text-secondary"
      >
        <ChevronLeft size={14} strokeWidth={1.7} />
        {crumbRoot}
      </button>
      <span className="text-[12.5px] text-text-tertiary">/</span>
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-text-primary">{patientName}</span>
      {crumbTail ? (
        <>
          <span className="text-[12.5px] text-text-tertiary">/</span>
          <span className="whitespace-nowrap text-[12.5px] text-text-tertiary">{crumbTail}</span>
        </>
      ) : null}

      <button
        type="button"
        onClick={onOpenSearch}
        className="mx-auto flex h-8 w-full max-w-[400px] items-center gap-2 rounded-lg border border-border bg-surface-subtle px-2.5 text-[12.5px] text-text-tertiary transition-colors hover:border-border-strong"
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
        className="flex h-[30px] items-center gap-1.5 rounded-[7px] bg-brand-tint px-2.5 text-[12.5px] font-semibold text-brand"
      >
        <Sparkles size={14} strokeWidth={1.7} />
        エージェント
        {agentCount > 0 ? (
          <span className="grid h-[17px] min-w-[17px] place-items-center rounded-[9px] bg-brand px-1.5 text-[10px] font-bold text-white tabular-nums">
            {agentCount}
          </span>
        ) : null}
      </button>
    </>
  );
}
