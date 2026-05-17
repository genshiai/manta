import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Plus, Search, Send, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { buildPmdaDrugInfoUrl } from '../../lib/pmda';
import type {
  ChartOrderConfig,
  ImagingOrderEntry,
  PrescriptionCatalogItem,
  PrescriptionEntry,
  PrescriptionSetItem,
  PrescriptionSetMaster,
  ProcedureOrderEntry,
} from '../../types/workflow';

export type OrderTab = 'prescription' | 'lab' | 'imaging' | 'procedure';

type LabOrderRow = {
  id: number;
  patientId: string;
  category: string;
  status: 'done' | 'pending' | 'cancelled';
  urgency?: '通常' | '至急';
  items: string[];
  createdAt?: string;
};

type OrderPaneProps = {
  orderConfig: ChartOrderConfig;
  patientDepartment: string;
  activeProblemNames: string[];
  prescriptions: PrescriptionEntry[];
  labOrders: LabOrderRow[];
  imagingOrders: ImagingOrderEntry[];
  procedureOrders: ProcedureOrderEntry[];
  isMutating: boolean;
  orderMessage: string;
  openAddTab?: OrderTab | null;
  onOpenAddTabHandled?: () => void;
  onAddPrescription: (drugId: string, dosage: string, days: string) => void;
  onAddLab: (setId: string, urgency: '通常' | '至急') => void;
  onAddImaging: (entry: ImagingOrderEntry) => void;
  onAddProcedure: (entry: ProcedureOrderEntry) => void;
  onUpdateLab: (
    order: LabOrderRow,
    payload: { category?: string; urgency?: '通常' | '至急' | null; items?: string[]; status?: LabOrderRow['status'] },
  ) => void;
  onCancelLab: (order: LabOrderRow) => void;
  onUpdateImaging: (index: number, entry: ImagingOrderEntry) => void;
  onCancelImaging: (index: number, entry: ImagingOrderEntry) => void;
  onUpdateProcedure: (index: number, entry: ProcedureOrderEntry) => void;
  onCancelProcedure: (index: number, entry: ProcedureOrderEntry) => void;
  onAddPrescriptionsBatch?: (items: PrescriptionSetItem[]) => Promise<void>;
};

/**
 * 右ペイン (DO・次の行動)
 *
 * - 上端: 4 タブ sticky (処方/検査/画像/処置)
 * - 各タブ: 入力フォーム (上) + キュー (下)
 * - 処方タブは薬剤検索・セット展開プレビュー・PMDA リンク内蔵
 */
