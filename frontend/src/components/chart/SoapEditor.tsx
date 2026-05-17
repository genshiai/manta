import { Copy, FileText, FlaskConical } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { ChartTemplate, LabResultEntry, VitalEntry } from '../../types/workflow';

export type SoapDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type SoapEditorProps = {
  draft: SoapDraft;
  vitals: VitalEntry[];
  labResults: LabResultEntry[];
  templates: ChartTemplate[];
  selectedTemplateId: string;
  isMutating: boolean;
  onChange: (next: SoapDraft) => void;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: () => void;
  onCopyPrevious: () => void;
};

const sections: Array<{ key: keyof SoapDraft; label: string; description: string }> = [
  { key: 'subjective', label: 'S', description: '主訴・自覚症状' },
  { key: 'objective', label: 'O', description: '所見・バイタル・検査' },
  { key: 'assessment', label: 'A', description: 'アセスメント' },
  { key: 'plan', label: 'P', description: 'プラン・指示' },
];

const parseLabBaselineRange = (baseline?: string) => {
  if (!baseline) return null;
  const numbers = baseline.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (baseline.endsWith('-') && numbers.length === 1) return { min: numbers[0], max: null };
  return null;
};

const labValueTone = (
  value: string,
  baseline?: string,
  flag?: 'high' | 'normal',
): 'high' | 'low' | 'normal' => {
  const numericValue = Number(value.match(/-?\d+(?:\.\d+)?/)?.[0]);
  const range = parseLabBaselineRange(baseline);
  if (Number.isFinite(numericValue) && range) {
    if (numericValue < range.min) return 'low';
    if (range.max !== null && numericValue > range.max) return 'high';
  }
  return flag === 'high' ? 'high' : 'normal';
};

const labToneClassName = (tone: 'high' | 'low' | 'normal') => {
  if (tone === 'high') return 'border-red-200 text-destructive';
  if (tone === 'low') return 'border-blue-200 text-blue-700';
  return 'border-border text-text-primary';
};

/**
 * SOAP 入力フォーム (Notion 風タイポ駆動)
 * - セクションは 4 列縦積み (S→O→A→P)。1 セクション 1 行ずつ強調
 * - chrome を最小化、テンプレ・前回複写は上端の小さな text ボタン
 */
export const SoapEditor = ({
  draft,
  vitals,
  labResults,
  templates,
  selectedTemplateId,
  isMutating,
  onChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
}: SoapEditorProps) => {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const abnormalLabs = labResults.filter((lab) => labValueTone(lab.result, lab.baseline, lab.flag) !== 'normal');
  const labSnippets = (abnormalLabs.length > 0 ? abnormalLabs : labResults).slice(0, 8);
  const appendObjective = (snippet: string) => {
    const current = draft.objective.trimEnd();
    onChange({ ...draft, objective: current ? `${current}\n${snippet}` : snippet });
  };

  return (
  <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-[12px]">
      <Button variant="ghost" size="xs" onClick={onCopyPrevious} disabled={isMutating}>
        <Copy size={12} />
        前回複写
      </Button>
      {templates.length > 0 ? (
        <details className="group">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-full px-3.5 text-[13px] font-bold text-text-secondary transition-colors hover:bg-surface-subtle hover:text-text-primary">
            <FileText size={12} />
            テンプレート
          </summary>
          <div className="mt-2 w-[min(520px,80vw)] rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedTemplateId}
                onChange={(e) => onSelectTemplate(e.target.value)}
                className="h-8 min-w-52 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="xs"
                onClick={onApplyTemplate}
                disabled={isMutating || !selectedTemplateId}
              >
                挿入
              </Button>
            </div>
            {selectedTemplate ? (
              <p className="mt-2 line-clamp-2 text-[12px] text-text-secondary">
                {[selectedTemplate.subjective, selectedTemplate.assessment, selectedTemplate.plan].filter(Boolean).join(' / ')}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      {vitals.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
            バイタル
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {vitals.map((v) => (
              <div key={v.label}>
                <div className="text-[11px] text-text-tertiary">{v.label}</div>
                <div className="text-[15px] font-bold tabular-nums text-text-primary">
                  {v.value}
                  <span className="ml-1 text-[11px] font-normal text-text-tertiary">{v.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {labSnippets.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
            <FlaskConical size={13} className="text-brand" />
            検査値をOへ貼付
          </div>
          <div className="flex flex-wrap gap-2">
            {labSnippets.map((lab) => {
              const tone = labValueTone(lab.result, lab.baseline, lab.flag);
              const snippet = `${lab.item} ${lab.result}${lab.previous ? `（前回 ${lab.previous}）` : ''}`;
              return (
                <button
                  key={`${lab.item}-${lab.reportedAt ?? lab.result}`}
                  type="button"
                  onClick={() => appendObjective(snippet)}
                  className={`rounded-full border bg-card px-2.5 py-1 text-[12px] font-medium transition-colors hover:border-brand hover:text-brand ${labToneClassName(tone)}`}
                >
                  {lab.item} {lab.result}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>

    {/* SOAP セクション */}
    <div className="grid gap-4 xl:grid-cols-2">
      {sections.map((s) => (
        <div key={s.key} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-[16px] font-bold text-brand">
              {s.label}
            </span>
            <span className="text-[13px] font-bold text-text-secondary">{s.description}</span>
          </div>
          <Textarea
            value={draft[s.key]}
            onChange={(e) => onChange({ ...draft, [s.key]: e.target.value })}
            rows={s.key === 'subjective' ? 6 : 8}
            className="min-h-40 resize-y border-border bg-surface-page text-[15px] leading-[1.8]"
            placeholder={`${s.description} を記入...`}
          />
        </div>
      ))}
    </div>
  </div>
  );
};
