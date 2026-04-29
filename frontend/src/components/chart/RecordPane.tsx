import { useMemo, useState } from 'react';
import { PastChartItem } from './PastChartItem';
import { TodayChartBlock } from './TodayChartBlock';
import type { SoapDraft } from './SoapEditor';
import type {
  ChartHistoryEntry,
  ChartTemplate,
  ChartVersion,
  LabResultEntry,
  PrescriptionTimelineEntry,
  PrescriptionTimelineGroup,
  VitalEntry,
} from '../../types/workflow';

type RecordPaneProps = {
  draft: SoapDraft;
  isDirty: boolean;
  vitals: VitalEntry[];
  templates: ChartTemplate[];
  selectedTemplateId: string;
  isMutating: boolean;
  versions: ChartVersion[];
  chartHistory: ChartHistoryEntry[];
  prescriptionTimeline: PrescriptionTimelineGroup[];
  labResults: LabResultEntry[];
  workspaceError: string | null;
  isLoading: boolean;
  onDraftChange: (next: SoapDraft) => void;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: () => void;
  onCopyPrevious: () => void;
};

const DEPT_ALL = 'all';

const versionDate = (savedAt: string): string => {
  if (!savedAt) return '';
  if (savedAt.includes('T')) return savedAt.split('T')[0];
  return savedAt.split(' ')[0] ?? savedAt;
};

const normalizeDate = (date: string): string => date.replaceAll('-', '/');

/**
 * 中央ペイン (WHAT・記録)
 *
 * 構造 (上から):
 * - sticky ヘッダー: タイトル + 科フィルタ
 * - スクロール本体:
 *   - 本日のカルテブロック (TodayChartBlock; 編集 / 表示モード切替)
 *   - 過去のカルテブロック (PastChartItem; SOAP + 処方 + 検査)
 *
 * 設計指針: frontend/CHART-DESIGN.md / memory: feedback_chart_block_view
 */
export const RecordPane = ({
  draft,
  isDirty,
  vitals,
  templates,
  selectedTemplateId,
  isMutating,
  versions,
  chartHistory,
  prescriptionTimeline,
  labResults,
  workspaceError,
  isLoading,
  onDraftChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
}: RecordPaneProps) => {
  const [departmentFilter, setDepartmentFilter] = useState<string>(DEPT_ALL);

  // 科一覧 (受診履歴から)
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const h of chartHistory) if (h.department) set.add(h.department);
    return Array.from(set).sort();
  }, [chartHistory]);

  // 受診日 → 科 / 処方 / 検査 のマップ
  const visitByDate = useMemo(() => {
    const map = new Map<string, ChartHistoryEntry>();
    for (const h of chartHistory) map.set(normalizeDate(h.date), h);
    return map;
  }, [chartHistory]);

  const prescriptionsByDate = useMemo(() => {
    const map = new Map<string, PrescriptionTimelineEntry[]>();
    for (const g of prescriptionTimeline) {
      if (g.isToday) continue;
      const key = normalizeDate(g.date);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, ...g.items]);
    }
    return map;
  }, [prescriptionTimeline]);

  // 過去版を新しい順にソート + フィルタ
  const filteredVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    if (departmentFilter === DEPT_ALL) return sorted;
    return sorted.filter((v) => {
      const visit = visitByDate.get(versionDate(v.savedAt));
      return visit?.department === departmentFilter;
    });
  }, [versions, visitByDate, departmentFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-page">
      {/* sticky ヘッダー */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-8 py-3">
        <h2 className="text-[15px] font-bold leading-snug text-text-primary">カルテ</h2>
        <div className="flex items-center gap-2">
          {departments.length > 0 ? (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value={DEPT_ALL}>全科</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-[12px] text-text-tertiary">
            {filteredVersions.length > 0 ? `${filteredVersions.length}件の記録` : ''}
          </span>
        </div>
      </div>

      {/* スクロール本体 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8">
          {workspaceError ? (
            <p className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {workspaceError}
            </p>
          ) : null}

          {/* 本日のカルテ */}
          <TodayChartBlock
            draft={draft}
            vitals={vitals}
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            isMutating={isMutating}
            isDirty={isDirty}
            onChange={onDraftChange}
            onSelectTemplate={onSelectTemplate}
            onApplyTemplate={onApplyTemplate}
            onCopyPrevious={onCopyPrevious}
          />

          {/* 過去のカルテ */}
          {isLoading && filteredVersions.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-text-tertiary">読み込み中…</div>
          ) : filteredVersions.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-text-tertiary">
              {departmentFilter === DEPT_ALL ? '過去のカルテはまだありません' : `「${departmentFilter}」の記録はありません`}
            </div>
          ) : (
            filteredVersions.map((v, idx) => {
              const visit = visitByDate.get(versionDate(v.savedAt));
              return (
                <PastChartItem
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only versioned list, idx + savedAt is stable
                  key={`${v.savedAt}-${v.version}-${idx}`}
                  version={v}
                  visit={visit ? { department: visit.department, title: visit.title } : undefined}
                  prescriptions={prescriptionsByDate.get(versionDate(v.savedAt))}
                  labResults={idx === 0 ? labResults : undefined}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