export const OrderPane = ({
  orderConfig,
  patientDepartment,
  activeProblemNames,
  prescriptions,
  labOrders,
  imagingOrders,
  procedureOrders,
  isMutating,
  orderMessage,
  openAddTab,
  onOpenAddTabHandled,
  onAddPrescription,
  onAddLab,
  onAddImaging,
  onAddProcedure,
  onUpdateLab,
  onCancelLab,
  onUpdateImaging,
  onCancelImaging,
  onUpdateProcedure,
  onCancelProcedure,
  onAddPrescriptionsBatch,
}: OrderPaneProps) => {
  const [tab, setTab] = useState<OrderTab>('prescription');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: '見えている診療録・検査・本日のキューを前提に質問できます。例:「今日の注意点」「検査異常を要約」',
    },
  ]);

  const openAddDialog = (nextTab: OrderTab) => {
    setTab(nextTab);
    setAddDialogOpen(true);
  };

  useEffect(() => {
    if (!openAddTab) return;
    openAddDialog(openAddTab);
    onOpenAddTabHandled?.();
  }, [openAddTab, onOpenAddTabHandled]);

  const handleAskAi = (query = aiQuery) => {
    const text = query.trim();
    if (!text) return;
    const abnormalLabCount = labOrders.filter((order) => order.urgency === '至急').length;
    const answer = [
      `処方 ${prescriptions.length}件、検査 ${labOrders.length}件、画像 ${imagingOrders.length}件、処置 ${procedureOrders.length}件が本日のキューにあります。`,
      abnormalLabCount > 0
        ? `至急検査が ${abnormalLabCount} 件あります。先に結果確認と患者説明を優先してください。`
        : '至急検査は現在キューにありません。',
      'AI連携APIは未接続のため、現時点では画面内データに基づくローカル要約として表示しています。',
    ].join('\n');
    setAiMessages((current) => [
      ...current,
      { role: 'user', text },
      { role: 'assistant', text: answer },
    ]);
    setAiQuery('');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="border-b border-border bg-brand-tint/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-brand text-white">
            <Sparkles size={15} />
          </span>
          <div>
            <h2 className="text-[14px] font-bold text-text-primary">AIエージェント</h2>
            <p className="text-[11px] text-text-tertiary">この画面の文脈で質問</p>
          </div>
        </div>
        <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
          {aiMessages.slice(-4).map((message, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: transient local chat
              key={index}
              className={`rounded-md px-3 py-2 text-[12px] leading-normal ${
                message.role === 'assistant'
                  ? 'bg-card text-text-secondary'
                  : 'bg-brand text-white'
              }`}
            >
              {message.text}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={aiQuery}
            onChange={(event) => setAiQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAskAi();
            }}
            placeholder="AIに質問"
            className="h-8 min-w-0 flex-1 rounded-full border border-border bg-card px-3 text-[12px] text-text-primary outline-none focus:ring-[3px] focus:ring-brand-focus-ring"
          />
          <button
            type="button"
            onClick={() => handleAskAi()}
            className="grid size-8 place-items-center rounded-full bg-brand text-white hover:bg-brand-hover"
            aria-label="AIに送信"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['今日の注意点', '検査異常を要約', '次の一手'].map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleAskAi(prompt)}
              className="rounded-full border border-border bg-card px-2 py-1 text-[11px] text-text-secondary hover:border-brand hover:text-brand"
            >
              {prompt}
            </button>
          ))}
        </div>
      </section>

      <div className="flex-shrink-0 border-b border-border p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-text-primary">本日のキュー</h2>
          <Button variant="default" size="xs" onClick={() => openAddDialog('prescription')}>
            <Plus size={12} />
            追加
          </Button>
        </div>
        <p className="truncate text-[11px] text-text-tertiary" title={orderMessage}>
          {orderMessage}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <QueueSection
          title="処方"
          count={prescriptions.length}
          onAdd={() => openAddDialog('prescription')}
        >
          {prescriptions.length > 0 ? (
            prescriptions.map((p, idx) => (
              <QueueItem
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${p.drugName}-${p.dosage}-${idx}`}
                title={p.drugName}
                meta={`${p.dosage} ・ ${p.days}`}
              />
            ))
          ) : (
            <QueueEmpty>未追加</QueueEmpty>
          )}
        </QueueSection>

        <QueueSection title="検査" count={labOrders.length} onAdd={() => openAddDialog('lab')}>
          {labOrders.length > 0 ? (
            labOrders.map((order, idx) => (
              <QueueItem
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${order.category}-${idx}`}
                title={order.category}
                meta={`${order.items.join('・') || '項目未設定'}${order.urgency === '至急' ? ' ・ 至急' : ''}`}
              />
            ))
          ) : (
            <QueueEmpty>未追加</QueueEmpty>
          )}
        </QueueSection>

        <QueueSection title="画像" count={imagingOrders.length} onAdd={() => openAddDialog('imaging')}>
          {imagingOrders.length > 0 ? (
            imagingOrders.map((order, idx) => (
              <QueueItem
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${order.category}-${order.scheduledAt}-${idx}`}
                title={order.category}
                meta={`${order.scheduledAt || '日時未定'} ・ ${order.status === 'scheduled' ? '予定' : '下書き'}`}
              />
            ))
          ) : (
            <QueueEmpty>未追加</QueueEmpty>
          )}
        </QueueSection>

        <QueueSection title="処置" count={procedureOrders.length} onAdd={() => openAddDialog('procedure')}>
          {procedureOrders.length > 0 ? (
            procedureOrders.map((order, idx) => (
              <QueueItem
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${order.title}-${idx}`}
                title={order.title}
                meta={order.status === 'planned' ? '予定' : '完了'}
              />
            ))
          ) : (
            <QueueEmpty>未追加</QueueEmpty>
          )}
        </QueueSection>

        <section className="border-b border-border p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold text-text-primary">次回予約</h3>
            <span className="text-[11px] text-text-tertiary">診察終了時に設定</span>
          </div>
          <QueueEmpty>未設定</QueueEmpty>
        </section>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto bg-card">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-bold">オーダ追加</DialogTitle>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(v) => setTab(v as OrderTab)} className="min-h-0">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="prescription">処方</TabsTrigger>
              <TabsTrigger value="lab">検査</TabsTrigger>
              <TabsTrigger value="imaging">画像</TabsTrigger>
              <TabsTrigger value="procedure">処置</TabsTrigger>
            </TabsList>

            <TabsContent value="prescription" className="m-0 pt-3">
              <PrescriptionTab
                orderConfig={orderConfig}
                patientDepartment={patientDepartment}
                activeProblemNames={activeProblemNames}
                prescriptions={prescriptions}
                isMutating={isMutating}
                onAdd={onAddPrescription}
                onAddBatch={onAddPrescriptionsBatch}
              />
            </TabsContent>

            <TabsContent value="lab" className="m-0 pt-3">
              <LabTab
                orderConfig={orderConfig}
                labOrders={labOrders}
                isMutating={isMutating}
                onAdd={onAddLab}
                onUpdate={onUpdateLab}
                onCancel={onCancelLab}
              />
            </TabsContent>

            <TabsContent value="imaging" className="m-0 pt-3">
              <ImagingTab
                imagingOrders={imagingOrders}
                isMutating={isMutating}
                onAdd={onAddImaging}
                onUpdate={onUpdateImaging}
                onCancel={onCancelImaging}
              />
            </TabsContent>

            <TabsContent value="procedure" className="m-0 pt-3">
              <ProcedureTab
                procedureOrders={procedureOrders}
                isMutating={isMutating}
                onAdd={onAddProcedure}
                onUpdate={onUpdateProcedure}
                onCancel={onCancelProcedure}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const QueueSection = ({
  title,
  count,
  onAdd,
  children,
}: {
  title: string;
  count: number;
  onAdd: () => void;
  children: ReactNode;
}) => (
  <section className="border-b border-border p-4">
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[13px] font-bold text-text-primary">
        {title} <span className="text-text-tertiary">({count})</span>
      </h3>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border-strong px-2.5 text-[11px] font-medium text-brand hover:border-brand hover:bg-brand-tint"
      >
        <Plus size={12} />
        追加
      </button>
    </div>
    <div className="space-y-1.5">{children}</div>
  </section>
);

