import { CheckCircle2, PinOff, ReceiptText, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';
import type { Proposal, ProposalAction, ProposalBadge } from './agentModel';

type PlanSummary = { rx: number; lab: number; imaging: number; points: number | null };

type AgentTrayProps = {
  proposals: Proposal[];
  acceptedIds: Set<string>;
  planSummary: PlanSummary;
  onAction: (proposalId: string, action: ProposalAction) => void;
  onAsk: () => void;
  onUnpin: () => void;
};

const badgeStyle: Record<ProposalBadge, string> = {
  warn: 'bg-warning-bg text-warning',
  bad: 'bg-destructive-bg text-destructive',
  acc: 'bg-brand-tint text-brand',
  ok: 'bg-success-bg text-success',
};

function BadgeIcon({ badge }: { badge: ProposalBadge }) {
  if (badge === 'acc') return <ReceiptText size={13} strokeWidth={1.8} />;
  if (badge === 'ok') return <CheckCircle2 size={13} strokeWidth={1.8} />;
  return <TriangleAlert size={13} strokeWidth={1.8} />;
}

/** 右トレイ: エージェント提案。KARTE_UI_SPEC §7。確定は医師のみ（ADR 0004）。 */
export function AgentTray({
  proposals,
  acceptedIds,
  planSummary,
  onAction,
  onAsk,
  onUnpin,
}: AgentTrayProps) {
  return (
    <aside className="flex h-full w-[332px] flex-none flex-col border-l border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border px-3.5 pb-2.5 pt-3">
        <div className="flex items-center gap-2 text-[12.5px] font-bold">
          <span className="grid size-[21px] place-items-center rounded-md bg-brand-tint text-brand">
            <Sparkles size={13} strokeWidth={1.8} />
          </span>
          エージェント
          <span className="ms-auto flex items-center gap-1.5 text-[10.5px] font-semibold text-text-tertiary">
            <span className="size-1.5 rounded-full bg-success" />
            文脈: 本日の診察
          </span>
          <button type="button" aria-label="ピンを外す" onClick={onUnpin} className="text-text-tertiary hover:text-text-secondary">
            <PinOff size={13} strokeWidth={1.7} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-secondary">
          <span className="rounded-[5px] bg-surface-subtle px-1.5 py-0.5 tabular-nums">処方 {planSummary.rx}</span>
          <span className="rounded-[5px] bg-surface-subtle px-1.5 py-0.5 tabular-nums">検査 {planSummary.lab}</span>
          <span className="rounded-[5px] bg-surface-subtle px-1.5 py-0.5 tabular-nums">画像 {planSummary.imaging}</span>
          {planSummary.points != null ? (
            <span className="rounded-[5px] bg-surface-subtle px-1.5 py-0.5 tabular-nums">{planSummary.points}点</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {proposals.length === 0 ? (
          <p className="px-2 py-6 text-center text-[11.5px] text-text-tertiary">
            未処理の提案はありません。
          </p>
        ) : (
          proposals.map((p) => {
            const accepted = acceptedIds.has(p.id);
            return (
              <div
                key={p.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-[9px] border border-border bg-card px-2.5 py-2.5',
                  accepted && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2">
                  <span className={cn('grid size-6 flex-none place-items-center rounded-[7px]', badgeStyle[p.badge])}>
                    <BadgeIcon badge={p.badge} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold leading-[1.45] text-text-primary">{p.title}</div>
                    <div className="text-[11px] leading-[1.6] text-text-secondary">{p.why}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {accepted ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                      <CheckCircle2 size={12} strokeWidth={1.9} /> 反映済み
                    </span>
                  ) : (
                    p.actions.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => onAction(p.id, action)}
                        className={cn(
                          'inline-flex h-6 items-center rounded-[7px] px-2.5 text-[11px] font-semibold',
                          action.kind === 'primary'
                            ? 'border border-border bg-card text-brand'
                            : 'text-text-secondary hover:text-text-primary',
                        )}
                      >
                        {action.label}
                      </button>
                    ))
                  )}
                  <span className="ms-auto rounded bg-muted px-1.5 py-px text-[9.5px] font-bold text-text-tertiary">
                    {p.cand}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-none flex-col gap-1.5 border-t border-border px-3 pb-3 pt-2.5">
        <button
          type="button"
          onClick={onAsk}
          className="flex h-[34px] items-center gap-2 rounded-[9px] border border-border bg-surface-subtle px-2.5 text-[11.5px] text-text-tertiary hover:border-border-strong"
        >
          <Sparkles size={13} strokeWidth={1.7} />
          依頼を入力…
          <span className="ms-auto">
            <Kbd>⌘J</Kbd>
          </span>
        </button>
        <p className="text-center text-[10px] text-text-tertiary">提案は下書き。確定は医師のみ。</p>
      </div>
    </aside>
  );
}
