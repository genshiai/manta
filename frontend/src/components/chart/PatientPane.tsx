import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import type { PatientRecord } from '../../data/chartMock';
import type { PatientProfileEntry, ProblemListItem, VisitHistoryEntry } from '../../types/workflow';

type PatientPaneProps = {
  patient: PatientRecord;
  profile: Array<PatientProfileEntry & { id: string }>;
  problems: Array<ProblemListItem & { id: string }>;
  visitHistory: VisitHistoryEntry[];
};

type SubTab = 'basic' | 'problems' | 'visits';

const problemStatusDot = (status: string) => {
  if (status === 'active') return 'bg-warning';
  if (status === 'resolved') return 'bg-success';
  return 'bg-surface-muted';
};

const problemStatusLabel = (status: string) => {
  if (status === 'active') return '継続中';
  if (status === 'resolved') return '寛解';
  return status;
};

/**
 * 左ペイン (WHO・不変情報)
 *
 * タブで「基本 / 問題リスト / 受診歴」を切替（カテゴリ排他なのでタブ OK）。
 * デフォルトは「基本」。各タブの中身はペイン全体のスクロール内で完結する。
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 2.1
 */
export const PatientPane = ({ patient, profile, problems, visitHistory }: PatientPaneProps) => {
  const [tab, setTab] = useState<SubTab>('basic');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="flex h-full min-h-0 flex-col">
        <div className="flex-shrink-0 border-b border-border px-3 pt-3">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">基本</TabsTrigger>
            <TabsTrigger value="problems">問題</TabsTrigger>
            <TabsTrigger value="visits">受診歴</TabsTrigger>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="basic" className="m-0 p-4">
            <div className="space-y-4">
              <section className="space-y-3">
                <div>
                  <p className="text-[18px] font-bold leading-snug text-text-primary">{patient.name}</p>
                  <p className="text-[13px] text-text-tertiary">
                    {patient.age} {patient.sex} ・ ID: {patient.id}
                  </p>
                </div>
                {patient.alerts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {patient.alerts.map((alert) => (
                      <span
                        key={alert.label}
                        className="rounded-md bg-destructive/10 px-2 py-0.5 text-[12px] font-medium text-destructive"
                      >
                        {alert.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="space-y-2 border-t border-border pt-3">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                  プロファイル
                </h3>
                <dl className="space-y-1.5">
                  {profile.length > 0 ? (
                    profile.map((entry) => (
                      <div key={entry.id} className="flex items-start justify-between gap-2">
                        <dt className="text-[12px] text-text-tertiary">{entry.label}</dt>
                        <dd className="text-right text-[13px] text-text-primary">{entry.value}</dd>
                      </div>
                    ))
                  ) : (
                    <p className="text-[13px] text-text-tertiary">プロファイル未登録</p>
                  )}
                </dl>
              </section>

              <section className="space-y-2 border-t border-border pt-3">
                <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                  受診情報
                </h3>
                <dl className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-[12px] text-text-tertiary">診療科</dt>
                    <dd className="text-right text-[13px] text-text-primary">{patient.department}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <dt className="text-[12px] text-text-tertiary">主治医</dt>
                    <dd className="text-right text-[13px] text-text-primary">{patient.doctor}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </TabsContent>

          <TabsContent value="problems" className="m-0 p-4">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
              プロブレムリスト
            </h3>
            <ul className="mt-3 space-y-2">
              {problems.length > 0 ? (
                problems.map((problem) => (
                  <li
                    key={problem.id}
                    className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span className={`mt-1.5 h-2 w-2 rounded-full ${problemStatusDot(problem.status)}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold leading-snug text-text-primary">{problem.name}</p>
                      <p className="text-[12px] text-text-tertiary">{problem.since}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="text-[11px] text-text-tertiary">
                          {problemStatusLabel(problem.status)}
                        </span>
                        {problem.icd10Code ? (
                          <span className="text-[11px] text-text-tertiary">・ ICD10 {problem.icd10Code}</span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-text-tertiary">
                  プロブレム未登録
                </li>
              )}
            </ul>
          </TabsContent>

          <TabsContent value="visits" className="m-0 p-4">
            <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
              受診歴
            </h3>
            <ul className="mt-3 space-y-2">
              {visitHistory.length > 0 ? (
                visitHistory.map((visit) => (
                  <li
                    key={`${visit.date}-${visit.summary}`}
                    className="rounded-md border border-border bg-card px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-text-primary">{visit.date}</span>
                      <span className="text-[11px] text-text-tertiary">{visit.department}</span>
                    </div>
                    <p className="mt-1 text-[12px] leading-normal text-text-secondary">{visit.summary}</p>
                  </li>
                ))
              ) : (
                <li className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[13px] text-text-tertiary">
                  受診歴なし
                </li>
              )}
            </ul>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