const QueueItem = ({ title, meta }: { title: string; meta: string }) => (
  <div className="rounded-md bg-surface-subtle px-3 py-2">
    <p className="truncate text-[12px] font-bold text-text-primary">{title}</p>
    <p className="mt-0.5 truncate text-[11px] text-text-tertiary">{meta}</p>
  </div>
);

const QueueEmpty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
    {children}
  </div>
);

const formatDrugPrice = (value: PrescriptionCatalogItem['drugPrice']) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value}円`;
  return `${numeric.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}円`;
};

const formatMasterDate = (value?: string) => {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}/${value.slice(4, 6)}/${value.slice(6, 8)}`;
  return value;
};

const describeDrugPolicy = (drug: PrescriptionCatalogItem) => {
  const labels: string[] = [];
  if (drug.brandFlag) labels.push(drug.brandFlag);
  if (drug.hasGeneric !== undefined) labels.push(drug.hasGeneric ? '後発品あり' : '後発品なし');
  if (drug.genericReimbursementFlag) labels.push(`後発区分 ${drug.genericReimbursementFlag}`);
  const transitionalExpiry = formatMasterDate(drug.transitionalExpiry);
  if (transitionalExpiry) labels.push(`経過措置 ${transitionalExpiry}`);
  return labels;
};

// === 処方タブ (薬剤検索・PMDA・セット展開) ===

