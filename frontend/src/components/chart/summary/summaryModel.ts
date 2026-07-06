/**
 * AIサマリーの生成コントラクト（KARTE_UI_SPEC §4.4・§13）。
 * v1 はルール生成（engine:'rule'）。UI は engine 以外 v1/v2 を区別しない。
 * 将来 LLM に差し替えても同じ JSON を返せば UI は不変。
 */
import type { AlertItem } from '../../../data/chartMock';
import type { ChartHistoryEntry, LabResultEntry, ProblemListItem } from '../../../types/workflow';

export type SummaryEvidence = {
  date: string;
  kind: 'lab' | 'exam' | 'admission';
  label: string;
  /** スクロールジャンプ先の dateKey */
  blockRef: string;
};

export type SummaryBriefing = {
  managing: string;
  change: string;
  today: string;
  caution: string;
};

export type SummaryContract = {
  oneLiner: string;
  paragraphs: string[];
  briefing: SummaryBriefing;
  evidence: SummaryEvidence[];
  followUps: string[];
  generatedFrom: string;
  generatedAt: string;
  engine: 'rule' | 'llm';
};

type BuildSummaryArgs = {
  problems: ProblemListItem[];
  labResults: LabResultEntry[];
  chartHistory: ChartHistoryEntry[];
  alerts: AlertItem[];
  todayReason?: string;
  updatedAt: string;
};

const RENAL_HINT = /egfr|クレアチニン|ｅＧＦＲ/i;

function activeProblemPhrase(problems: ProblemListItem[]): string {
  const active = problems.filter((p) => p.status !== 'resolved');
  if (active.length === 0) return '経過を記録中';
  const names = active.slice(0, 3).map((p) => p.name).join('・');
  const since = active
    .map((p) => p.since)
    .filter(Boolean)
    .sort()[0];
  const sinceLabel = since ? `（${since.slice(0, 4)}〜）` : '';
  return `${names}${sinceLabel}で通院中`;
}

function changePhrase(labResults: LabResultEntry[]): { text: string; evidence?: SummaryEvidence } {
  const abnormal = labResults.find((r) => r.flag !== 'normal' && r.previous);
  if (abnormal) {
    const arrow = abnormal.previous ? `${abnormal.previous}→${abnormal.result}` : abnormal.result;
    return {
      text: `${abnormal.item} ${arrow} と変化`,
      evidence: abnormal.reportedAt
        ? {
            date: abnormal.reportedAt.slice(0, 10),
            kind: 'lab',
            label: `${abnormal.item} ${abnormal.result} ↑`,
            blockRef: abnormal.reportedAt,
          }
        : undefined,
    };
  }
  return { text: '主要指標は概ね安定' };
}

function cautionPhrase(labResults: LabResultEntry[], alerts: AlertItem[]): string {
  const parts: string[] = [];
  const renal = labResults.find((r) => RENAL_HINT.test(r.item));
  if (renal) {
    const value = Number.parseFloat(renal.result.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(value) && value < 60) {
      parts.push(`eGFR ${value} — NSAIDs 慎重投与`);
    }
  }
  for (const alert of alerts) {
    parts.push(alert.label);
  }
  return parts.length > 0 ? parts.join(' ／ ') : '特記事項なし';
}

export function buildSummary(args: BuildSummaryArgs): SummaryContract {
  const managing = `${activeProblemPhrase(args.problems)}。`;
  const change = changePhrase(args.labResults);
  const changeText = `${change.text}。`;
  const today = args.todayReason ? `本日は${args.todayReason}。` : '本日の診察を記録中。';
  const caution = cautionPhrase(args.labResults, args.alerts);

  const evidence: SummaryEvidence[] = [];
  if (change.evidence) evidence.push(change.evidence);
  args.chartHistory.slice(0, 2).forEach((visit) => {
    evidence.push({ date: visit.date, kind: 'exam', label: `${visit.title || visit.summary.slice(0, 16)}`, blockRef: visit.date });
  });

  const oneLiner = `${activeProblemPhrase(args.problems)}。${change.text}${
    caution !== '特記事項なし' ? ` · ${caution}` : ''
  }`;

  const paragraphs = [
    `${managing}${changeText}`,
    `${today}注意点: ${caution}。`,
  ];

  const followUps = [
    change.evidence ? `${change.evidence.label.split(' ')[0]} の推移をグラフで` : '検査の推移をグラフで',
    caution.includes('eGFR') ? '腎機能はいつから低下？' : '直近の検査履歴',
    args.chartHistory[0] ? `${args.chartHistory[0].date} の受診内容` : '前回の受診内容',
    '関連する既往は？',
  ].slice(0, 4);

  return {
    oneLiner,
    paragraphs,
    briefing: { managing: managing.replace(/。$/, ''), change: change.text, today: today.replace(/^本日は|。$/g, ''), caution },
    evidence: evidence.slice(0, 3),
    followUps,
    generatedFrom: `直近${Math.max(1, args.chartHistory.length)}回の診察・検査から`,
    generatedAt: args.updatedAt,
    engine: 'rule',
  };
}
