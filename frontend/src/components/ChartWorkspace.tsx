import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addImagingOrder,
  addLabOrder,
  addPrescription,
  addProcedureOrder,
  copyLastPrescriptions,
  getChartOrderConfig,
  getChartWorkspace,
  getPrescriptionTimeline,
  isUnauthorizedError,
  saveChart,
} from '../lib/api';
import type { PatientRecord, ReceptionStatus } from '../data/chartMock';
import type {
  ChartHistoryEntry,
  ChartMeta,
  ChartOrderConfig,
  ChartTemplate,
  ImagingOrderEntry,
  LabResultEntry,
  PatientProfileEntry,
  PrescriptionEntry,
  PrescriptionTimelineGroup,
  ProblemListItem,
  ProcedureOrderEntry,
  UserSession,
  VisitHistoryEntry,
  VitalEntry,
} from '../types/workflow';
import { ChartShell } from './chart/ChartShell';
import { ChartTopBar } from './chart/ChartTopBar';
import { OrderPane } from './chart/OrderPane';
import { PatientPane } from './chart/PatientPane';
import { RecordPane } from './chart/RecordPane';
import type { SoapDraft } from './chart/SoapEditor';

type ChartWorkspaceProps = {
  patient: PatientRecord;
  currentUser: UserSession;
  onAuthExpired: () => void;
  onDataChanged: () => void;
  onReturnReception: () => void;
  onMetaChange: (meta: ChartMeta) => void;
  onPatientStatusChange: (
    patientId: string,
    nextStatus: ReceptionStatus,
    detail: string,
  ) => Promise<void>;
};

type LabOrderRow = {
  category: string;
  status: 'done' | 'pending';
  urgency?: '通常' | '至急';
  items: string[];
  createdAt?: string;
};

type IdEntry<T> = T & { id: string };

const emptyDraft: SoapDraft = { subjective: '', objective: '', assessment: '', plan: '' };

const emptyOrderConfig: ChartOrderConfig = {
  prescriptionCatalog: [],
  standardUsageMasters: [],
  prescriptionSets: [],
  labSetOptions: [],
  reservationSlots: [],
  chartTemplates: [],
};

const formatApiMessage = (message: string) => message;

const withId = <T extends object>(items: T[]): IdEntry<T>[] =>
  items.map((item, idx) => ({ ...item, id: `${idx}-${Date.now()}` }));

const draftFromTemplate = (template: ChartTemplate): SoapDraft => ({
  subjective: template.subjective,
  objective: template.objective,
  assessment: template.assessment,
  plan: template.plan,
});

/**
 * カルテ画面のオーケストレーター。
 * - データ取得・状態管理・API 呼び出しを集約
 * - 表示は ChartShell + PatientPane / RecordPane / OrderPane に委譲
 *
 * 設計指針: frontend/CHART-DESIGN.md
 */
