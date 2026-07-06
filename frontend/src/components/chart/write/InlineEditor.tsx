import { useEffect, useMemo, useRef, useState } from 'react';
import type { LabResultEntry, VitalEntry } from '../../../types/workflow';
import { ActsColumn } from '../sheet/ActsColumn';
import type { BillingPreview, SheetAct, SoapText } from '../sheet/streamModel';
import { useAutosave } from '../hooks/useAutosave';
import { SlashMenu } from './SlashMenu';
import {
  buildAtItems,
  buildSlashItems,
  detectTrigger,
  type RecentEntry,
  type SlashItem,
} from './slashModel';

type FieldKey = keyof SoapText;

const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: 'subjective', label: 'S' },
  { key: 'objective', label: 'O' },
  { key: 'assessment', label: 'A' },
  { key: 'plan', label: 'P' },
];

const AI_DRAFTS: Record<FieldKey, string> = {
  subjective: '【下書き】主訴の経過を整理（AI生成・要確認）。',
  objective: '【下書き】身体所見の要約（AI生成・要確認）。',
  assessment: '【下書き】各プロブレムの評価（AI生成・要確認）。',
  plan: '【下書き】HbA1c上昇に対し食事・運動療法を再指導し、次回に血糖再検を計画（AI生成・要確認）。',
};

type InlineEditorProps = {
  dateLabel: string;
  meta: string;
  draft: SoapText;
  onDraftChange: (draft: SoapText) => void;
  acts: SheetAct[];
  billing: BillingPreview;
  recents: RecentEntry[];
  labResults: LabResultEntry[];
  vitals: VitalEntry[];
  autosaveLabel: string;
  onCompose: () => void;
  onRunRecent: (id: string) => void;
  onCopyPrevious: () => void;
  onApplyTemplate: () => void;
};

