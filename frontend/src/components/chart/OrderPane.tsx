import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type {
  ChartOrderConfig,
  ImagingOrderEntry,
  PrescriptionEntry,
  ProcedureOrderEntry,
} from '../../types/workflow';

type OrderTab = 'prescription' | 'lab' | 'imaging' | 'procedure';

type LabOrderRow = {
  status: string;
  scheduledAt?: string;
  testName?: string;
  result?: string;
  reportedAt?: string;
};

type OrderPaneProps = {
  orderConfig: ChartOrderConfig;
  prescriptions: PrescriptionEntry[];
  labOrders: LabOrderRow[];
  imagingOrders: ImagingOrderEntry[];
  procedureOrders: ProcedureOrderEntry[];
  isMutating: boolean;
  orderMessage: string;
  onAddPrescription: (drugId: string, dosage: string, days: string) => void;
  onAddLab: (setId: string, urgency: '通常' | '至急') => void;
  onAddImaging: (entry: ImagingOrderEntry) => void;
  onAddProcedure: (entry: ProcedureOrderEntry) => void;
};

/**
 * 右ペイン (DO・次の行動)
 *
 * - 上端: 4 タブ sticky (処方/検査/画像/処置)
 * - 各タブ: 入力フォーム (上) + キュー (下、独立スクロール)
 * - タブ切替はカテゴリ排他なので OK
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 2.3
 */
