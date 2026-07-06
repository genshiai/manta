import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PatientRecord } from '../../../data/chartMock';
import {
  readPrescriptionSignals,
  recordPrescriptionSignal,
} from '../../../lib/prescriptionSignals';
import type {
  ChartOrderConfig,
  ImagingOrderEntry,
  LabResultEntry,
  PrescriptionSetItem,
  PrescriptionTimelineGroup,
  ProcedureOrderEntry,
} from '../../../types/workflow';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';
import { computeDrugSafety, type OrderHit, searchOrders } from './orderSearch';

type HistoryItem = {
  no: number;
  group: 'patient' | 'self';
  label: string;
  tail: string;
  run: () => void;
};

type OrderComposerProps = {
  open: boolean;
  onClose: () => void;
  orderConfig: ChartOrderConfig;
  patient: PatientRecord;
  currentUserId: string;
  labResults: LabResultEntry[];
  activeProblemNames: string[];
  prescriptionTimeline: PrescriptionTimelineGroup[];
  isMutating: boolean;
  onAddPrescription: (drugId: string, dosage: string, days: string) => void;
  onAddPrescriptionsBatch: (items: PrescriptionSetItem[]) => void;
  onAddLab: (setId: string, urgency: '通常' | '至急') => void;
  onAddImaging: (entry: ImagingOrderEntry) => void;
  onAddProcedure: (entry: ProcedureOrderEntry) => void;
  onCopyPrevious: () => void;
  onAddDiagnosis: (name: string, icd10?: string) => void;
};

