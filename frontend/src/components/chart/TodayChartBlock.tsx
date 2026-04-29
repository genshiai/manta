import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { Button } from '../ui/button';
import { SoapEditor, type SoapDraft } from './SoapEditor';
import type { ChartTemplate, VitalEntry } from '../../types/workflow';

type TodayChartBlockProps = {
  draft: SoapDraft;
  vitals: VitalEntry[];
  templates: ChartTemplate[];
  selectedTemplateId: string;
  isMutating: boolean;
  isDirty: boolean;
  onChange: (next: SoapDraft) => void;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: () => void;
  onCopyPrevious: () => void;
};

const isDraftEmpty = (draft: SoapDraft): boolean =>
  !draft.subjective.trim() &&
  !draft.objective.trim() &&
  !draft.assessment.trim() &&
  !draft.plan.trim();

const today = (): string => {
  const d = new Date();
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${dow}）`;
};

const SoapPreview = ({ label, content }: { label: string; content: string }) =>
  content.trim().length === 0 ? null : (
    <section className="mt-4 first:mt-0">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
        {label}
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-text-primary">{content}</p>
    </section>
  );

/**
 * 本日のカルテブロック (タイムライン最上部)
 *
 * View-first UX:
 * - 空 (記述なし) のときは「✏ 記載する」ボタンが目立つプレースホルダ
 * - 記述ありの view モード: SOAP プレビュー + 「編集」ボタン
 * - edit モード: SoapEditor (フル編集 UI)
 *
 * カルテは閲覧時間が大半を占めるので、デフォルトで巨大な入力欄を見せない設計。
 * 設計指針: feedback_chart_block_view
 */
export const TodayChartBlock = ({
  draft,
  vitals,
  templates,
  selectedTemplateId,
  isMutating,
  isDirty,
  onChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
}: TodayChartBlockProps) => {
  const empty = isDraftEmpty(draft);
  // 空のときは編集モード優先、内容ありかつ未保存ありなら編集継続、保存済みなら view
  const [forceEdit, setForceEdit] = useState<boolean | null>(null);
  const editMode = forceEdit ?? (empty || isDirty);

  return (
    <article className="border-b border-border bg-brand-tint/40 py-8">
      <header className="mb-5 flex items-baseline gap-3">
        <h3 className="text-[20px] font-bold leading-snug text-text-primary">
          {today()} ・ 本日
        </h3>
        <span className="text-[12px] font-medium text-brand">記載中</span>
        <div className="ml-auto">
          {editMode ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setForceEdit(false)}
              disabled={empty}
            >
              <ChevronUp size={14} />
              閉じる
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => setForceEdit(true)}>
              <Pencil size={14} />
              編集
            </Button>
          )}
        </div>
      </header>

      {editMode ? (
        <SoapEditor
          draft={draft}
          vitals={vitals}
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          isMutating={isMutating}
          onChange={onChange}
          onSelectTemplate={onSelectTemplate}
          onApplyTemplate={onApplyTemplate}
          onCopyPrevious={onCopyPrevious}
        />
      ) : (
        <button
          type="button"
          onClick={() => setForceEdit(true)}
          className="block w-full rounded-lg text-left transition-colors hover:bg-card/40"
        >
          <SoapPreview label="S 主訴・自覚症状" content={draft.subjective} />
          <SoapPreview label="O 所見・バイタル・検査" content={draft.objective} />
          <SoapPreview label="A アセスメント" content={draft.assessment} />
          <SoapPreview label="P プラン" content={draft.plan} />
          <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-text-tertiary">
            <ChevronDown size={12} />
            クリックして編集
          </div>
        </button>
      )}
    </article>
  );
};
