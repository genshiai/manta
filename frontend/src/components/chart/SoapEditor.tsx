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
 * 今日の SOAP 入力フォーム。RecordPane の sticky 上端で常時表示。
 * テンプレート挿入・前回複写ボタンを内蔵。
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
}: SoapEditorProps) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[18px] font-bold leading-snug text-text-primary">本日の記載</h2>
      <div className="flex items-center gap-2">
        {templates.length > 0 ? (
          <select
            value={selectedTemplateId}
            onChange={(e) => onSelectTemplate(e.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={onApplyTemplate}
          disabled={isMutating || !selectedTemplateId}
        >
          <FileText size={14} />
          挿入
        </Button>
        <Button variant="outline" size="sm" onClick={onCopyPrevious} disabled={isMutating}>
          <Copy size={14} />
          前回複写
        </Button>
      </div>
    </div>

    {vitals.length > 0 ? (
      <div className="grid grid-cols-2 gap-2 rounded-md bg-surface-subtle p-3 md:grid-cols-4">
        {vitals.map((v) => (
          <div key={v.label} className="flex flex-col">
            <span className="text-[11px] text-text-tertiary">{v.label}</span>
            <span className="text-[14px] font-bold text-text-primary">
              {v.value}
              <span className="ml-1 text-[11px] font-normal text-text-tertiary">{v.unit}</span>
            </span>
          </div>
        ))}
      </div>
    ) : null}

    <div className="grid gap-3 md:grid-cols-2">
      {sections.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-brand text-[11px] font-bold text-white">
              {s.label}
            </span>
            <span className="text-[12px] font-medium text-text-secondary">{s.description}</span>
          </div>
          <Textarea
            value={draft[s.key]}
            onChange={(e) => onChange({ ...draft, [s.key]: e.target.value })}
            rows={4}
            className="resize-y"
            placeholder={s.description}
          />
        </div>
      ))}
    </div>
  </div>
);
