import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addImagingOrder,
  addLabOrder,
  addPrescription,
  addProcedureOrder,
  copyLastPrescriptions,
  getChartOrderConfig,
  getChartWorkspace,
  getLabLongTrends,
  getPrescriptionTimeline,
  isUnauthorizedError,
  saveChart,
  savePatientContext,
  saveReservation,
} from '../lib/api';
import type { PatientRecord, ReceptionStatus } from '../data/chartMock';
import type {
  ChartHistoryEntry,
  ChartMeta,
  ChartOrderConfig,
  ChartTemplate,
  ChartVersion,
  ImagingOrderEntry,
  InpatientAdmission,
  LabLongTrendItem,
  LabResultEntry,
  PatientProfileEntry,
  PrescriptionEntry,
  PrescriptionSetItem,
  PrescriptionTimelineGroup,
  ProblemListItem,
  ProcedureOrderEntry,
  ReservationSlot,
  ScheduledVisit,
  UserSession,
  VisitHistoryEntry,
  VitalEntry,
} from '../types/workflow';
import { ChartShell } from './chart/ChartShell';
import { ChartTopBar } from './chart/ChartTopBar';
import { LabsSheet } from './chart/LabsSheet';
import { NextVisitDialog } from './chart/NextVisitDialog';
import { OrderPane, type OrderTab } from './chart/OrderPane';
import { PatientPane } from './chart/PatientPane';
import { RecordPane } from './chart/RecordPane';
import type { SoapDraft } from './chart/SoapEditor';

type ChartView =
  | 'chart'
  | 'history'
  | 'calendar'
  | 'labs'
  | 'imaging'
  | 'documents'
  | 'reservations'
  | 'search';

const chartTabs: Array<{ value: ChartView; label: string }> = [
  { value: 'chart', label: '診療録' },
  { value: 'history', label: '履歴' },
  { value: 'calendar', label: 'カレンダー' },
  { value: 'labs', label: '検査' },
  { value: 'imaging', label: '画像' },
  { value: 'documents', label: '文書' },
  { value: 'reservations', label: '予約' },
  { value: 'search', label: '検索' },
];