/** 本日ブロックのその場エディタ（画面遷移なし）。KARTE_UI_SPEC §5.1 */
export function InlineEditor({
  dateLabel,
  meta,
  draft,
  onDraftChange,
  acts,
  billing,
  recents,
  labResults,
  vitals,
  autosaveLabel,
  onCompose,
  onRunRecent,
  onCopyPrevious,
  onApplyTemplate,
}: InlineEditorProps) {
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [trigger, setTrigger] = useState<{ type: '/' | '@'; query: string; start: number; caret: number } | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [autosaved, setAutosaved] = useState(false);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLTextAreaElement>>>({});

  const draftText = `${draft.subjective}${draft.objective}${draft.assessment}${draft.plan}`;
  useAutosave(draftText, () => setAutosaved(true));

  const items: SlashItem[] = useMemo(() => {
    if (!trigger) return [];
    return trigger.type === '@'
      ? buildAtItems(trigger.query, labResults, vitals)
      : buildSlashItems(trigger.query, recents);
  }, [trigger, labResults, vitals, recents]);

  // クエリが変わったら候補ハイライトを先頭に戻す（意図的な依存）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset highlight on query change
  useEffect(() => {
    setMenuIndex(0);
  }, [trigger?.query, trigger?.type]);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const updateField = (key: FieldKey, value: string) => {
    onDraftChange({ ...draft, [key]: value });
    setAutosaved(false);
  };

  const syncTrigger = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart ?? el.value.length;
    const detected = detectTrigger(el.value, caret);
    setTrigger(detected ? { ...detected, caret } : null);
  };

  const closeMenu = () => setTrigger(null);

  const applyReplace = (key: FieldKey, start: number, caret: number, replacement: string) => {
    const el = fieldRefs.current[key];
    const value = draft[key];
    const next = value.slice(0, start) + replacement + value.slice(caret);
    updateField(key, next);
    closeMenu();
    requestAnimationFrame(() => {
      if (el) {
        const pos = start + replacement.length;
        el.focus();
        el.setSelectionRange(pos, pos);
        autoGrow(el);
      }
    });
  };

  const selectItem = (item: SlashItem, key: FieldKey) => {
    if (!trigger) return;
    const { start, caret } = trigger;
    switch (item.action.kind) {
      case 'insert':
        applyReplace(key, start, caret, item.action.text);
        break;
      case 'atInsert':
        applyReplace(key, start, caret, item.action.token);
        break;
      case 'aiDraft':
        applyReplace(key, start, caret, AI_DRAFTS[key]);
        break;
      case 'compose':
        applyReplace(key, start, caret, '');
        onCompose();
        break;
      case 'recent':
        applyReplace(key, start, caret, '');
        onRunRecent(item.action.runId);
        break;
    }
  };

  const handleKeyDown = (key: FieldKey, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger || items.length === 0) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMenuIndex((i) => Math.min(items.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(items[menuIndex], key);
      return;
    }
    // ①②③ 最近を即実行（query 空のとき 1–3）
    if (trigger.type === '/' && trigger.query === '' && /^[1-3]$/.test(e.key)) {
      const recent = items.find((it) => it.quickKey === ['①', '②', '③'][Number(e.key) - 1]);
      if (recent) {
        e.preventDefault();
        selectItem(recent, key);
      }
    }
  };

  const menuPosition = () => {
    if (!activeField) return { top: 0, left: 0 };
    const el = fieldRefs.current[activeField];
    if (!el) return { top: 0, left: 0 };
    return { top: el.offsetTop + el.offsetHeight + 4, left: el.offsetLeft };
  };

  return (
    <div className="relative flex w-full max-w-[884px] flex-col rounded-xl border border-border-strong bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
        <span className="text-[14px] font-bold text-text-primary tabular-nums">{dateLabel} 本日の記載</span>
        <span className="rounded-md bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-brand">編集中</span>
        <span className="text-[11.5px] text-text-tertiary">{meta}</span>
        <span className="flex-1" />
        <span className="text-[11px] text-text-tertiary tabular-nums">
          {autosaved ? autosaveLabel : '編集中…'}
        </span>
        <button type="button" onClick={onCopyPrevious} className="text-[12px] text-text-secondary hover:text-text-primary">
          前回複写
        </button>
        <button type="button" onClick={onApplyTemplate} className="text-[12px] text-text-secondary hover:text-text-primary">
          テンプレート
        </button>
      </div>

      <div className="relative grid grid-cols-[1fr_232px] gap-x-[18px] px-5 pb-[18px] pt-3.5">
        <div className="flex min-w-0 flex-col gap-2.5">
          {FIELDS.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-[22px_1fr] gap-2.5">
              <span className="mt-0.5 grid size-[22px] place-items-center rounded-md bg-muted text-[11.5px] font-bold text-text-secondary">
                {label}
              </span>
              <textarea
                ref={(el) => {
                  if (el) {
                    fieldRefs.current[key] = el;
                    autoGrow(el);
                  }
                }}
                value={draft[key]}
                rows={1}
                onFocus={() => setActiveField(key)}
                onSelect={(e) => syncTrigger(e.currentTarget)}
                onKeyUp={(e) => syncTrigger(e.currentTarget)}
                onKeyDown={(e) => handleKeyDown(key, e)}
                onChange={(e) => {
                  updateField(key, e.target.value);
                  autoGrow(e.target);
                  syncTrigger(e.target);
                }}
                placeholder={`${label} を入力… （／でコマンド・@でデータ）`}
                className="w-full resize-none bg-transparent text-[14.5px] leading-[1.75] text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
          ))}
        </div>
        <ActsColumn heading="行為・オーダー" acts={acts} billing={billing} onAdd={onCompose} />

        {trigger && items.length > 0 ? (
          <SlashMenu
            items={items}
            query={trigger.query}
            triggerType={trigger.type}
            activeIndex={menuIndex}
            position={menuPosition()}
            onHover={setMenuIndex}
            onSelect={(item) => activeField && selectItem(item, activeField)}
          />
        ) : null}
      </div>
    </div>
  );
}