/** ⌘O オーダーコンポーザ。背景のカルテが透け、キーボードで完結、確定は行為列に着地。KARTE_UI_SPEC §6 */
export function OrderComposer({
  open,
  onClose,
  orderConfig,
  patient,
  currentUserId,
  labResults,
  activeProblemNames,
  prescriptionTimeline,
  isMutating,
  onAddPrescription,
  onAddPrescriptionsBatch,
  onAddLab,
  onAddImaging,
  onAddProcedure,
  onCopyPrevious,
  onAddDiagnosis,
}: OrderComposerProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dosageIndex, setDosageIndex] = useState(0);
  const [days, setDays] = useState('28日分');
  const [addDiagnosis, setAddDiagnosis] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => searchOrders(query, orderConfig), [query, orderConfig]);
  const activeHit = hits[activeIndex] ?? hits[0];

  // reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setAddDiagnosis(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 選択が薬剤なら用法/日数を初期化 + 選択シグナル記録
  useEffect(() => {
    if (activeHit?.kind === 'drug') {
      setDosageIndex(0);
      setDays(activeHit.drug.defaultDays ?? '28日分');
      recordPrescriptionSignal(currentUserId, activeHit.drug.id, 'selected');
    }
  }, [activeHit, currentUserId]);

  const history = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [];
    let no = 1;
    // この患者
    const copyable = prescriptionTimeline.find((g) => g.copyable && !g.isToday);
    if (copyable) {
      items.push({
        no: no++,
        group: 'patient',
        label: `前回Do処方（${copyable.itemCount}剤）`,
        tail: `前回 ${copyable.label}`,
        run: () => {
          onCopyPrevious();
          onClose();
        },
      });
    }
    const labSet = orderConfig.labSetOptions[0];
    if (labSet) {
      items.push({
        no: no++,
        group: 'patient',
        label: labSet.label,
        tail: `${labSet.items.length}項目`,
        run: () => {
          onAddLab(labSet.id, '通常');
          onClose();
        },
      });
    }
    const rxSet = orderConfig.prescriptionSets[0];
    if (rxSet) {
      items.push({
        no: no++,
        group: 'patient',
        label: rxSet.label,
        tail: `${rxSet.items.length}剤`,
        run: () => {
          onAddPrescriptionsBatch(rxSet.items);
          onClose();
        },
      });
    }
    // 自分（全患者）— 使用頻度シグナルから
    const signals = readPrescriptionSignals(currentUserId);
    const topDrugs = Object.entries(signals)
      .sort((a, b) => b[1].prescribedCount - a[1].prescribedCount)
      .slice(0, 6 - items.length);
    for (const [drugId, sig] of topDrugs) {
      if (sig.prescribedCount === 0) continue;
      const drug = orderConfig.prescriptionCatalog.find((d) => d.id === drugId);
      if (!drug) continue;
      items.push({
        no: no++,
        group: 'self',
        label: `${drug.drugName} ${drug.dosageOptions[0] ?? ''}`.trim(),
        tail: `×${sig.prescribedCount}回`,
        run: () => {
          onAddPrescription(drug.id, drug.dosageOptions[0] ?? '', drug.defaultDays ?? '28日分');
          onClose();
        },
      });
    }
    return items.slice(0, 6);
  }, [
    orderConfig,
    prescriptionTimeline,
    currentUserId,
    onCopyPrevious,
    onClose,
    onAddLab,
    onAddPrescriptionsBatch,
    onAddPrescription,
  ]);

  const safety = useMemo(() => {
    if (activeHit?.kind !== 'drug') return null;
    return computeDrugSafety(activeHit.drug, patient, labResults, activeProblemNames);
  }, [activeHit, patient, labResults, activeProblemNames]);

  if (!open) return null;

  const confirmActive = (keepOpen: boolean) => {
    if (!activeHit) return;
    switch (activeHit.kind) {
      case 'drug': {
        const dosage = activeHit.drug.dosageOptions[dosageIndex] ?? activeHit.drug.dosageOptions[0] ?? '';
        onAddPrescription(activeHit.drug.id, dosage, days);
        recordPrescriptionSignal(currentUserId, activeHit.drug.id, 'prescribed');
        if (addDiagnosis && safety?.missingDiagnosis) {
          onAddDiagnosis(safety.missingDiagnosis.name, safety.missingDiagnosis.icd10);
        }
        break;
      }
      case 'labset':
        onAddLab(activeHit.set.id, '通常');
        break;
      case 'rxset':
        onAddPrescriptionsBatch(activeHit.set.items);
        break;
      case 'imaging':
        onAddImaging({ category: activeHit.category, status: 'draft', scheduledAt: '本日', note: '' });
        break;
      case 'procedure':
        onAddProcedure({ title: activeHit.title, status: 'planned', note: '' });
        break;
    }
    if (keepOpen) {
      setQuery('');
      setActiveIndex(0);
      inputRef.current?.focus();
    } else {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmActive(e.shiftKey);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(hits.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    // 履歴 1–6（検索欄が空のとき）
    if (query === '' && /^[1-6]$/.test(e.key)) {
      const item = history.find((h) => h.no === Number(e.key));
      if (item) {
        e.preventDefault();
        item.run();
      }
    }
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: modal backdrop close
    <div className="clinical fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--dim)]"
      />
      <div
        role="dialog"
        aria-label="オーダーコンポーザ"
        className="absolute left-1/2 top-24 w-[760px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[14px] border border-border bg-popover shadow-[var(--shadow-modal)]"
      >
        {/* header */}
        <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-3">
          <span className="grid size-[26px] place-items-center rounded-[7px] bg-brand-tint text-[11px] font-bold text-brand">
            ⌘O
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="処方・検査・画像・処置・セットを横断検索"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <span className="whitespace-nowrap text-[11px] text-text-tertiary">横断検索</span>
        </div>

        {/* body */}
        <div className="grid min-h-[328px] grid-cols-[252px_1fr]">
          {/* left: history */}
          <div className="flex flex-col gap-0.5 border-r border-border bg-surface-subtle p-2">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
              よく使う・履歴（この患者）
            </div>
            {history.filter((h) => h.group === 'patient').map((item) => (
              <HistoryRow key={item.no} item={item} />
            ))}
            {history.some((h) => h.group === 'self') ? (
              <div className="mt-2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
                よく使う（あなた・全患者）
              </div>
            ) : null}
            {history.filter((h) => h.group === 'self').map((item) => (
              <HistoryRow key={item.no} item={item} />
            ))}
            {history.length === 0 ? (
              <p className="px-2.5 py-3 text-[11px] leading-relaxed text-text-tertiary">
                使うほど、この患者とあなたの履歴がここに並びます。
              </p>
            ) : null}
          </div>

          {/* right: hits + form + safety */}
          <div className="flex flex-col gap-2.5 p-4">
            {hits.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-text-tertiary">
                {query ? '該当なし。別の語で検索してください。' : '薬剤名・検査名・「XP」などで検索。'}
              </p>
            ) : (
              hits.map((hit, idx) => (
                <HitRow
                  key={`${hit.kind}-${hit.id}`}
                  hit={hit}
                  active={idx === activeIndex}
                  onClick={() => setActiveIndex(idx)}
                />
              ))
            )}

            {activeHit?.kind === 'drug' ? (
              <>
                <div className="flex gap-2">
                  <FormField label="用法">
                    <select
                      value={dosageIndex}
                      onChange={(e) => setDosageIndex(Number(e.target.value))}
                      className="h-[30px] w-full rounded-[7px] border border-border bg-card px-2 text-[12.5px] font-semibold text-text-primary outline-none"
                    >
                      {activeHit.drug.dosageOptions.map((opt, i) => (
                        <option key={opt} value={i}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="日数・回数">
                    <input
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                      className="h-[30px] w-full rounded-[7px] border border-border bg-card px-2 text-[12.5px] font-semibold text-text-primary outline-none"
                    />
                  </FormField>
                </div>
                {safety?.warnings.map((w) => (
                  <div
                    key={w.text}
                    className={cn(
                      'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-[1.55]',
                      w.level === 'bad'
                        ? 'border-destructive/35 bg-destructive-bg text-destructive'
                        : 'border-warning/35 bg-warning-bg text-warning',
                    )}
                  >
                    <TriangleAlert size={13} strokeWidth={1.9} className="mt-px flex-none" />
                    <span>{w.text}</span>
                  </div>
                ))}
                {safety?.missingDiagnosis ? (
                  <button
                    type="button"
                    onClick={() => setAddDiagnosis((v) => !v)}
                    className="flex items-start gap-2 rounded-lg border border-brand/35 bg-brand-tint px-2.5 py-2 text-left text-[11.5px] leading-[1.55] text-brand"
                  >
                    <span
                      className={cn(
                        'mt-px grid size-3.5 flex-none place-items-center rounded border-[1.5px] border-current text-[10px]',
                        addDiagnosis ? 'bg-brand text-white' : 'bg-transparent',
                      )}
                    >
                      {addDiagnosis ? '✓' : ''}
                    </span>
                    <span>
                      適応病名がありません → <b>{safety.missingDiagnosis.name}</b> を同時に追加する
                    </span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center gap-3.5 border-t border-border px-[18px] py-2.5 text-[11px] text-text-tertiary">
          <span>
            <Kbd>⏎</Kbd> 追加して閉じる
          </span>
          <span>
            <Kbd>⇧⏎</Kbd> 続けて追加
          </span>
          <span>
            <Kbd>1–6</Kbd> 履歴を即実行
          </span>
          <span className="flex-1" />
          <span>
            <Kbd>esc</Kbd> 閉じる · どこでも <Kbd>⌘O</Kbd>
          </span>
          {isMutating ? <span className="text-brand">追加中…</span> : null}
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  return (
    <button
      type="button"
      onClick={item.run}
      className="flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-left text-[12px] hover:bg-card"
    >
      <span className="grid size-4 flex-none place-items-center rounded bg-muted text-[10px] font-bold text-text-tertiary">
        {item.no}
      </span>
      <span className="min-w-0 flex-1 font-semibold leading-[1.35] text-text-primary">{item.label}</span>
      <span className="whitespace-nowrap text-[10px] text-text-tertiary tabular-nums">{item.tail}</span>
    </button>
  );
}

function HitRow({ hit, active, onClick }: { hit: OrderHit; active: boolean; onClick: () => void }) {
  const tail = hit.kind === 'drug' ? hit.tail : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2.5 rounded-[9px] border px-2.5 py-2 text-left',
        active ? 'border-brand bg-brand-tint' : 'border-border hover:bg-surface-subtle',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-text-primary">{hit.label}</div>
        <div className="text-[10.5px] text-text-tertiary">{hit.meta}</div>
      </div>
      {tail ? (
        <div className="whitespace-nowrap text-right text-[10.5px] text-text-tertiary tabular-nums">{tail}</div>
      ) : null}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-text-tertiary">{label}</span>
      {children}
    </div>
  );
}
