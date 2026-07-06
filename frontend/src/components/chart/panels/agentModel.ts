/**
 * エージェント提案カードのモデル（KARTE_UI_SPEC §2-3・§7）。
 * 既存の PMDA 警告・病名不足・算定漏れ（施設ルール相当）から候補カードを整形する。
 * すべて「候補/下書き」であり、確定操作は人間（医師）が行う（ADR 0004）。
 */
import type { AlertItem } from '../../../data/chartMock';
import type {
  PrescriptionCatalogItem,
  PrescriptionEntry,
  ProblemListItem,
} from '../../../types/workflow';

export type ProposalBadge = 'warn' | 'bad' | 'acc' | 'ok';
export type ProposalAction =
  | { kind: 'primary'; label: string; type: 'addDiagnosis'; diagnosisName: string }
  | { kind: 'primary'; label: string; type: 'ackBilling' }
  | { kind: 'ghost'; label: string; type: 'openUrl'; url: string }
  | { kind: 'ghost'; label: string; type: 'dismiss' };

export type Proposal = {
  id: string;
  badge: ProposalBadge;
  title: string;
  why: string;
  cand: '候補' | '注意' | '下書き';
  actions: ProposalAction[];
};

type BuildArgs = {
  prescriptions: PrescriptionEntry[];
  catalog: PrescriptionCatalogItem[];
  problems: ProblemListItem[];
  alerts: AlertItem[];
  managedProblemCount: number;
  billingAcked: boolean;
};

export function buildProposals(args: BuildArgs): Proposal[] {
  const proposals: Proposal[] = [];
  const activeNames = args.problems.filter((p) => p.status !== 'resolved').map((p) => p.name);

  // 病名候補: 処方に対応する適応病名が無い
  for (const rx of args.prescriptions) {
    const drug = args.catalog.find((d) => d.drugName === rx.drugName || rx.drugName.includes(d.drugName));
    if (drug?.relatedProblem && !activeNames.some((n) => n.includes(drug.relatedProblem ?? '×'))) {
      proposals.push({
        id: `dx-${drug.id}`,
        badge: 'warn',
        title: `病名候補: ${drug.relatedProblem}`,
        why: `${rx.drugName} に対応する病名がありません。本日の記載とも整合します。`,
        cand: '候補',
        actions: [
          { kind: 'primary', label: '病名に追加', type: 'addDiagnosis', diagnosisName: drug.relatedProblem },
          { kind: 'ghost', label: '却下', type: 'dismiss' },
        ],
      });
    }
  }

  // 薬剤注意: PMDA 警告
  for (const rx of args.prescriptions) {
    if (rx.warnings && rx.warnings.length > 0) {
      const drug = args.catalog.find((d) => d.drugName === rx.drugName || rx.drugName.includes(d.drugName));
      const actions: ProposalAction[] = [];
      if (drug?.pmdaInfoUrl) actions.push({ kind: 'ghost', label: '添文', type: 'openUrl', url: drug.pmdaInfoUrl });
      actions.push({ kind: 'ghost', label: '確認済み', type: 'dismiss' });
      proposals.push({
        id: `pmda-${rx.drugName}`,
        badge: 'bad',
        title: `薬剤注意: ${rx.drugName}`,
        why: rx.warnings[0],
        cand: '注意',
        actions,
      });
    }
  }

  // 算定漏れ: 特定疾患療養管理料
  if (args.managedProblemCount >= 1 && !args.billingAcked) {
    proposals.push({
      id: 'billing-management',
      badge: 'acc',
      title: '算定漏れ: 特定疾患療養管理料 225点',
      why: '継続管理中の疾患があります。今月未算定（施設ルール）。',
      cand: '候補',
      actions: [
        { kind: 'primary', label: '会計に追加', type: 'ackBilling' },
        { kind: 'ghost', label: '算定しない', type: 'dismiss' },
      ],
    });
  }

  return proposals;
}
