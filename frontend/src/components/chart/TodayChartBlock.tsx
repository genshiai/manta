import { useState } from 'react';
import { ClipboardCheck, Copy, FlaskConical, Pencil, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { SoapEditor, type SoapDraft } from './SoapEditor';
import { generateChartAiDraft } from '../../lib/api';
import type { ChartTemplate, ChartVersion, LabResultEntry, VitalEntry } from '../../types/workflow';

type TodayChartBlockProps = {
  draft: SoapDraft;
  patientId: string;
  authorName: string;
  department: string;
  vitals: VitalEntry[];
  labResults: LabResultEntry[];
  recentVersions: ChartVersion[];
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
    <section className="rounded-md border border-border bg-card px-4 py-3">
      <div className="mb-1.5 text-[12px] font-bold text-text-secondary">
        {label}
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-text-primary">{content}</p>
    </section>
  );

const buildLabLine = (labResults: LabResultEntry[]) =>
  labResults
    .filter((lab) => lab.flag === 'high')
    .slice(0, 4)
    .map((lab) => `${lab.item} ${lab.result}${lab.previous ? `（前回 ${lab.previous}）` : ''}`)
    .join('、');

const buildVitalLine = (vitals: VitalEntry[]) =>
  vitals
    .slice(0, 4)
    .map((vital) => `${vital.label} ${vital.value}${vital.unit}`)
    .join('、');

const buildAiContext = (
  draft: SoapDraft,
  vitals: VitalEntry[],
  labResults: LabResultEntry[],
  recentVersions: ChartVersion[],
) => {
  const currentDraft = [
    draft.subjective ? `S: ${draft.subjective}` : '',
    draft.objective ? `O: ${draft.objective}` : '',
    draft.assessment ? `A: ${draft.assessment}` : '',
    draft.plan ? `P: ${draft.plan}` : '',
  ].filter(Boolean);
  const vitalLine = buildVitalLine(vitals);
  const labLine = buildLabLine(labResults);
  const recent = [...recentVersions]
    .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
    .slice(0, 3)
    .map((version) => {
      const body = [version.assessment, version.plan].filter(Boolean).join(' / ');
      return `${version.savedAt} v${version.version}: ${body || version.objective || version.subjective}`;
    });

  return [
    '【現在の下書き】',
    currentDraft.length > 0 ? currentDraft.join('\n') : '未記載',
    vitalLine ? `\n【本日のバイタル】\n${vitalLine}` : '',
    labLine ? `\n【検査異常】\n${labLine}` : '',
    recent.length > 0 ? `\n【直近診療録】\n${recent.join('\n')}` : '',
  ].filter(Boolean).join('\n');
};

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
  patientId,
  authorName,
  department,
  vitals,
  labResults,
  recentVersions,
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
  const [editorOpen, setEditorOpen] = useState(empty);
  const [aiPrompt, setAiPrompt] = useState('');
  const aiContext = buildAiContext(draft, vitals, labResults, recentVersions);
  const applyAiMode = async (mode: 'soap' | 'labs' | 'plan') => {
    try {
      const generated = await generateChartAiDraft(patientId, {
        prompt: aiPrompt,
        context: aiContext,
        mode,
        currentDraft: draft,
      });
      onChange({
        subjective: generated.subjective,
        objective: generated.objective,
        assessment: generated.assessment,
        plan: generated.plan,
      });
      return;
    } catch {
      // Fall back to local draft generation when the API is unavailable.
    }
    const promptLine = aiPrompt.trim() ? `記載方針: ${aiPrompt.trim()}` : '';
    if (mode === 'soap') {
      onChange({
        subjective: draft.subjective || '症状変化、服薬状況、生活状況を確認。',
        objective: draft.objective || [buildVitalLine(vitals), buildLabLine(labResults)].filter(Boolean).join('\n'),
        assessment: draft.assessment || [promptLine, '現状は大きな悪化なし。検査値と症状経過を踏まえて治療継続可否を評価。'].filter(Boolean).join('\n'),
        plan: draft.plan || '内服継続。必要な検査を確認し、次回までの自己管理を説明。',
      });
      return;
    }
    if (mode === 'labs') {
      const labLine = buildLabLine(labResults);
      if (!labLine) return;
      const current = draft.objective.trimEnd();
      onChange({ ...draft, objective: current ? `${current}\n${labLine}` : labLine });
      return;
    }
    const current = draft.plan.trimEnd();
    const nextPlan = [promptLine, '次回までの観察項目、検査予定、処方継続可否を確認。必要時は患者説明を追加。'].filter(Boolean).join('\n');
    onChange({ ...draft, plan: current ? `${current}\n${nextPlan}` : nextPlan });
  };

  return (
    <article className="scroll-mt-20 border-b border-border bg-surface-page py-6">
      <header className="mb-5 flex items-baseline gap-3">
        <h3 className="text-[20px] font-bold leading-snug text-text-primary">
          {today()} ・ 本日
        </h3>
        <span className="text-[12px] font-medium text-brand">記載中</span>
        <span className="text-[12px] text-text-tertiary">
          {department} ・ 記載者 {authorName}
        </span>
        <div className="ml-auto">
          <Button variant="outline" size="xs" onClick={() => setEditorOpen(true)}>
            <Pencil size={14} />
            記載を開く
          </Button>
        </div>
      </header>

      {empty ? (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="block w-full rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center text-[14px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand-tint"
        >
          本日の診療録を記載
        </button>
      ) : (
        <button type="button" onClick={() => setEditorOpen(true)} className="block w-full rounded-lg text-left">
          <div className="grid gap-3">
            <SoapPreview label="S 主訴・自覚症状" content={draft.subjective} />
            <SoapPreview label="O 所見・バイタル・検査" content={draft.objective} />
            <SoapPreview label="A アセスメント" content={draft.assessment} />
            <SoapPreview label="P プラン" content={draft.plan} />
          </div>
          <div className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-brand">
            <Pencil size={12} />
            記載モーダルで編集
          </div>
        </button>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="h-[calc(100vh-2rem)] max-h-none max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border-border bg-surface-page p-0 shadow-2xl sm:max-w-[1280px]">
          <DialogHeader className="border-b border-border bg-card px-6 py-3">
            <div className="flex flex-wrap items-center gap-3 pr-8">
              <DialogTitle className="text-[18px] font-bold">{today()} ・ 診療録記載</DialogTitle>
              <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[12px] font-bold text-text-secondary">
                {department} ・ {authorName}
              </span>
              <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[12px] font-bold text-text-secondary">
                {isDirty ? '未保存' : '保存済み'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="xs" onClick={onCopyPrevious} disabled={isMutating}>
                  <Copy size={13} />
                  前回複写
                </Button>
                <Button variant="outline" size="xs" onClick={() => applyAiMode('soap')}>
                  <Sparkles size={13} />
                  AI下書き
                </Button>
                <Button size="xs" onClick={() => setEditorOpen(false)}>
                  閉じる
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="grid h-[calc(100vh-5.5rem)] min-h-0 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <SoapEditor
                draft={draft}
                vitals={vitals}
                labResults={labResults}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                isMutating={isMutating}
                onChange={onChange}
                onSelectTemplate={onSelectTemplate}
                onApplyTemplate={onApplyTemplate}
                onCopyPrevious={onCopyPrevious}
              />
            </div>
            <aside className="min-h-0 overflow-y-auto border-t border-border bg-card px-4 py-5 lg:border-l lg:border-t-0">
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-grid size-8 place-items-center rounded-full bg-brand-tint text-brand">
                  <Sparkles size={16} />
                </span>
                <div>
                  <h4 className="text-[15px] font-bold text-text-primary">補助</h4>
                  <p className="text-[12px] text-text-tertiary">AI・検査・テンプレート</p>
                </div>
              </div>
              <label className="mb-3 block">
                <span className="mb-1.5 block text-[12px] font-bold text-text-primary">AIへの指示</span>
                <Textarea
                  value={aiPrompt}
                  onChange={(event) => setAiPrompt(event.target.value)}
                  rows={4}
                  className="resize-y border-border bg-surface-page text-[13px] leading-normal"
                  placeholder="例: 糖尿病教育入院の退院前評価として、患者説明と次回採血方針を厚めに書く"
                />
              </label>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => applyAiMode('soap')}
                  className="w-full rounded-lg border border-border bg-white px-3 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary">
                    <Sparkles size={14} className="text-brand" />
                    SOAP下書き
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyAiMode('labs')}
                  className="w-full rounded-lg border border-border bg-white px-3 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary">
                    <FlaskConical size={14} className="text-success" />
                    検査異常をOへ反映
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => applyAiMode('plan')}
                  className="w-full rounded-lg border border-border bg-white px-3 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint"
                >
                  <span className="flex items-center gap-2 text-[13px] font-bold text-text-primary">
                    <ClipboardCheck size={14} className="text-warning" />
                    次の一手をPへ追加
                  </span>
                </button>
              </div>
              <details className="mt-4 rounded-lg border border-border bg-surface-subtle p-3">
                <summary className="cursor-pointer list-none text-[12px] font-bold text-text-primary">
                  AIに渡す前提
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-[11px] leading-normal text-text-secondary">
                  {aiContext}
                </pre>
              </details>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
};