const PrescriptionTab = ({
  orderConfig,
  patientDepartment,
  activeProblemNames,
  prescriptions,
  isMutating,
  onAdd,
  onAddBatch,
}: {
  orderConfig: ChartOrderConfig;
  patientDepartment: string;
  activeProblemNames: string[];
  prescriptions: PrescriptionEntry[];
  isMutating: boolean;
  onAdd: (drugId: string, dosage: string, days: string) => void;
  onAddBatch?: (items: PrescriptionSetItem[]) => Promise<void>;
}) => {
  const [query, setQuery] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<PrescriptionCatalogItem | null>(null);
  const [dosage, setDosage] = useState('');
  const [days, setDays] = useState('14日分');
  const [setPreview, setSetPreview] = useState<PrescriptionSetMaster | null>(null);
  const [warningDetail, setWarningDetail] = useState<PrescriptionEntry | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return [] as PrescriptionCatalogItem[];
    return orderConfig.prescriptionCatalog
      .filter((d) => {
        const fields = [d.drugName, d.genericName ?? '', d.nameKana ?? '', ...d.aliases];
        return fields.some((f) => f.toLowerCase().includes(q));
      })
      .slice(0, 12);
  }, [orderConfig.prescriptionCatalog, query]);

  const dosageOptions = selectedDrug?.dosageOptions ?? [];
  const currentDosage = dosage || dosageOptions[0] || '';
  const pmdaUrl = selectedDrug?.pmdaInfoUrl ?? buildPmdaDrugInfoUrl(selectedDrug?.yjCode);
  const recommendedSets = useMemo(() => {
    const problemText = activeProblemNames.join(' ');
    return orderConfig.prescriptionSets
      .map((set) => {
        const departmentMatched = set.department === patientDepartment || set.department === '共通';
        const problemMatched = Boolean(set.relatedProblem && problemText.includes(set.relatedProblem));
        const score =
          (problemMatched ? 20 : 0) +
          (set.department === patientDepartment ? 10 : 0) +
          (set.department === '共通' ? 4 : 0);
        const reason = problemMatched
          ? `病名: ${set.relatedProblem}`
          : departmentMatched
            ? `診療科: ${set.department}`
            : '';
        return { set, score, reason };
      })
      .sort((a, b) => b.score - a.score || a.set.label.localeCompare(b.set.label, 'ja-JP'));
  }, [activeProblemNames, orderConfig.prescriptionSets, patientDepartment]);

  const handleAddSelected = () => {
    if (!selectedDrug || !currentDosage) return;
    onAdd(selectedDrug.id, currentDosage, days || selectedDrug.defaultDays || '14日分');
    setSelectedDrug(null);
    setQuery('');
    setDosage('');
  };

  return (
    <div className="space-y-5">
      {/* 薬剤検索 */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          薬剤を追加
        </h3>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="薬剤名 / 一般名 / カナで検索"
            className="pl-9"
          />
        </div>
        {matches.length > 0 && !selectedDrug ? (
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {matches.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setSelectedDrug(d)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-subtle"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {d.drugName}
                    </p>
                    {d.genericName ? (
                      <p className="truncate text-[11px] text-text-tertiary">{d.genericName}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.yjCode ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          YJ {d.yjCode}
                        </span>
                      ) : null}
                      {formatDrugPrice(d.drugPrice) ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          {formatDrugPrice(d.drugPrice)}
                        </span>
                      ) : null}
                      {d.manufacturer ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          {d.manufacturer}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="text-[10px] text-text-tertiary">{d.category}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {selectedDrug ? (
          <div className="space-y-2 rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-text-primary">
                  {selectedDrug.drugName}
                </p>
                {selectedDrug.genericName ? (
                  <p className="truncate text-[11px] text-text-tertiary">
                    {selectedDrug.genericName}
                  </p>
                ) : null}
                {selectedDrug.allergyConflictLabel ? (
                  <p className="mt-1 inline-block rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
                    ⚠ {selectedDrug.allergyConflictLabel}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedDrug(null)}
                className="rounded p-0.5 text-text-tertiary hover:bg-surface-subtle"
              >
                <X size={14} />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-2 text-[11px]">
              <div className="min-w-0">
                <dt className="text-text-tertiary">YJ</dt>
                <dd className="truncate font-medium text-text-primary">{selectedDrug.yjCode ?? '未設定'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-text-tertiary">HOT</dt>
                <dd className="truncate font-medium text-text-primary">{selectedDrug.hotCode ?? '未設定'}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-text-tertiary">薬価</dt>
                <dd className="truncate font-medium text-text-primary">
                  {formatDrugPrice(selectedDrug.drugPrice) ?? '未設定'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-text-tertiary">メーカー</dt>
                <dd className="truncate font-medium text-text-primary">
                  {selectedDrug.manufacturer ?? '未設定'}
                </dd>
              </div>
            </dl>
            {describeDrugPolicy(selectedDrug).length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {describeDrugPolicy(selectedDrug).map((label) => (
                  <span
                    key={label}
                    className="rounded border border-amber-200 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            <select
              value={currentDosage}
              onChange={(e) => setDosage(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-card px-2 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {dosageOptions.length > 0 ? (
                dosageOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))
              ) : (
                <option value="">用量未設定</option>
              )}
            </select>
            <Input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder={selectedDrug.defaultDays ?? '14日分'}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleAddSelected}
                disabled={isMutating || !currentDosage}
              >
                <Plus size={14} />
                追加
              </Button>
              {pmdaUrl ? (
                <a
                  href={pmdaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2.5 text-[12px] text-text-secondary hover:bg-surface-subtle"
                  title="PMDA 添付文書を開く"
                >
                  <ExternalLink size={12} />
                  PMDA
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* 処方セット */}
      {orderConfig.prescriptionSets.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
            処方セット
          </h3>
          <ul className="space-y-1">
            {recommendedSets.slice(0, 6).map(({ set: s, reason }) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSetPreview(s)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-text-primary">{s.label}</span>
                    {reason ? (
                      <span className="mt-0.5 block truncate text-[11px] text-brand">{reason}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-tertiary">{s.items.length}剤</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 現在の処方 */}
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          現在の処方 ({prescriptions.length})
        </h3>
        <ul className="space-y-1.5">
          {prescriptions.length > 0 ? (
            prescriptions.map((p, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${p.drugName}-${p.dosage}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <p className="text-[13px] font-bold text-text-primary">{p.drugName}</p>
                <p className="text-[12px] text-text-tertiary">
                  {p.dosage} ・ {p.days}
                </p>
                {p.warnings && p.warnings.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-l-2 border-amber-400 pl-2">
                    {p.warnings.map((warning) => (
                      <li className="text-[11px] leading-snug text-amber-700" key={warning}>
                        {warning}
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-amber-800 underline-offset-2 hover:underline"
                        onClick={() => setWarningDetail(p)}
                      >
                        根拠を表示
                      </button>
                    </li>
                  </ul>
                ) : null}
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
              処方なし
            </li>
          )}
        </ul>
      </section>

      {/* セット展開プレビューモーダル */}
      {setPreview ? (
        <SetPreviewSheet
          set={setPreview}
          catalog={orderConfig.prescriptionCatalog}
          isMutating={isMutating}
          onClose={() => setSetPreview(null)}
          onConfirm={async (items) => {
            if (!onAddBatch) return;
            await onAddBatch(items);
            setSetPreview(null);
          }}
        />
      ) : null}
      {warningDetail ? (
        <WarningDetailSheet prescription={warningDetail} onClose={() => setWarningDetail(null)} />
      ) : null}
    </div>
  );
};

const WarningDetailSheet = ({
  prescription,
  onClose,
}: {
  prescription: PrescriptionEntry;
  onClose: () => void;
}) => (
  <div
    className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    onClick={onClose}
    onKeyDown={(e) => {
      if (e.key === 'Escape') onClose();
    }}
    role="dialog"
    aria-modal="true"
    tabIndex={-1}
  >
    <button
      type="button"
      tabIndex={-1}
      aria-label="閉じる"
      className="absolute inset-0 cursor-default"
      onClick={onClose}
    />
    <div className="relative max-h-[82vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-card p-6 shadow-modal sm:rounded-xl">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[18px] font-bold leading-snug text-text-primary">警告根拠</h3>
          <p className="mt-1 text-[12px] text-text-tertiary">{prescription.drugName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-tertiary hover:bg-surface-subtle"
        >
          <X size={16} />
        </button>
      </header>
      <ul className="space-y-3">
        {(prescription.warningDetails && prescription.warningDetails.length > 0
          ? prescription.warningDetails
          : (prescription.warnings ?? []).map((warning) => ({ message: warning, source: 'Manta safety rule', evidence: warning }))
        ).map((detail) => (
          <li className="rounded-lg border border-border bg-surface-subtle p-3" key={`${detail.source}-${detail.message}`}>
            <p className="text-[13px] font-bold text-text-primary">{detail.message}</p>
            {detail.source ? <p className="mt-1 text-[11px] text-text-tertiary">根拠: {detail.source}</p> : null}
            {detail.evidence && detail.evidence !== detail.message ? (
              <p className="mt-2 text-[12px] leading-relaxed text-text-secondary">{detail.evidence}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  </div>
);

// === セット展開プレビュー sheet ===

const SetPreviewSheet = ({
  set,
  catalog,
  isMutating,
  onClose,
  onConfirm,
}: {
  set: PrescriptionSetMaster;
  catalog: PrescriptionCatalogItem[];
  isMutating: boolean;
  onClose: () => void;
  onConfirm: (items: PrescriptionSetItem[]) => void;
}) => {
  const [items, setItems] = useState(() => set.items);
  const updateItem = (index: number, patch: Partial<PrescriptionSetItem>) => {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="閉じる"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-t-xl bg-card p-6 shadow-modal sm:rounded-xl">
      <header className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[18px] font-bold leading-snug text-text-primary">{set.label}</h3>
          <p className="text-[12px] text-text-tertiary">
            {set.department}
            {set.relatedProblem ? ` ・ ${set.relatedProblem}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-text-tertiary hover:bg-surface-subtle"
        >
          <X size={16} />
        </button>
      </header>

      <div className="mb-4">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          展開される薬剤 ({items.length})
        </h4>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item, index) => {
            const drug = catalog.find((d) => d.id === item.drugId);
            return (
              <li key={item.drugId} className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_1.2fr_88px]">
                <span className="min-w-0 truncate text-[13px] font-medium text-text-primary">
                  {drug?.drugName ?? item.drugId}
                </span>
                <Input
                  value={item.dosage}
                  onChange={(event) => updateItem(index, { dosage: event.target.value })}
                  className="h-8 text-[12px]"
                />
                <Input
                  value={item.days}
                  onChange={(event) => updateItem(index, { days: event.target.value })}
                  className="h-8 text-[12px]"
                />
              </li>
            );
          })}
        </ul>
      </div>

      {set.note ? (
        <p className="mb-4 rounded-md bg-surface-subtle p-2 text-[12px] text-text-secondary">
          {set.note}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          キャンセル
        </Button>
        <Button variant="default" size="sm" onClick={() => onConfirm(items)} disabled={isMutating}>
          一括追加
        </Button>
      </div>
    </div>
  </div>
  );
};

// === 検査タブ ===

const LabTab = ({
  orderConfig,
  labOrders,
  isMutating,
  onAdd,
  onUpdate,
  onCancel,
}: {
  orderConfig: ChartOrderConfig;
  labOrders: LabOrderRow[];
  isMutating: boolean;
  onAdd: (setId: string, urgency: '通常' | '至急') => void;
  onUpdate: (
    order: LabOrderRow,
    payload: { category?: string; urgency?: '通常' | '至急' | null; items?: string[]; status?: LabOrderRow['status'] },
  ) => void;
  onCancel: (order: LabOrderRow) => void;
}) => {
  const [setId, setSetId] = useState(orderConfig.labSetOptions[0]?.id ?? '');
  const [urgency, setUrgency] = useState<'通常' | '至急'>('通常');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editUrgency, setEditUrgency] = useState<'通常' | '至急'>('通常');
  const [editItemsText, setEditItemsText] = useState('');
  const set = orderConfig.labSetOptions.find((s) => s.id === setId);
  const startEdit = (order: LabOrderRow) => {
    setEditingId(order.id);
    setEditCategory(order.category);
    setEditUrgency(order.urgency ?? '通常');
    setEditItemsText(order.items.join('、'));
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          検査を追加
        </h3>
        <select
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          className="h-9 w-full rounded-md border border-border bg-card px-2 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {orderConfig.labSetOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as '通常' | '至急')}
          className="h-9 w-full rounded-md border border-border bg-card px-2 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="通常">通常</option>
          <option value="至急">至急</option>
        </select>

        {set && set.items.length > 0 ? (
          <div className="rounded-md border border-border bg-surface-subtle p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
              展開項目 ({set.items.length})
            </p>
            <p className="text-[12px] leading-relaxed text-text-secondary">
              {set.items.join('・')}
            </p>
          </div>
        ) : null}

        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onAdd(setId, urgency)}
          disabled={isMutating || !setId}
        >
          <Plus size={14} />
          検査追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          検査キュー ({labOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {labOrders.length > 0 ? (
            labOrders.map((o, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${o.category}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                {editingId === o.id ? (
                  <div className="space-y-2">
                    <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
                    <select
                      value={editUrgency}
                      onChange={(e) => setEditUrgency(e.target.value as '通常' | '至急')}
                      className="h-9 w-full rounded-md border border-border bg-card px-2 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
                    >
                      <option value="通常">通常</option>
                      <option value="至急">至急</option>
                    </select>
                    <Input value={editItemsText} onChange={(e) => setEditItemsText(e.target.value)} />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={isMutating || !editCategory.trim()}
                        onClick={() => {
                          onUpdate(o, {
                            category: editCategory,
                            urgency: editUrgency,
                            items: editItemsText.split(/[、,]/).map((item) => item.trim()).filter(Boolean),
                          });
                          setEditingId(null);
                        }}
                      >
                        保存
                      </Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>閉じる</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-bold text-text-primary">{o.category}</p>
                      <span className={`text-[11px] ${o.status === 'done' ? 'text-success' : 'text-text-tertiary'}`}>
                        {o.status === 'done' ? '完了' : o.status === 'cancelled' ? '取消' : 'オーダ中'}
                        {o.urgency === '至急' ? ' ・ 至急' : ''}
                      </span>
                    </div>
                    {o.items.length > 0 ? (
                      <p className="mt-0.5 truncate text-[12px] text-text-tertiary">{o.items.join('・')}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => startEdit(o)}>編集</Button>
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => onCancel(o)}>取消</Button>
                    </div>
                  </>
                )}
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
              検査オーダなし
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

// === 画像タブ ===

const ImagingTab = ({
  imagingOrders,
  isMutating,
  onAdd,
  onUpdate,
  onCancel,
}: {
  imagingOrders: ImagingOrderEntry[];
  isMutating: boolean;
  onAdd: (entry: ImagingOrderEntry) => void;
  onUpdate: (index: number, entry: ImagingOrderEntry) => void;
  onCancel: (index: number, entry: ImagingOrderEntry) => void;
}) => {
  const [category, setCategory] = useState('胸部X線');
  const [status, setStatus] = useState<ImagingOrderEntry['status']>('scheduled');
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ImagingOrderEntry>({ category: '', status: 'scheduled', scheduledAt: '', note: '' });
  const startEdit = (index: number, entry: ImagingOrderEntry) => {
    setEditingIndex(index);
    setEditForm(entry);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          画像オーダ追加
        </h3>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="検査種別" />
        <select
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-text-primary"
          onChange={(e) => setStatus(e.target.value as ImagingOrderEntry['status'])}
          value={status}
        >
          <option value="scheduled">予定</option>
          <option value="draft">下書き</option>
        </select>
        <Input
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          placeholder="2026/04/21 11:00"
        />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考" />
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {
            onAdd({ category, status, scheduledAt, note });
            setCategory('胸部X線');
            setStatus('scheduled');
            setScheduledAt('');
            setNote('');
          }}
          disabled={isMutating || !category}
        >
          <Plus size={14} />
          画像追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          画像キュー ({imagingOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {imagingOrders.length > 0 ? (
            imagingOrders.map((o, idx) => (
              <li
                key={o.id ?? `${o.category}-${o.scheduledAt}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                {editingIndex === idx ? (
                  <div className="space-y-2">
                    <Input value={editForm.category} onChange={(e) => setEditForm((current) => ({ ...current, category: e.target.value }))} />
                    <select
                      className="h-9 w-full rounded-md border border-border bg-card px-3 text-[13px] text-text-primary"
                      onChange={(e) => setEditForm((current) => ({ ...current, status: e.target.value as ImagingOrderEntry['status'] }))}
                      value={editForm.status}
                    >
                      <option value="scheduled">予定</option>
                      <option value="draft">下書き</option>
                      <option value="cancelled">取消</option>
                    </select>
                    <Input value={editForm.scheduledAt} onChange={(e) => setEditForm((current) => ({ ...current, scheduledAt: e.target.value }))} />
                    <Input value={editForm.note} onChange={(e) => setEditForm((current) => ({ ...current, note: e.target.value }))} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="xs" variant="outline" disabled={isMutating || !editForm.category.trim()} onClick={() => { onUpdate(idx, editForm); setEditingIndex(null); }}>保存</Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingIndex(null)}>閉じる</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-bold text-text-primary">{o.category}</p>
                    <p className="text-[12px] text-text-tertiary">
                      {o.scheduledAt} ・ {o.status === 'scheduled' ? '予定' : o.status === 'cancelled' ? '取消' : '下書き'}
                    </p>
                    {o.note ? <p className="mt-0.5 text-[12px] text-text-secondary">{o.note}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => startEdit(idx, o)}>編集</Button>
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => onCancel(idx, o)}>取消</Button>
                    </div>
                  </>
                )}
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
              画像オーダなし
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

// === 処置タブ ===

const ProcedureTab = ({
  procedureOrders,
  isMutating,
  onAdd,
  onUpdate,
  onCancel,
}: {
  procedureOrders: ProcedureOrderEntry[];
  isMutating: boolean;
  onAdd: (entry: ProcedureOrderEntry) => void;
  onUpdate: (index: number, entry: ProcedureOrderEntry) => void;
  onCancel: (index: number, entry: ProcedureOrderEntry) => void;
}) => {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<ProcedureOrderEntry['status']>('planned');
  const [note, setNote] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ProcedureOrderEntry>({ title: '', status: 'planned', note: '' });
  const startEdit = (index: number, entry: ProcedureOrderEntry) => {
    setEditingIndex(index);
    setEditForm(entry);
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          処置を追加
        </h3>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="処置名" />
        <select
          className="h-9 rounded-md border border-border bg-card px-3 text-[13px] text-text-primary"
          onChange={(e) => setStatus(e.target.value as ProcedureOrderEntry['status'])}
          value={status}
        >
          <option value="planned">予定</option>
          <option value="done">実施済</option>
        </select>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考" />
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {
            onAdd({ title, status, note });
            setTitle('');
            setStatus('planned');
            setNote('');
          }}
          disabled={isMutating || !title}
        >
          <Plus size={14} />
          処置追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          処置キュー ({procedureOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {procedureOrders.length > 0 ? (
            procedureOrders.map((o, idx) => (
              <li
                key={o.id ?? `${o.title}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                {editingIndex === idx ? (
                  <div className="space-y-2">
                    <Input value={editForm.title} onChange={(e) => setEditForm((current) => ({ ...current, title: e.target.value }))} />
                    <select
                      className="h-9 w-full rounded-md border border-border bg-card px-3 text-[13px] text-text-primary"
                      onChange={(e) => setEditForm((current) => ({ ...current, status: e.target.value as ProcedureOrderEntry['status'] }))}
                      value={editForm.status}
                    >
                      <option value="planned">予定</option>
                      <option value="done">実施済</option>
                      <option value="cancelled">取消</option>
                    </select>
                    <Input value={editForm.note} onChange={(e) => setEditForm((current) => ({ ...current, note: e.target.value }))} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="xs" variant="outline" disabled={isMutating || !editForm.title.trim()} onClick={() => { onUpdate(idx, editForm); setEditingIndex(null); }}>保存</Button>
                      <Button size="xs" variant="ghost" onClick={() => setEditingIndex(null)}>閉じる</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[13px] font-bold text-text-primary">{o.title}</p>
                    <p className="text-[12px] text-text-tertiary">
                      {o.status === 'planned' ? '予定' : o.status === 'cancelled' ? '取消' : '完了'}
                    </p>
                    {o.note ? <p className="mt-0.5 text-[12px] text-text-secondary">{o.note}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => startEdit(idx, o)}>編集</Button>
                      <Button size="xs" variant="ghost" disabled={isMutating || o.status === 'cancelled'} onClick={() => onCancel(idx, o)}>取消</Button>
                    </div>
                  </>
                )}
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
              処置なし
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};