type ChartWorkspaceProps = {
  patient: PatientRecord;
  currentAdmission?: InpatientAdmission;
  availablePatients: PatientRecord[];
  recentPatients: PatientRecord[];
  currentUser: UserSession;
  onAuthExpired: () => void;
  onDataChanged: () => void;
  onOpenPatient: (patient: PatientRecord) => void;
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
  currentAdmission,
  availablePatients,
  recentPatients,
  currentUser,
  onAuthExpired,
  onDataChanged,
  onOpenPatient,
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
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [vitals, setVitals] = useState<VitalEntry[]>([]);
  const [labResults, setLabResults] = useState<LabResultEntry[]>([]);
  const [labLongTrends, setLabLongTrends] = useState<LabLongTrendItem[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderRow[]>([]);
  const [imagingOrders, setImagingOrders] = useState<ImagingOrderEntry[]>([]);
  const [procedureOrders, setProcedureOrders] = useState<ProcedureOrderEntry[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionEntry[]>([]);
  const [prescriptionTimeline, setPrescriptionTimeline] = useState<PrescriptionTimelineGroup[]>(
    [],
  );
  const [activeView, setActiveView] = useState<ChartView>('chart');

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

  // モーダル
  const [labsSheetOpen, setLabsSheetOpen] = useState(false);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [orderDialogTab, setOrderDialogTab] = useState<OrderTab | null>(null);
  const [reservationSlots, setReservationSlots] = useState<ReservationSlot[]>([]);
  const [scheduledVisit, setScheduledVisit] = useState<ScheduledVisit | null>(null);

  const initializedPatientIdRef = useRef<string | null>(null);

  const isDirty =
    draft.subjective !== savedDraft.subjective ||
    draft.objective !== savedDraft.objective ||
    draft.assessment !== savedDraft.assessment ||
    draft.plan !== savedDraft.plan;

  const pendingLabOrders = useMemo(
    () => labOrders.filter((order) => order.status === 'pending'),
    [labOrders],
  );
  const isInpatientChart = Boolean(currentAdmission);
  const activeProblemNames = useMemo(
    () => problems.filter((problem) => problem.status !== 'resolved').map((problem) => problem.name),
    [problems],
  );
  const prioritizedChartTemplates = useMemo(() => {
    return [...orderConfig.chartTemplates].sort((a, b) => {
      const score = (template: ChartTemplate) => {
        const haystack = [template.label, template.subjective, template.objective, template.assessment, template.plan].join(' ');
        const problemMatched = activeProblemNames.some((problem) => problem && haystack.includes(problem));
        return (problemMatched ? 20 : 0) + (template.department === patient.department ? 10 : 0) + (template.department === '共通' ? 4 : 0);
      };
      return score(b) - score(a) || a.label.localeCompare(b.label, 'ja-JP');
    });
  }, [activeProblemNames, orderConfig.chartTemplates, patient.department]);

  // 親コンポーネントへのメタ通知
  useEffect(() => {
    onMetaChange({ isDirty, lastSavedAt, version, pendingWarnings: 0 });
  }, [isDirty, lastSavedAt, onMetaChange, version]);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setWorkspaceError(null);

    try {
      const [workspace, nextOrderConfig, timeline, longTrends] = await Promise.all([
        getChartWorkspace(patient.id),
        getChartOrderConfig({ department: patient.department }),
        getPrescriptionTimeline(patient.id),
        getLabLongTrends(patient.id),
      ]);
      setLabLongTrends(longTrends);
      setReservationSlots(nextOrderConfig.reservationSlots);

      setOrderConfig(nextOrderConfig);
      setSelectedTemplateId(nextOrderConfig.chartTemplates[0]?.id ?? '');
      setProfile(withId(workspace.patientProfile));
      setProblems(withId(workspace.problems));
      setVisitHistory(workspace.visitHistory);
      setChartHistory(workspace.chartHistory);
      setVersions(workspace.versions);
      setVitals(workspace.vitals);
      setLabResults(workspace.labResults);
      setLabOrders(workspace.labOrders);
      setImagingOrders(workspace.imagingOrders);
      setProcedureOrders(workspace.procedureOrders);
      setPrescriptions(workspace.prescriptions);
      setPrescriptionTimeline(timeline);
      setScheduledVisit(workspace.reservation);

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
  }, [onAuthExpired, patient.department, patient.id]);

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
      const created = await addPrescription(patient.id, {
        type: drug.category ?? '内服',
        days,
        drugName: drug.drugName,
        dosage,
        actor: currentUser.displayName,
      });
      const refreshed = await getChartWorkspace(patient.id);
      let attachedWarning = false;
      setPrescriptions(
        refreshed.prescriptions.map((item) => {
          if (!attachedWarning && item.drugName === created.drugName) {
            attachedWarning = true;
            return { ...item, warnings: created.warnings, warningDetails: created.warningDetails };
          }
          return item;
        }),
      );
      setPrescriptionTimeline(await getPrescriptionTimeline(patient.id));
      setOrderMessage(
        created.warnings && created.warnings.length > 0
          ? `処方を追加しました: ${drug.drugName} / 警告 ${created.warnings.length}件`
          : `処方を追加しました: ${drug.drugName}`,
      );
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

  const handleAddPrescriptionsBatch = async (items: PrescriptionSetItem[]) => {
    setIsMutating(true);
    try {
      for (const item of items) {
        const drug = orderConfig.prescriptionCatalog.find((d) => d.id === item.drugId);
        if (!drug) continue;
        await addPrescription(patient.id, {
          type: drug.category ?? '内服',
          days: item.days,
          drugName: drug.drugName,
          dosage: item.dosage,
          actor: currentUser.displayName,
        });
      }
      const refreshed = await getChartWorkspace(patient.id);
      setPrescriptions(refreshed.prescriptions);
      setPrescriptionTimeline(await getPrescriptionTimeline(patient.id));
      setOrderMessage(`セット展開: ${items.length}剤を追加`);
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `セット追加に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
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

  const handleSaveContext = async (
    nextProfile: IdEntry<PatientProfileEntry>[],
    nextProblems: IdEntry<ProblemListItem>[],
  ) => {
    setIsMutating(true);
    try {
      await savePatientContext(patient.id, {
        patientProfile: nextProfile.map(({ id: _id, ...rest }) => rest),
        problems: nextProblems.map(({ id: _id, ...rest }) => rest),
      });
      setProfile(nextProfile);
      setProblems(nextProblems);
      setOrderMessage('患者情報を保存しました');
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setOrderMessage(
        `患者情報保存に失敗: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleFinishVisit = () => {
    if (isDirty) {
      setSaveMessage('保存してから診察終了してください');
      return;
    }
    if (isInpatientChart) {
      void finalizeFinishVisit();
      return;
    }
    setReservationDialogOpen(true);
  };

  const finalizeFinishVisit = async () => {
    setIsMutating(true);
    try {
      if (!isInpatientChart) {
        await onPatientStatusChange(
          patient.id,
          '診察終了',
          'カルテ保存後に診察終了へ更新しました。',
        );
      }
      onDataChanged();
      setReservationDialogOpen(false);
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

  const handleSkipReservation = async () => {
    await finalizeFinishVisit();
  };

  const handleBookReservation = async (slotId: string | null, comment: string) => {
    const slot = slotId ? reservationSlots.find((s) => s.id === slotId) : null;
    if (slotId && !slot) return;
    const linkedLabNote =
      pendingLabOrders.length > 0
        ? `検査予約連動: ${pendingLabOrders
            .map((order) => `${order.category}(${order.items.slice(0, 4).join('/')})`)
            .join('、')}`
        : '';
    const reservationNote = [comment.trim(), linkedLabNote].filter(Boolean).join(' / ');
    setIsMutating(true);
    try {
      const saved = await saveReservation(patient.id, {
        slotId: slot?.id,
        scheduledFor: slot ? `${slot.date} ${slot.time}` : '日未定',
        department: slot?.department ?? currentUser.department,
        doctor: slot?.doctor ?? currentUser.displayName,
        note: reservationNote,
        actor: currentUser.displayName,
      });
      setScheduledVisit({
        slotId: saved.slot_id ?? undefined,
        date: saved.scheduled_for,
        department: `${saved.department} - ${saved.doctor}`,
        doctor: saved.doctor,
        note: saved.note,
      });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setSaveMessage(
        `予約に失敗しました: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
      setIsMutating(false);
      return;
    }
    await finalizeFinishVisit();
  };

  const abnormalLabCount = labResults.filter((r) => r.flag === 'high').length;

  return (
    <>
      <ChartShell
      topBar={
        <ChartTopBar
          patient={patient}
          availablePatients={availablePatients}
          recentPatients={recentPatients}
          currentUser={currentUser}
          isDirty={isDirty}
          isMutating={isMutating}
          saveMessage={saveMessage}
          lastSavedAt={lastSavedAt}
          version={version}
          abnormalLabCount={abnormalLabCount}
          finishLabel={isInpatientChart ? '病棟へ戻る' : '診察終了'}
          modeLabel={isInpatientChart ? `${currentAdmission?.wardName ?? '病棟'} ${currentAdmission?.bedLabel ?? ''}`.trim() : '外来'}
          onOpenPatient={onOpenPatient}
          onSave={handleSave}
          onReturnReception={onReturnReception}
          onFinishVisit={handleFinishVisit}
          onOpenLabs={() => setLabsSheetOpen(true)}
        />
      }
      tabs={
        <nav className="flex h-11 items-end gap-1 px-6" aria-label="カルテ画面">
          {chartTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveView(tab.value)}
              className={`h-full border-b-2 px-4 text-[13px] font-medium transition-colors ${
                activeView === tab.value
                  ? 'border-brand text-brand'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              aria-current={activeView === tab.value ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      }
      left={
        <PatientPane
          patient={patient}
          profile={profile}
          problems={problems}
          visitHistory={visitHistory}
          chartHistory={chartHistory}
          prescriptions={prescriptions}
          labOrders={labOrders}
          imagingOrders={imagingOrders}
          isMutating={isMutating}
          onSaveContext={handleSaveContext}
          onOpenCalendar={() => setActiveView('calendar')}
        />
      }
      center={
        <RecordPane
          patientId={patient.id}
          view={activeView}
          draft={draft}
          authorName={currentUser.displayName}
          department={patient.department}
          isDirty={isDirty}
          vitals={vitals}
          templates={prioritizedChartTemplates}
          selectedTemplateId={selectedTemplateId}
          isMutating={isMutating}
          versions={versions}
          chartHistory={chartHistory}
          prescriptionTimeline={prescriptionTimeline}
          labResults={labResults}
          labLongTrends={labLongTrends}
          labOrders={labOrders}
          imagingOrders={imagingOrders}
          procedureOrders={procedureOrders}
          scheduledVisit={scheduledVisit}
          reservationSlots={reservationSlots}
          workspaceError={workspaceError}
          isLoading={isLoading}
          onDraftChange={setDraft}
          onSelectTemplate={setSelectedTemplateId}
          onApplyTemplate={handleApplyTemplate}
          onCopyPrevious={handleCopyPrevious}
          onAddOrder={setOrderDialogTab}
          onOpenReservation={isInpatientChart ? undefined : () => setReservationDialogOpen(true)}
        />
      }
      right={
        <OrderPane
          orderConfig={orderConfig}
          patientDepartment={patient.department}
          activeProblemNames={activeProblemNames}
          prescriptions={prescriptions}
          labOrders={labOrders}
          imagingOrders={imagingOrders}
          procedureOrders={procedureOrders}
          isMutating={isMutating}
          orderMessage={orderMessage}
          openAddTab={orderDialogTab}
          onOpenAddTabHandled={() => setOrderDialogTab(null)}
          onAddPrescription={handleAddPrescription}
          onAddLab={handleAddLab}
          onAddImaging={handleAddImaging}
          onAddProcedure={handleAddProcedure}
          onAddPrescriptionsBatch={handleAddPrescriptionsBatch}
        />
      }
    />
      <LabsSheet
        open={labsSheetOpen}
        onClose={() => setLabsSheetOpen(false)}
        results={labResults}
        trends={labLongTrends}
      />
      <NextVisitDialog
        open={reservationDialogOpen}
        slots={reservationSlots}
        linkedLabOrders={pendingLabOrders}
        isMutating={isMutating}
        onClose={() => setReservationDialogOpen(false)}
        onSkip={handleSkipReservation}
        onBook={handleBookReservation}
      />
    </>
  );
}