export function ChartWorkspace({
  patient,
  currentUser,
  onAuthExpired,
  onDataChanged,
  onReturnReception,
  onMetaChange,
  onPatientStatusChange,
}: ChartWorkspaceProps) {
  // データ
  const [orderConfig, setOrderConfig] = useState<ChartOrderConfig>(emptyOrderConfig);
  const [profile, setProfile] = useState<IdEntry<PatientProfileEntry>[]>([]);
  const [problems, setProblems] = useState<IdEntry<ProblemListItem>[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistoryEntry[]>([]);
  const [chartHistory, setChartHistory] = useState<ChartHistoryEntry[]>([]);
  const [vitals, setVitals] = useState<VitalEntry[]>([]);
  const [labResults, setLabResults] = useState<LabResultEntry[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderRow[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrderEntry[]>([]);
  const [procedureOrders, setProcedureOrders] = useState<ProcedureOrderEntry[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionEntry[]>([]);
  const [prescriptionTimeline, setPrescriptionTimeline] = useState<PrescriptionTimelineGroup[]>(
    [],
  );

  // SOAP & 保存状態
  const [draft, setDraft] = useState<SoapDraft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState<SoapDraft>(emptyDraft);
  const [version, setVersion] = useState(1);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('カルテを読み込んでいます');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // 状態フラグ
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState('オーダを追加・確認できます');

  const initializedPatientIdRef = useRef<string | null>(null);

  const isDirty =
    draft.subjective !== savedDraft.subjective ||
    draft.objective !== savedDraft.objective ||
    draft.assessment !== savedDraft.assessment ||
    draft.plan !== savedDraft.plan;

  // 親コンポーネントへのメタ通知
  useEffect(() => {
    onMetaChange({ isDirty, lastSavedAt, version, pendingWarnings: 0 });
  }, [isDirty, lastSavedAt, onMetaChange, version]);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setWorkspaceError(null);

    try {
      const [workspace, nextOrderConfig, timeline] = await Promise.all([
        getChartWorkspace(patient.id),
        getChartOrderConfig(),
        getPrescriptionTimeline(patient.id),
      ]);

      setOrderConfig(nextOrderConfig);
      setSelectedTemplateId(nextOrderConfig.chartTemplates[0]?.id ?? '');
      setProfile(withId(workspace.patientProfile));
      setProblems(withId(workspace.problems));
      setVisitHistory(workspace.visitHistory);
      setChartHistory(workspace.chartHistory);
      setVitals(workspace.vitals);
      setLabResults(workspace.labResults);
      setLabOrders(workspace.labOrders);
      setImagingOrders(workspace.imagingOrders);
      setProcedureOrders(workspace.procedureOrders);
      setPrescriptions(workspace.prescriptions);
      setPrescriptionTimeline(timeline);

      const latest = workspace.latestNote;
      const nextDraft: SoapDraft = latest
        ? {
            subjective: latest.subjective,
            objective: latest.objective,
            assessment: latest.assessment,
            plan: latest.plan,
          }
        : emptyDraft;
      setDraft(nextDraft);
      setSavedDraft(nextDraft);
      setVersion(latest?.version ?? 1);
      setLastSavedAt(latest?.savedAt ?? null);
      setSaveMessage(latest ? '保存済みカルテを読み込みました' : 'カルテはまだ保存されていません');
      setOrderMessage('オーダを追加・確認できます');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setWorkspaceError(
        `カルテ情報の取得に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [onAuthExpired, patient.id]);

  useEffect(() => {
    if (initializedPatientIdRef.current === patient.id) return;
    initializedPatientIdRef.current = patient.id;
    loadWorkspace();
  }, [loadWorkspace, patient.id]);

  // === ハンドラ ===

  const handleSave = async () => {
    setIsMutating(true);
    try {
      const result = await saveChart(patient.id, {
        ...draft,
        savedBy: currentUser.displayName,
      });
      setVersion(result.version);
      setLastSavedAt(result.saved_at);
      setSavedDraft(draft);
      setSaveMessage('保存しました');
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setSaveMessage(
        `保存に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleApplyTemplate = () => {
    const template = orderConfig.chartTemplates.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setDraft(draftFromTemplate(template));
    setSaveMessage('テンプレートを挿入しました（未保存）');
  };

  const handleCopyPrevious = async () => {
    setIsMutating(true);
    try {
      const result = await copyLastPrescriptions(patient.id, {
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      setPrescriptions(refreshed.prescriptions);
      setPrescriptionTimeline(await getPrescriptionTimeline(patient.id));
      setOrderMessage(
        `${result.copiedCount}件複写しました${result.skippedCount > 0 ? ` (${result.skippedCount}件スキップ)` : ''}`,
      );
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `前回複写に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddPrescription = async (drugId: string, dosage: string, days: string) => {
    const drug = orderConfig.prescriptionCatalog.find((d) => d.id === drugId);
    if (!drug) return;
    setIsMutating(true);
    try {
      await addPrescription(patient.id, {
        type: drug.category ?? '内服',
        days,
        drugName: drug.drugName,
        dosage,
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      setPrescriptions(refreshed.prescriptions);
      setPrescriptionTimeline(await getPrescriptionTimeline(patient.id));
      setOrderMessage(`処方を追加しました: ${drug.drugName}`);
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `処方追加に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddLab = async (setId: string, urgency: '通常' | '至急') => {
    const set = orderConfig.labSetOptions.find((s) => s.id === setId);
    if (!set) return;
    setIsMutating(true);
    try {
      await addLabOrder(patient.id, {
        category: set.label,
        urgency,
        items: set.items,
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      setLabOrders(refreshed.labOrders);
      setOrderMessage(`検査オーダを追加しました: ${set.label}`);
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `検査追加に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddImaging = async (entry: ImagingOrderEntry) => {
    setIsMutating(true);
    try {
      await addImagingOrder(patient.id, {
        ...entry,
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      setImagingOrders(refreshed.imagingOrders);
      setOrderMessage(`画像オーダを追加しました: ${entry.category}`);
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `画像追加に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddProcedure = async (entry: ProcedureOrderEntry) => {
    setIsMutating(true);
    try {
      await addProcedureOrder(patient.id, {
        ...entry,
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      setProcedureOrders(refreshed.procedureOrders);
      setOrderMessage(`処置を追加しました: ${entry.title}`);
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `処置追加に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleFinishVisit = async () => {
    if (isDirty) {
      setSaveMessage('保存してから診察終了してください');
      return;
    }
    setIsMutating(true);
    try {
      await onPatientStatusChange(
        patient.id,
        '診察終了',
        'カルテ保存後に診察終了へ更新しました。',
      );
      onDataChanged();
      onReturnReception();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setSaveMessage(
        `診察終了の更新に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  return (
    <ChartShell
      topBar={
        <ChartTopBar
          patient={patient}
          currentUser={currentUser}
          isDirty={isDirty}
          isMutating={isMutating}
          saveMessage={saveMessage}
          lastSavedAt={lastSavedAt}
          version={version}
          onSave={handleSave}
          onReturnReception={onReturnReception}
          onFinishVisit={handleFinishVisit}
        />
      }
      left={
        <PatientPane
          patient={patient}
          profile={profile}
          problems={problems}
          visitHistory={visitHistory}
        />
      }
      center={
        <RecordPane
          draft={draft}
          vitals={vitals}
          templates={orderConfig.chartTemplates}
          selectedTemplateId={selectedTemplateId}
          isMutating={isMutating}
          chartHistory={chartHistory}
          prescriptionTimeline={prescriptionTimeline}
          labResults={labResults}
          workspaceError={workspaceError}
          isLoading={isLoading}
          onDraftChange={setDraft}
          onSelectTemplate={setSelectedTemplateId}
          onApplyTemplate={handleApplyTemplate}
          onCopyPrevious={handleCopyPrevious}
        />
      }
      right={
        <OrderPane
          orderConfig={orderConfig}
          prescriptions={prescriptions}
          labOrders={labOrders.map((o) => ({
            status: o.status,
            testName: o.category,
            scheduledAt: o.createdAt,
            result: o.items.join(', '),
          }))}
          imagingOrders={imagingOrders}
          procedureOrders={procedureOrders}
          isMutating={isMutating}
          orderMessage={orderMessage}
          onAddPrescription={handleAddPrescription}
          onAddLab={handleAddLab}
          onAddImaging={handleAddImaging}
          onAddProcedure={handleAddProcedure}
        />
      }
    />
  );
}