export const OrderPane = ({
  orderConfig,
  prescriptions,
  labOrders,
  imagingOrders,
  procedureOrders,
  isMutating,
  orderMessage,
  onAddPrescription,
  onAddLab,
  onAddImaging,
  onAddProcedure,
}: OrderPaneProps) => {
  const [tab, setTab] = useState<OrderTab>('prescription');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as OrderTab)}
        className="flex h-full min-h-0 flex-col"
      >
        {/* sticky タブヘッダー */}
        <div className="flex-shrink-0 border-b border-border px-3 pt-3">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="prescription">処方</TabsTrigger>
            <TabsTrigger value="lab">検査</TabsTrigger>
            <TabsTrigger value="imaging">画像</TabsTrigger>
            <TabsTrigger value="procedure">処置</TabsTrigger>
          </TabsList>
          <p className="mt-2 px-1 text-[11px] text-text-tertiary">{orderMessage}</p>
        </div>

        {/* 各タブの中身: ペイン全体スクロール */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="prescription" className="m-0 p-3">
            <PrescriptionTab
              orderConfig={orderConfig}
              prescriptions={prescriptions}
              isMutating={isMutating}
              onAdd={onAddPrescription}
            />
          </TabsContent>

          <TabsContent value="lab" className="m-0 p-3">
            <LabTab
              orderConfig={orderConfig}
              labOrders={labOrders}
              isMutating={isMutating}
              onAdd={onAddLab}
            />
          </TabsContent>

          <TabsContent value="imaging" className="m-0 p-3">
            <ImagingTab
              imagingOrders={imagingOrders}
              isMutating={isMutating}
              onAdd={onAddImaging}
            />
          </TabsContent>

          <TabsContent value="procedure" className="m-0 p-3">
            <ProcedureTab
              procedureOrders={procedureOrders}
              isMutating={isMutating}
              onAdd={onAddProcedure}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

// === 個別タブ ===

const PrescriptionTab = ({
  orderConfig,
  prescriptions,
  isMutating,
  onAdd,
}: {
  orderConfig: ChartOrderConfig;
  prescriptions: PrescriptionEntry[];
  isMutating: boolean;
  onAdd: (drugId: string, dosage: string, days: string) => void;
}) => {
  const [drugId, setDrugId] = useState(orderConfig.prescriptionCatalog[0]?.id ?? '');
  const [dosage, setDosage] = useState('');
  const [days, setDays] = useState('14日分');
  const drug = orderConfig.prescriptionCatalog.find((d) => d.id === drugId);
  const dosageOptions = drug?.dosageOptions ?? [];
  const currentDosage = dosage || dosageOptions[0] || '';

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          処方を追加
        </h3>
        <select
          value={drugId}
          onChange={(e) => {
            setDrugId(e.target.value);
            setDosage('');
          }}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          {orderConfig.prescriptionCatalog.map((d) => (
            <option key={d.id} value={d.id}>
              {d.drugName}
            </option>
          ))}
        </select>
        <select
          value={currentDosage}
          onChange={(e) => setDosage(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
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
        <Input value={days} onChange={(e) => setDays(e.target.value)} placeholder="14日分" />
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onAdd(drugId, currentDosage, days)}
          disabled={isMutating || !drugId || !currentDosage}
        >
          <Plus size={14} />
          処方追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
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
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border px-3 py-3 text-center text-[12px] text-text-tertiary">
              処方なし
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

const LabTab = ({
  orderConfig,
  labOrders,
  isMutating,
  onAdd,
}: {
  orderConfig: ChartOrderConfig;
  labOrders: LabOrderRow[];
  isMutating: boolean;
  onAdd: (setId: string, urgency: '通常' | '至急') => void;
}) => {
  const [setId, setSetId] = useState(orderConfig.labSetOptions[0]?.id ?? '');
  const [urgency, setUrgency] = useState<'通常' | '至急'>('通常');

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          検査を追加
        </h3>
        <select
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
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
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
        >
          <option value="通常">通常</option>
          <option value="至急">至急</option>
        </select>
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
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          検査キュー ({labOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {labOrders.length > 0 ? (
            labOrders.map((o, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${o.testName}-${o.scheduledAt ?? ''}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-bold text-text-primary">{o.testName ?? '検査'}</p>
                  <span className="text-[11px] text-text-tertiary">{o.status}</span>
                </div>
                {o.result ? (
                  <p className="mt-0.5 text-[12px] text-text-secondary">{o.result}</p>
                ) : null}
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

const ImagingTab = ({
  imagingOrders,
  isMutating,
  onAdd,
}: {
  imagingOrders: ImagingOrderEntry[];
  isMutating: boolean;
  onAdd: (entry: ImagingOrderEntry) => void;
}) => {
  const [category, setCategory] = useState('胸部X線');
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          画像オーダ追加
        </h3>
        <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="検査種別" />
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
          onClick={() => onAdd({ category, status: 'scheduled', scheduledAt, note })}
          disabled={isMutating || !category}
        >
          <Plus size={14} />
          画像追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          画像キュー ({imagingOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {imagingOrders.length > 0 ? (
            imagingOrders.map((o, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${o.category}-${o.scheduledAt}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <p className="text-[13px] font-bold text-text-primary">{o.category}</p>
                <p className="text-[12px] text-text-tertiary">
                  {o.scheduledAt} ・ {o.status === 'scheduled' ? '予定' : '下書き'}
                </p>
                {o.note ? <p className="mt-0.5 text-[12px] text-text-secondary">{o.note}</p> : null}
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

const ProcedureTab = ({
  procedureOrders,
  isMutating,
  onAdd,
}: {
  procedureOrders: ProcedureOrderEntry[];
  isMutating: boolean;
  onAdd: (entry: ProcedureOrderEntry) => void;
}) => {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          処置を追加
        </h3>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="処置名" />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="備考" />
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onAdd({ title, status: 'planned', note })}
          disabled={isMutating || !title}
        >
          <Plus size={14} />
          処置追加
        </Button>
      </section>

      <section className="space-y-2">
        <h3 className="text-[12px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
          処置キュー ({procedureOrders.length})
        </h3>
        <ul className="space-y-1.5">
          {procedureOrders.length > 0 ? (
            procedureOrders.map((o, idx) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only list, idx is stable
                key={`${o.title}-${idx}`}
                className="rounded-md border border-border bg-card px-3 py-2"
              >
                <p className="text-[13px] font-bold text-text-primary">{o.title}</p>
                <p className="text-[12px] text-text-tertiary">
                  {o.status === 'planned' ? '予定' : '完了'}
                </p>
                {o.note ? <p className="mt-0.5 text-[12px] text-text-secondary">{o.note}</p> : null}
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
