import { CheckCircle2, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { PatientRecord } from '../../../data/chartMock';
import type { InpatientAdmission, InpatientProgress, LabResultEntry, PatientProfileEntry, ProblemListItem } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import type { Proposal, ProposalAction } from './agentModel';

type ClinicalAidPaneProps = {
  patient: PatientRecord;
  admission?: InpatientAdmission;
  admissions?: InpatientAdmission[];
  admissionProgress?: InpatientProgress | null;
  profile: PatientProfileEntry[];
  problems: ProblemListItem[];
  labs: LabResultEntry[];
  proposals: Proposal[];
  acceptedIds: Set<string>;
  onProposalAction: (proposalId: string, action: ProposalAction) => void;
  onClose: () => void;
};

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="mx-3 mb-3 overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="flex items-baseline gap-2 border-b border-border/70 px-3 py-2 text-[11.5px] font-bold text-text-primary">
        {title}
        {meta ? <span className="ms-auto text-[9.5px] font-normal tracking-normal">{meta}</span> : null}
      </div>
      <div className="[&>*]:border-b [&>*]:border-border/60 [&>*]:px-3 [&>*]:py-2 [&>*:last-child]:border-b-0">{children}</div>
    </section>
  );
}

export function ClinicalAidPane({
  patient,
  admission,
  admissions = [],
  admissionProgress,
  profile,
  problems,
  labs,
  proposals,
  acceptedIds,
  onProposalAction,
  onClose,
}: ClinicalAidPaneProps) {
  const activeProblems = problems.filter((problem) => problem.status !== 'resolved');
  const abnormalLabs = labs.filter((lab) => lab.flag !== 'normal').slice(0, 5);
  const inpatientInstructions = Array.from(new Set(admissionProgress?.rows.flatMap((row) => row.instructions) ?? [])).slice(-6).reverse();

  return (
    <aside className="workspace-aid flex h-full min-h-0 flex-col border-s border-border bg-card">
      <div className="flex flex-none items-center px-4 pb-2.5 pt-3.5">
        <h2 className="text-[13px] font-bold text-text-primary">補助情報</h2>
        <button aria-label="補助情報を閉じる" className="ms-auto grid size-8 place-items-center rounded-lg text-text-tertiary hover:bg-surface-subtle hover:text-text-primary" onClick={onClose} type="button">
          <X size={14} strokeWidth={1.7} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="アレルギー・注意">
          {patient.alerts.length > 0 ? patient.alerts.map((alert) => {
            const danger = ['red', 'magenta', 'purple'].includes(alert.color);
            return (
            <div key={alert.label}>
              <p className={cn('flex items-center gap-1.5 text-[12px] font-semibold', danger ? 'text-destructive' : 'text-text-primary')}><TriangleAlert size={13} />{alert.label}</p>
              <p className="mt-0.5 text-[11px] leading-[1.55] text-text-tertiary">患者ヘッダーにも継続表示されます。詳細は原記録を確認してください。</p>
            </div>
          );
          }) : <p className="text-[11.5px] text-text-tertiary">登録なし</p>}
        </Section>

        {admission ? (
          <Section meta="医師のみ改訂" title="入院時指示（頓用・コール基準）">
            {inpatientInstructions.length > 0 ? inpatientInstructions.map((instruction) => (
              <div key={instruction}>
                <p className="text-[12px] font-semibold leading-[1.5] text-text-primary">{instruction}</p>
                <p className="mt-0.5 text-[11px] text-text-tertiary">実施条件と時刻を原指示で確認</p>
              </div>
            )) : (
              <>
                <div><p className="text-[12px] font-semibold">発熱時（38.5℃ 以上）</p><p className="mt-0.5 text-[11px] text-text-tertiary">カロナール 500mg 1回 — 4時間あける</p></div>
                <div><p className="text-[12px] font-semibold">SpO₂ 92% 未満</p><p className="mt-0.5 text-[11px] text-text-tertiary">酸素 0.5L から開始し、当直医コール</p></div>
                <div><p className="text-[12px] font-semibold">収縮期 90 未満</p><p className="mt-0.5 text-[11px] text-text-tertiary">当直医コール</p></div>
              </>
            )}
          </Section>
        ) : null}

        <Section meta="新規異常を優先" title="フォロー中の検査 ★">
          {abnormalLabs.length > 0 ? abnormalLabs.map((lab) => (
            <div key={lab.item}>
              <p className="flex items-baseline text-[12px] font-semibold text-text-primary">
                {lab.item}
                <span className={cn('ms-auto text-[13px] font-bold tabular-nums', lab.flag === 'high' ? 'text-lab-high' : 'text-lab-low')}>
                  {lab.result} {lab.flag === 'high' ? '↑' : '↓'}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-text-tertiary">基準 {lab.baseline || '—'} · 前回 {lab.previous || '—'}</p>
            </div>
          )) : <p className="text-[11.5px] text-text-tertiary">新規の異常値はありません</p>}
        </Section>

        <Section title="既往・プロブレム">
          {activeProblems.length > 0 ? activeProblems.map((problem) => (
            <div key={problem.name}>
              <p className="text-[12px] font-semibold text-text-primary">{problem.name}</p>
              <p className="mt-0.5 text-[11px] text-text-tertiary">{problem.since}{problem.since.trim().endsWith('〜') ? '' : '〜'}{problem.icd10Code ? ` · ${problem.icd10Code}` : ''}</p>
            </div>
          )) : <p className="text-[11.5px] text-text-tertiary">活動中のプロブレムはありません</p>}
        </Section>

        <Section title="患者情報">
          {admission ? (
            <div>
              <p className="text-[11px] text-text-tertiary">病棟</p>
              <p className="text-[12px] font-medium leading-[1.5] text-text-primary">{[admission.wardName, admission.bedLabel, `主治医 ${admission.attendingDoctor}`].filter(Boolean).join(' · ')}</p>
            </div>
          ) : null}
          {profile.slice(0, 8).map((entry) => (
            <div key={`${entry.label}-${entry.value}`}>
              <p className="text-[11px] text-text-tertiary">{entry.label}</p>
              <p className="text-[12px] font-medium leading-[1.5] text-text-primary">{entry.value || '未登録'}</p>
            </div>
          ))}
        </Section>

        {admission ? (
          <Section meta="病棟横断" title="担当全体">
            <div>
              <p className="flex text-[11px] text-text-tertiary"><span>未実施の指示</span><b className="ms-auto text-[12px] text-text-primary">{admissions.reduce((sum, item) => sum + item.pendingInstructionCount, 0)}</b></p>
              <p className="mt-1 text-[11.5px] text-text-secondary">{admissions.filter((item) => item.pendingInstructionCount > 0).map((item) => `${item.patientName}（${item.wardName?.replace('病棟', '') ?? '—'}）`).join(' · ') || 'なし'}</p>
            </div>
            <div>
              <p className="flex text-[11px] text-text-tertiary"><span>入院担当患者</span><b className="ms-auto text-[12px] text-text-primary">{admissions.length}</b></p>
              <p className="mt-1 text-[11.5px] text-text-secondary">{new Set(admissions.map((item) => item.wardName)).size}病棟を横断して表示</p>
            </div>
          </Section>
        ) : null}

        <Section meta="候補 · 確定は医師" title="エージェント">
          {proposals.length > 0 ? proposals.map((proposal) => {
            const accepted = acceptedIds.has(proposal.id);
            return (
              <div className={cn('rounded-lg border border-border px-2.5 py-2', accepted && 'opacity-60')} key={proposal.id}>
                <p className="flex gap-1.5 text-[12px] font-semibold text-text-primary">
                  <Sparkles className="mt-0.5 size-3.5 flex-none text-brand" />{proposal.title}
                </p>
                <p className="mt-1 text-[11px] leading-[1.55] text-text-tertiary">{proposal.why}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {accepted ? <span className="flex items-center gap-1 text-[10.5px] font-semibold text-success"><CheckCircle2 size={12} />反映済み</span> : proposal.actions.map((action) => (
                    <button className="rounded-md border border-border px-2 py-1 text-[10.5px] font-semibold text-brand hover:bg-brand-tint" key={action.label} onClick={() => onProposalAction(proposal.id, action)} type="button">{action.label}</button>
                  ))}
                </div>
              </div>
            );
          }) : <p className="text-[11.5px] text-text-tertiary">現在の候補はありません</p>}
        </Section>
      </div>
    </aside>
  );
}
