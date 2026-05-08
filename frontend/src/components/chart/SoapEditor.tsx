import { Copy, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import type { ChartTemplate, VitalEntry } from '../../types/workflow';

export type SoapDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type SoapEditorProps = {
  draft: SoapDraft;
  vitals: VitalEntry[];
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

/**
 * SOAP 入力フォーム (Notion 風タイポ駆動)
 * - セクションは 4 列縦積み (S→O→A→P)。1 セクション 1 行ずつ強調
 * - chrome を最小化、テンプレ・前回複写は上端の小さな text ボタン
 */
export const SoapEditor = ({
  draft,
  vitals,
  templates,
  selectedTemplateId,
  isMutating,
  onChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
}: SoapEditorProps) => {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);

  return (
  <div className="space-y-5">
    {/* テンプレ・複写ツールバー (chrome 最小) */}
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      {templates.length > 0 ? (
        <select
          value={selectedTemplateId}
          onChange={(e) => onSelectTemplate(e.target.value)}
          className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        onClick={onApplyTemplate}
        disabled={isMutating || !selectedTemplateId}
      >
        <FileText size={12} />
        テンプレ挿入
      </Button>
      <Button variant="ghost" size="xs" onClick={onCopyPrevious} disabled={isMutating}>
        <Copy size={12} />
        前回複写
      </Button>
      {selectedTemplate ? (
        <div className="basis-full rounded-md border border-border bg-surface-subtle px-3 py-2 text-[12px] text-text-secondary">
          <p className="font-bold text-text-primary">{selectedTemplate.label}</p>
          <p className="mt-1 line-clamp-2">
            {[selectedTemplate.subjective, selectedTemplate.assessment, selectedTemplate.plan].filter(Boolean).join(' / ')}
          </p>
        </div>
      ) : null}
    </div>

    {/* バイタル */}
    {vitals.length > 0 ? (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          バイタル
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
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

    {/* SOAP セクション */}
    <div className="space-y-4">
      {sections.map((s) => (
        <div key={s.key}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
              {s.label}
            </span>
            <span className="text-[11px] text-text-tertiary">{s.description}</span>
          </div>
          <Textarea
            value={draft[s.key]}
            onChange={(e) => onChange({ ...draft, [s.key]: e.target.value })}
            rows={s.key === 'subjective' ? 2 : 3}
            className="resize-y border-border text-[14px] leading-[1.7]"
            placeholder={`${s.description} を記入...`}
          />
        </div>
      ))}
    </div>
  </div>
  );
};
