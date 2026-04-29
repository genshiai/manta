import { PastChartItem } from './PastChartItem';
import { SoapEditor, type SoapDraft } from './SoapEditor';
import type {
  ChartHistoryEntry,
  ChartTemplate,
  LabResultEntry,
  PrescriptionTimelineGroup,
  VitalEntry,
} from '../../types/workflow';

type RecordPaneProps = {
  draft: SoapDraft;
  vitals: VitalEntry[];
  templates: ChartTemplate[];
  selectedTemplateId: string;
  isMutating: boolean;
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

/**
 * 中央ペイン (WHAT・記録)
 *
 * - 上端 sticky: 今日の SOAP 入力フォーム + バイタル
 * - スクロール: 過去カルテのタイムライン (連続スクロール)
 * - chart/history タブ廃止 (時系列はスクロールで見せる)
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 2.2
 */
export const RecordPane = ({
  draft,
  vitals,
  templates,
  selectedTemplateId,
  isMutating,
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
  // 過去カルテ各件にひも付く処方を日付一致で抽出
  const prescriptionsByDate = new Map<string, PrescriptionTimelineGroup[]>();
  for (const group of prescriptionTimeline) {
    if (group.isToday) continue;
    const existing = prescriptionsByDate.get(group.date) ?? [];
    existing.push(group);
    prescriptionsByDate.set(group.date, existing);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* sticky 上部: SOAP 入力 */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <SoapEditor
          draft={draft}
          vitals={vitals}
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          isMutating={isMutating}
          onChange={onDraftChange}
          onSelectTemplate={onSelectTemplate}
          onApplyTemplate={onApplyTemplate}
          onCopyPrevious={onCopyPrevious}
        />
      </div>

      {/* スクロール: 過去カルテのタイムライン */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {workspaceError ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {workspaceError}
          </p>
        ) : null}

        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[18px] font-bold leading-snug text-text-primary">過去カルテ</h2>
          <span className="text-[12px] text-text-tertiary">
            {chartHistory.length > 0 ? `${chartHistory.length}件` : ''}
          </span>
        </div>

        {isLoading && chartHistory.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-text-tertiary">
            読み込み中…
          </div>
        ) : chartHistory.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-text-tertiary">
            過去カルテはまだありません
          </div>
        ) : (
          <div>
            {chartHistory.map((entry, idx) => (
              <PastChartItem
                // biome-ignore lint/suspicious/noArrayIndexKey: chart history is append-only and indexed by date, idx is stable
                key={`${entry.date}-${entry.title}-${idx}`}
                entry={entry}
                prescriptions={prescriptionsByDate.get(entry.date)}
                labResults={idx === 0 ? labResults : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
