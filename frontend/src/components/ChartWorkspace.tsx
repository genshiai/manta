import { Calendar, Sparkles, TriangleAlert, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addImagingOrder,
  addLabOrder,
  addPrescription,
  addProcedureOrder,
  copyLastPrescriptions,
  getChartOrderConfig,
  getChartWorkspace,
  getInpatientProgress,
  getLabLongTrends,
  getPrescriptionTimeline,
  isUnauthorizedError,
  listInpatientDocuments,
  saveChart,
  savePatientContext,
  saveReservation,
} from '../lib/api';
import type { AlertItem, PatientRecord, ReceptionStatus } from '../data/chartMock';
import type {
  ChartHistoryEntry,
  ChartMeta,
  ChartOrderConfig,
  ChartTemplate,
  ImagingOrderEntry,
  InpatientAdmission,
  InpatientDocument,
  InpatientProgress,
  LabLongTrendItem,
  LabResultEntry,
  PatientProfileEntry,
  PrescriptionEntry,
  PrescriptionSetItem,
  PrescriptionTimelineGroup,
  ProblemListItem,
  ProcedureOrderEntry,
  ReservationSlot,
  UserSession,
  VitalEntry,
} from '../types/workflow';
import { NextVisitDialog } from './chart/NextVisitDialog';
import { CommandPalette, type CommandAction } from './chart/panels/CommandPalette';
import { LabsMatrix } from './chart/panels/LabsMatrix';
import { PatientSafetyDrawer } from './chart/panels/PatientSafetyDrawer';
import { AiStrip } from './chart/shell/AiStrip';
import { ClinicalShell } from './chart/shell/ClinicalShell';
import { PatientBar } from './chart/shell/PatientBar';
import { TopBar } from './chart/shell/TopBar';
import { InpatientVitalsBand } from './chart/shell/InpatientVitalsBand';
import { Sheet } from './chart/sheet/Sheet';
import { ClinicalLensView } from './chart/sheet/ClinicalLensView';
import {
  buildLabBlock,
  buildTodayBlock,
  buildVisitBlocks,
  computeBillingPreview,
  filterByLens,
  formatDayHeader,
  type Lens,
  type SoapText,
  type StreamBlock,
  type VisitBlock,
} from './chart/sheet/streamModel';
import { buildVitalDays } from './chart/sheet/vitalsModel';
import { OrderComposer } from './chart/work/OrderComposer';
import { AiSummaryCard } from './chart/summary/AiSummaryCard';
import { buildSummary } from './chart/summary/summaryModel';
import { CalendarNavigator } from './chart/panels/CalendarNavigator';
import { ClinicalAidPane } from './chart/panels/ClinicalAidPane';
import { buildProposals, type ProposalAction } from './chart/panels/agentModel';
import { usePins } from './chart/hooks/usePins';
import { useAutosave } from './chart/hooks/useAutosave';
import { readStorage, writeStorage, removeStorage } from '../lib/storage';
import { InlineEditor } from './chart/write/InlineEditor';
import { WriteToolsTray } from './chart/write/WriteToolsTray';
import type { RecentEntry } from './chart/write/slashModel';
import { toast, toastError } from './ui/toast';
import { WorkspaceContextPane } from './workspace/WorkspaceContextPane';

type SoapDraft = SoapText;

type RailTarget = 'reception' | 'ward' | 'billing' | 'messages' | 'settings';

type ChartWorkspaceProps = {
  patient: PatientRecord;
  currentAdmission?: InpatientAdmission;
  availableAdmissions: InpatientAdmission[];
  availablePatients: PatientRecord[];
  recentPatients: PatientRecord[];
  currentUser: UserSession;
  unreadMessageCount: number;
  onAuthExpired: () => void;
  onDataChanged: () => void;
  onOpenPatient: (patient: PatientRecord) => void;
  onReturnReception: () => void;
  onNavigate: (screen: RailTarget) => void;
  onSwitchUser: () => void;
  onMetaChange: (meta: ChartMeta) => void;
  onPatientStatusChange: (
    patientId: string,
    nextStatus: ReceptionStatus,
    detail: string,
  ) => Promise<void>;
};

type LabOrderRow = {
  id: number;
  patientId: string;
  category: string;
  status: 'done' | 'pending' | 'cancelled';
  urgency?: '通常' | '至急';
  items: string[];
  createdAt?: string;
};

type IdEntry<T> = T & { id: string };

const emptyDraft: SoapDraft = { subjective: '', objective: '', assessment: '', plan: '' };

// 未保存の下書きを端末に退避するキー（LOSS-1）。版確定でクリアする。
const draftStorageKey = (patientId: string) => `manta-chart-draft:${patientId}`;
type StoredDraft = { draft: SoapDraft; baseVersion: number };
const draftsEqual = (a: SoapDraft, b: SoapDraft) =>
  a.subjective === b.subjective &&
  a.objective === b.objective &&
  a.assessment === b.assessment &&
  a.plan === b.plan;

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

/** ISO/日付文字列から HH:MM を取り出す。失敗時は原文。 */
const formatClock = (raw: string | null): string => {
  if (!raw) return '—';
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return raw;
};


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
  availableAdmissions,
  availablePatients,
  recentPatients,
  currentUser,
  unreadMessageCount,
  onAuthExpired,
  onDataChanged,
  onOpenPatient,
  onReturnReception,
  onNavigate,
  onSwitchUser,
  onMetaChange,
  onPatientStatusChange,
}: ChartWorkspaceProps) {
  // データ
  const [orderConfig, setOrderConfig] = useState<ChartOrderConfig>(emptyOrderConfig);
  const [profile, setProfile] = useState<IdEntry<PatientProfileEntry>[]>([]);
  const [problems, setProblems] = useState<IdEntry<ProblemListItem>[]>([]);
  const [chartHistory, setChartHistory] = useState<ChartHistoryEntry[]>([]);
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
  // シート表示状態
  const [activeLens, setActiveLens] = useState<Lens>('all');
  const [expandedVisits, setExpandedVisits] = useState<Set<string>>(() => new Set());
  // 今セッションで追加した行為名（新規 chip 判定）
  const [sessionAddedNames, setSessionAddedNames] = useState<Set<string>>(() => new Set());
  const markNew = useCallback((name: string) => {
    setSessionAddedNames((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  }, []);

  // AIサマリー / ピン / 提案（Phase 4）
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [summaryFormat, setSummaryFormat] = useState<'prose' | 'briefing'>('prose');
  const [acceptedProposalIds, setAcceptedProposalIds] = useState<Set<string>>(() => new Set());
  const [dismissedProposalIds, setDismissedProposalIds] = useState<Set<string>>(() => new Set());
  const { pins, toggleLeft, toggleRight } = usePins(currentUser.userId, currentUser.role);
  const sheetScrollRef = useRef<HTMLDivElement>(null);
  // 入院（温度板）データ
  const [admissionProgress, setAdmissionProgress] = useState<InpatientProgress | null>(null);
  const [inpatientDocuments, setInpatientDocuments] = useState<InpatientDocument[]>([]);
  // Write モード（その場展開）
  const [writeMode, setWriteMode] = useState(false);
  // キーマップ用の最新値参照（stale closure 回避）
  const writeModeRef = useRef(writeMode);
  writeModeRef.current = writeMode;
  const keyActionsRef = useRef<{ finishVisit: () => void; finishWriting: () => void }>({
    finishVisit: () => {},
    finishWriting: () => {},
  });

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
  // オーダー系ハンドラの結果メッセージはトーストで通知する（成否をメッセージ内容から判定）。
  const setOrderMessage = useCallback((message: string) => {
    toast(message, /失敗|エラー/.test(message) ? 'error' : 'success');
  }, []);

  // モーダル
  const [labsMatrixOpen, setLabsMatrixOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialQuery, setComposerInitialQuery] = useState('');
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [safetyDrawerOpen, setSafetyDrawerOpen] = useState(false);
  const [patientAlerts, setPatientAlerts] = useState<AlertItem[]>(patient.alerts);
  const [contextSearch, setContextSearch] = useState('');
  const [reservationSlots, setReservationSlots] = useState<ReservationSlot[]>([]);

  const initializedPatientIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPatientAlerts(patient.alerts);
    setSafetyDrawerOpen(false);
  }, [patient.alerts]);

  const patientWithAlerts = useMemo(() => ({ ...patient, alerts: patientAlerts }), [patient, patientAlerts]);

  const openComposer = useCallback((query = '') => {
    setComposerInitialQuery(query);
    setComposerOpen(true);
  }, []);

  const isDirty =
    draft.subjective !== savedDraft.subjective ||
    draft.objective !== savedDraft.objective ||
    draft.assessment !== savedDraft.assessment ||
    draft.plan !== savedDraft.plan;

  // LOSS-1: 未保存の下書きを 3 秒アイドルで端末に退避する（タブを閉じても消えないように）。
  // 未編集に戻ったら退避を消す。版確定時は handleSave で明示的にクリアする。
  useAutosave(JSON.stringify(draft), () => {
    const key = draftStorageKey(patient.id);
    if (isDirty) {
      writeStorage<StoredDraft>(key, { draft, baseVersion: version });
    } else {
      removeStorage(key);
    }
  });

  const pendingLabOrders = useMemo(
    () => labOrders.filter((order) => order.status === 'pending'),
    [labOrders],
  );
  const isInpatientChart = Boolean(currentAdmission);
  const activeProblemNames = useMemo(
    () => problems.filter((problem) => problem.status !== 'resolved').map((problem) => problem.name),
    [problems],
  );

  // 親コンポーネントへのメタ通知
  useEffect(() => {
    onMetaChange({ isDirty, lastSavedAt, version, pendingWarnings: 0 });
  }, [isDirty, lastSavedAt, onMetaChange, version]);

  // キーボードマップ（KARTE_UI_SPEC §10）。⌘K は Phase 7 で追加。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key === 'Enter') {
        event.preventDefault();
        if (writeModeRef.current) keyActionsRef.current.finishWriting();
        else keyActionsRef.current.finishVisit();
        return;
      }
      if (meta) {
        const key = event.key.toLowerCase();
        if (key === 'o') {
          event.preventDefault();
          openComposer();
        } else if (key === 'l') {
          event.preventDefault();
          setLabsMatrixOpen(true);
        } else if (key === 'k') {
          event.preventDefault();
          setCommandOpen(true);
        } else if (key === 'j') {
          event.preventDefault();
          toggleRight();
        } else if (event.key === '\\') {
          event.preventDefault();
          toggleLeft();
        }
        return;
      }
      if (!inField && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        setWriteMode(true);
      } else if (!inField && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const currentIndex = availablePatients.findIndex((item) => item.id === patient.id);
        const nextIndex = event.key === 'ArrowDown'
          ? Math.min(availablePatients.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
        const nextPatient = availablePatients[nextIndex];
        if (nextPatient && nextPatient.id !== patient.id) onOpenPatient(nextPatient);
      } else if (event.key === 'Escape' && calendarOpen) {
        setCalendarOpen(false);
      } else if (event.key === 'Escape' && writeModeRef.current) {
        setWriteMode(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [availablePatients, calendarOpen, onOpenPatient, openComposer, patient.id, toggleLeft, toggleRight]);

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
      // LOSS-1: 同じ版に対する未保存の下書きが端末に残っていれば復元する。
      const baseVersion = latest?.version ?? 0;
      const stored = readStorage<StoredDraft | null>(draftStorageKey(patient.id), null);
      const restorable =
        stored != null && stored.baseVersion === baseVersion && !draftsEqual(stored.draft, nextDraft);
      setDraft(restorable ? stored.draft : nextDraft);
      setSavedDraft(nextDraft);
      setVersion(latest?.version ?? 1);
      setLastSavedAt(latest?.savedAt ?? null);
      setSaveMessage(latest ? '保存済みカルテを読み込みました' : 'カルテはまだ保存されていません');
      if (restorable) {
        toast('未保存の下書きを復元しました', 'info');
      }
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

  // 入院チャートなら患者に固定する温度板と経過データを取得
  useEffect(() => {
    if (!currentAdmission) {
      setAdmissionProgress(null);
      setInpatientDocuments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [progress, documents] = await Promise.all([
          getInpatientProgress(currentAdmission.id),
          listInpatientDocuments(currentAdmission.id),
        ]);
        if (!cancelled) {
          setAdmissionProgress(progress);
          setInpatientDocuments(documents);
        }
      } catch (error) {
        if (isUnauthorizedError(error)) onAuthExpired();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAdmission, onAuthExpired]);

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
      removeStorage(draftStorageKey(patient.id));
      setSaveMessage('保存しました');
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      const message = `保存に失敗しました: ${
        error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
      }`;
      setSaveMessage(message);
      toastError(message);
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

  const handleAddDiagnosis = async (name: string, icd10?: string) => {
    if (problems.some((p) => p.name === name)) return;
    const nextProblem: IdEntry<ProblemListItem> = {
      id: `dx-${Date.now()}`,
      name,
      since: new Date().toISOString().slice(0, 10),
      status: 'active',
      icd10Code: icd10,
    };
    await handleSaveContext(profile, [...problems, nextProblem]);
  };

  const handleFinishVisit = () => {
    if (isDirty) {
      setSaveMessage('保存してから診察終了してください');
      toast('保存してから診察終了してください', 'info');
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
      const message = `診察終了の更新に失敗しました: ${
        error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
      }`;
      setSaveMessage(message);
      toastError(message);
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
      toast(`次回予約を保存しました: ${saved.scheduled_for}`, 'success');
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      const message = `予約に失敗しました: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`;
      setSaveMessage(message);
      toastError(message);
      setIsMutating(false);
      return;
    }
    await finalizeFinishVisit();
  };

  const inpatientProgressRows = useMemo(() => {
    if (!currentAdmission || !admissionProgress) return [];
    const admittedAt = currentAdmission.admittedAt
      ? new Date(currentAdmission.admittedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    return admissionProgress.rows.filter((row) => {
      const rowTime = new Date(row.date).getTime();
      return Number.isNaN(rowTime) || rowTime >= admittedAt;
    }).slice(-14);
  }, [admissionProgress, currentAdmission]);

  // === シート構築（既存データ → 時系列ブロック列） ===
  const streamBlocks = useMemo<StreamBlock[]>(() => {
    const today = buildTodayBlock({
      patientDepartment: patient.department,
      doctor: currentUser.displayName,
      soap: draft,
      version,
      savedAt: lastSavedAt,
      vitals,
      prescriptions,
      labOrders,
      imagingOrders,
      procedureOrders,
      billing: computeBillingPreview({
        hasVisit: true,
        prescriptionCount: prescriptions.length,
        managedProblemCount: activeProblemNames.length,
      }),
      reason: patient.comment || undefined,
      newlyAddedNames: sessionAddedNames,
    });
    const lab = buildLabBlock(labResults);
    const visits = buildVisitBlocks(chartHistory, prescriptionTimeline);

    const inpatientVisits: VisitBlock[] = currentAdmission
      ? inpatientProgressRows
          .map((row, index) => {
            const day = Math.max(1, currentAdmission.stayDays - (inpatientProgressRows.length - 1 - index));
            const { label } = formatDayHeader(row.date);
            const assessment = row.nursingNotes.at(-1)
              ?? row.instructions.at(-1)
              ?? currentAdmission.latestNursingAssessment
              ?? `${currentAdmission.primaryDiagnosis ?? '入院'}の経過を確認。`;
            const categories: Lens[] = ['exam'];
            if (row.labOrders.length) categories.push('lab', 'order');
            if (row.prescriptions.length) categories.push('rx', 'order');
            return {
              kind: 'visit' as const,
              id: `inpatient-${currentAdmission.id}-${row.date}-${index}`,
              dateKey: row.date,
              dateLabel: label,
              meta: `病日${day} · 回診 · ${currentAdmission.attendingDoctor}`,
              categories,
              assessment,
              soap: {
                subjective: row.nursingNotes.join('。'),
                objective: [...row.vitals, ...row.labs].join(' · '),
                assessment,
                plan: [...row.prescriptions, ...row.labOrders, ...row.instructions].join('。'),
              },
              acts: [
                ...row.prescriptions.map((name, actIndex) => ({ id: `ip-rx-${index}-${actIndex}`, kind: 'rx' as const, name })),
                ...row.labOrders.map((name, actIndex) => ({ id: `ip-lab-${index}-${actIndex}`, kind: 'lab' as const, name })),
              ],
              billing: null,
              foldLabel: `S/O 全文${row.prescriptions.length + row.labOrders.length ? ` · オーダー ${row.prescriptions.length + row.labOrders.length}件` : ''}`,
            };
          })
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      : [];

    return [today, ...(lab ? [lab] : []), ...inpatientVisits, ...visits];
  }, [
    patient.department,
    patient.comment,
    currentUser.displayName,
    draft,
    version,
    lastSavedAt,
    vitals,
    prescriptions,
    labOrders,
    imagingOrders,
    procedureOrders,
    activeProblemNames.length,
    labResults,
    chartHistory,
    prescriptionTimeline,
    sessionAddedNames,
    currentAdmission,
    inpatientProgressRows,
  ]);

  const filteredBlocks = useMemo(
    () => filterByLens(streamBlocks, activeLens),
    [streamBlocks, activeLens],
  );

  const inpatientVitalDays = useMemo(
    () => (admissionProgress ? buildVitalDays({ ...admissionProgress, rows: inpatientProgressRows }) : []),
    [admissionProgress, inpatientProgressRows],
  );

  const toggleVisit = useCallback((id: string) => {
    setExpandedVisits((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const insuranceMeta = profile.find((d) => d.label.includes('保険'))?.value;
  const patientMeta = [
    `${patient.age}${patient.age.includes('歳') ? '' : '歳'} ${patient.sex}`,
    patient.id,
    insuranceMeta,
  ]
    .filter(Boolean)
    .join(' · ');

  const saveDot: 'ok' | 'warn' | 'bad' = isDirty ? 'warn' : 'ok';
  const saveText = isDirty
    ? '未保存の変更'
    : lastSavedAt
      ? `保存済み ${formatClock(lastSavedAt)}`
      : saveMessage;

  const summaryUpdatedAt = lastSavedAt ? formatClock(lastSavedAt) : '—';

  useEffect(() => {
    if (!summaryExpanded || writeMode) return;
    requestAnimationFrame(() => {
      sheetScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }, [summaryExpanded, writeMode]);

  // AIサマリー生成コントラクト（v1 ルール生成。§4.4・§13）
  const summary = useMemo(
    () =>
      buildSummary({
        problems,
        labResults,
        chartHistory,
        alerts: patient.alerts,
        todayReason: patient.comment || undefined,
        updatedAt: summaryUpdatedAt,
      }),
    [problems, labResults, chartHistory, patient.alerts, patient.comment, summaryUpdatedAt],
  );

  // エージェント提案（未処理のみ）
  const proposals = useMemo(
    () =>
      buildProposals({
        prescriptions,
        catalog: orderConfig.prescriptionCatalog,
        problems,
        alerts: patient.alerts,
        managedProblemCount: activeProblemNames.length,
        billingAcked: acceptedProposalIds.has('billing-management'),
      }).filter((p) => !dismissedProposalIds.has(p.id)),
    [
      prescriptions,
      orderConfig.prescriptionCatalog,
      problems,
      patient.alerts,
      activeProblemNames.length,
      acceptedProposalIds,
      dismissedProposalIds,
    ],
  );
  const agentCount = Math.max(2, proposals.filter((p) => !acceptedProposalIds.has(p.id)).length);

  const jumpToBlock = useCallback((dateKey: string) => {
    const container = sheetScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-datekey="${CSS.escape(dateKey)}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleProposalAction = (proposalId: string, action: ProposalAction) => {
    switch (action.type) {
      case 'addDiagnosis':
        void handleAddDiagnosis(action.diagnosisName);
        setAcceptedProposalIds((prev) => new Set(prev).add(proposalId));
        break;
      case 'ackBilling':
        setAcceptedProposalIds((prev) => new Set(prev).add(proposalId));
        break;
      case 'openUrl':
        window.open(action.url, '_blank', 'noopener');
        break;
      case 'dismiss':
        setDismissedProposalIds((prev) => new Set(prev).add(proposalId));
        break;
    }
  };

  const visitDates = chartHistory.map((v) => v.date);

  // === Write モード（その場エディタ / ／ / @） ===
  const slashRecents: RecentEntry[] = [];
  const copyableGroup = prescriptionTimeline.find((g) => g.copyable && !g.isToday);
  if (copyableGroup) {
    slashRecents.push({ id: 'do', label: `前回Do処方（${copyableGroup.itemCount}剤）`, sub: `前回 ${copyableGroup.label}` });
  }
  if (orderConfig.labSetOptions[0]) {
    slashRecents.push({
      id: `lab:${orderConfig.labSetOptions[0].id}`,
      label: `${orderConfig.labSetOptions[0].label} セット`,
      sub: `${orderConfig.labSetOptions[0].items.length}項目`,
    });
  }
  if (orderConfig.prescriptionSets[0]) {
    slashRecents.push({
      id: `rx:${orderConfig.prescriptionSets[0].id}`,
      label: orderConfig.prescriptionSets[0].label,
      sub: `${orderConfig.prescriptionSets[0].items.length}剤`,
    });
  }

  const runRecent = (id: string) => {
    if (id === 'do') {
      void handleCopyPrevious();
    } else if (id.startsWith('lab:')) {
      const set = orderConfig.labSetOptions.find((s) => s.id === id.slice(4));
      if (set) {
        markNew(set.label);
        void handleAddLab(set.id, '通常');
      }
    } else if (id.startsWith('rx:')) {
      const set = orderConfig.prescriptionSets.find((s) => s.id === id.slice(3));
      if (set) {
        for (const item of set.items) {
          const drug = orderConfig.prescriptionCatalog.find((d) => d.id === item.drugId);
          if (drug) markNew(drug.drugName);
        }
        void handleAddPrescriptionsBatch(set.items);
      }
    }
  };

  const insertIntoDraft = (section: keyof SoapDraft, text: string) => {
    setDraft((prev) => ({ ...prev, [section]: prev[section] ? `${prev[section]} ${text}` : text }));
  };

  const missingDxCount = prescriptions.filter((rx) => {
    const drug = orderConfig.prescriptionCatalog.find(
      (d) => d.drugName === rx.drugName || rx.drugName.includes(d.drugName),
    );
    return drug?.relatedProblem && !activeProblemNames.some((n) => n.includes(drug.relatedProblem ?? '×'));
  }).length;

  const finishWriting = async () => {
    await handleSave();
    setWriteMode(false);
  };
  keyActionsRef.current.finishVisit = handleFinishVisit;
  keyActionsRef.current.finishWriting = () => {
    void finishWriting();
  };

  const autosaveLabel = `下書き保存（この端末）· v${version} · ${lastSavedAt ? formatClock(lastSavedAt) : '—'}`;
  const todayBlockForEdit = streamBlocks.find((b) => b.kind === 'today') ?? null;

  const commandActions: CommandAction[] = [
    { id: 'compose', label: 'オーダーを追加（コンポーザ）', kbd: '⌘O', run: () => openComposer() },
    { id: 'write', label: '本日の記載を書く', kbd: 'E', run: () => setWriteMode(true) },
    { id: 'labs', label: '検査を表で見る', kbd: '⌘L', run: () => setLabsMatrixOpen(true) },
    { id: 'panel', label: '左パネルを並べる', kbd: '⌘\\', run: toggleLeft },
    { id: 'agent', label: 'エージェントを召喚', kbd: '⌘J', run: toggleRight },
    { id: 'finish', label: isInpatientChart ? '病棟へ戻る' : '診察を終了', run: handleFinishVisit },
  ];
  const commandPatients = [
    ...recentPatients,
    ...availablePatients.filter((p) => !recentPatients.some((r) => r.id === p.id)),
  ];

  return (
    <>
      <ClinicalShell
        activeRail={isInpatientChart ? 'ward' : 'outpatient'}
        userInitial={currentUser.displayName.slice(0, 1)}
        userRole={currentUser.role}
        unreadMessages={unreadMessageCount}
        onNavigate={onNavigate}
        onSwitchUser={onSwitchUser}
        topBar={
          <TopBar
            crumbRoot={isInpatientChart ? '病棟' : '外来'}
            patientName={isInpatientChart ? '入院担当患者' : '今日の患者'}
            crumbTail={patient.name}
            agentCount={agentCount}
            onBack={onReturnReception}
            onOpenSearch={() => setCommandOpen(true)}
            onOpenAgent={toggleRight}
          />
        }
        patientBar={
          <PatientBar
            patient={patientWithAlerts}
            metaLine={patientMeta}
            admissionLabel={currentAdmission ? `入院中 · ${[
              currentAdmission.wardName?.replace(/病棟$/, ''),
              currentAdmission.bedLabel?.replace(/[-‐－].*$/, ''),
            ].filter(Boolean).join(' ')} · 入院${currentAdmission.stayDays}日目` : undefined}
            problemLine={activeProblemNames.join('・')}
            saveDot={saveDot}
            saveText={saveText}
            finishLabel="診察を終了"
            writeMode={writeMode}
            isMutating={isMutating}
            onStartWrite={() => setWriteMode(true)}
            onOpenOrder={() => openComposer()}
            onFinishVisit={handleFinishVisit}
            onFinishWriting={() => void finishWriting()}
            onManageSafety={() => setSafetyDrawerOpen(true)}
          />
        }
        aiStrip={
          <AiStrip
            oneLiner={summary.oneLiner}
            generatedFrom={summary.generatedFrom}
            updatedAt={summary.generatedAt}
            expanded={summaryExpanded}
            onToggle={() => {
              setActiveLens('all');
              setSummaryExpanded((value) => !value);
            }}
          />
        }
        vitalsBand={currentAdmission ? <InpatientVitalsBand admission={currentAdmission} days={inpatientVitalDays} /> : undefined}
        contextCompact={writeMode}
        contextPane={
          writeMode ? (
            <aside className="workspace-context flex w-14 flex-none flex-col items-center gap-2.5 border-r border-border bg-card pt-3">
              <button type="button" title="患者キュー（⌘\\ で展開）" onClick={toggleLeft} className="grid size-9 place-items-center rounded-[9px] text-text-tertiary hover:bg-surface-subtle">
                <User size={18} strokeWidth={1.7} />
              </button>
              <span
                title="注意"
                className={`grid size-9 place-items-center rounded-[9px] ${
                  patient.alerts.length > 0 ? 'bg-destructive-bg text-destructive' : 'text-text-tertiary'
                }`}
              >
                <TriangleAlert size={18} strokeWidth={1.7} />
              </span>
              <button type="button" title="補助情報（⌘J）" onClick={toggleRight} className="grid size-9 place-items-center rounded-[9px] text-text-tertiary hover:bg-surface-subtle">
                <Sparkles size={18} strokeWidth={1.7} />
              </button>
              <button type="button" title="カレンダー" onClick={() => setCalendarOpen((open) => !open)} className="grid size-9 place-items-center rounded-[9px] text-text-tertiary hover:bg-surface-subtle">
                <Calendar size={18} strokeWidth={1.7} />
              </button>
            </aside>
          ) : pins.left ? (
            <WorkspaceContextPane
              activePatientId={patient.id}
              admissions={availableAdmissions}
              communicationThreads={[]}
              onOpenChart={(patientId) => {
                const target = availablePatients.find((item) => item.id === patientId);
                if (target) onOpenPatient(target);
              }}
              onOpenThread={() => {}}
              onSearchChange={setContextSearch}
              patients={availablePatients}
              screen={isInpatientChart ? 'ward' : 'reception'}
              searchQuery={contextSearch}
            />
          ) : undefined
        }
        aidPane={
          writeMode ? (
            <WriteToolsTray
              missingDxCount={missingDxCount}
              labResults={labResults}
              vitals={vitals}
              previousAssessment={chartHistory[0]?.summary}
              onInsert={insertIntoDraft}
            />
          ) : pins.right ? (
            <ClinicalAidPane
              acceptedIds={acceptedProposalIds}
              labs={labResults}
              onClose={toggleRight}
              onProposalAction={handleProposalAction}
              patient={patient}
              admission={currentAdmission}
              admissions={availableAdmissions}
              admissionProgress={admissionProgress}
              problems={problems}
              profile={profile}
              proposals={proposals}
            />
          ) : undefined
        }
      >
        <Sheet
          blocks={filteredBlocks}
          activeLens={activeLens}
          onLensChange={setActiveLens}
          onOpenCalendar={() => setCalendarOpen((open) => !open)}
          onOpenLabs={() => setLabsMatrixOpen(true)}
          onTogglePanels={toggleLeft}
          expandedVisits={expandedVisits}
          onToggleVisit={toggleVisit}
          onCompose={() => openComposer()}
          streamEndLabel={`↓ スクロールで初診まで続く（全 ${streamBlocks.length} 件）`}
          isLoading={isLoading}
          errorMessage={workspaceError}
          scrollRef={sheetScrollRef}
          wide={isInpatientChart}
          calendarPopover={
            calendarOpen ? (
              <CalendarNavigator
                dates={visitDates}
                onClose={() => setCalendarOpen(false)}
                onJump={(date) => {
                  jumpToBlock(date);
                  setCalendarOpen(false);
                }}
              />
            ) : null
          }
          writeEditor={
            writeMode && todayBlockForEdit ? (
              <InlineEditor
                dateLabel={todayBlockForEdit.dateLabel}
                meta={todayBlockForEdit.meta}
                draft={draft}
                onDraftChange={setDraft}
                acts={todayBlockForEdit.acts}
                billing={todayBlockForEdit.billing}
                recents={slashRecents}
                labResults={labResults}
                vitals={vitals}
                autosaveLabel={autosaveLabel}
                onCompose={() => openComposer()}
                onRunRecent={runRecent}
                onCopyPrevious={() => void handleCopyPrevious()}
                onApplyTemplate={handleApplyTemplate}
              />
            ) : undefined
          }
          aiCard={
            !writeMode && summaryExpanded && activeLens === 'all' ? (
              <AiSummaryCard
                summary={summary}
                format={summaryFormat}
                onFormatChange={setSummaryFormat}
                onCollapse={() => setSummaryExpanded(false)}
                onJumpTo={jumpToBlock}
                onAsk={toggleRight}
              />
            ) : null
          }
          lensView={
            !writeMode && ['lab', 'rx', 'order', 'imaging'].includes(activeLens) ? (
              <ClinicalLensView
                lens={activeLens}
                patientId={patient.id}
                labTrends={labLongTrends}
                labResults={labResults}
                prescriptions={prescriptions}
                prescriptionTimeline={prescriptionTimeline}
                labOrders={labOrders}
                imagingOrders={imagingOrders}
                procedureOrders={procedureOrders}
                documents={inpatientDocuments}
                isMutating={isMutating}
                onCompose={openComposer}
                onRepeatAll={() => void handleCopyPrevious()}
                onRepeatMedication={(medication) => {
                  const catalogItem = orderConfig.prescriptionCatalog.find(
                    (item) => item.drugName === medication.drugName || medication.drugName.includes(item.drugName),
                  );
                  if (!catalogItem) {
                    openComposer(medication.drugName);
                    return;
                  }
                  markNew(catalogItem.drugName);
                  void handleAddPrescription(catalogItem.id, medication.dosage, medication.days);
                }}
                onInsertLabs={(snapshots) => {
                  if (snapshots.length === 0) return;
                  setDraft((current) => ({
                    ...current,
                    objective: [current.objective, snapshots.join(' · ')].filter(Boolean).join(' '),
                  }));
                  setWriteMode(true);
                  toast(`${snapshots.length}項目を本日の O 欄へ差し込みました`, 'success');
                }}
              />
            ) : null
          }
        />
      </ClinicalShell>
      <OrderComposer
        open={composerOpen}
        initialQuery={composerInitialQuery}
        onClose={() => {
          setComposerOpen(false);
          setComposerInitialQuery('');
        }}
        orderConfig={orderConfig}
        patient={patientWithAlerts}
        currentUserId={currentUser.userId}
        labResults={labResults}
        activeProblemNames={activeProblemNames}
        prescriptionTimeline={prescriptionTimeline}
        isMutating={isMutating}
        onAddPrescription={(drugId, dosage, days) => {
          const drug = orderConfig.prescriptionCatalog.find((d) => d.id === drugId);
          if (drug) markNew(drug.drugName);
          void handleAddPrescription(drugId, dosage, days);
        }}
        onAddPrescriptionsBatch={(items) => {
          for (const item of items) {
            const drug = orderConfig.prescriptionCatalog.find((d) => d.id === item.drugId);
            if (drug) markNew(drug.drugName);
          }
          void handleAddPrescriptionsBatch(items);
        }}
        onAddLab={(setId, urgency) => {
          const set = orderConfig.labSetOptions.find((s) => s.id === setId);
          if (set) markNew(set.label);
          void handleAddLab(setId, urgency);
        }}
        onAddImaging={(entry) => {
          markNew(entry.category);
          void handleAddImaging(entry);
        }}
        onAddProcedure={(entry) => {
          markNew(entry.title);
          void handleAddProcedure(entry);
        }}
        onCopyPrevious={handleCopyPrevious}
        onAddDiagnosis={handleAddDiagnosis}
      />
      <LabsMatrix open={labsMatrixOpen} onClose={() => setLabsMatrixOpen(false)} trends={labLongTrends} />
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        actions={commandActions}
        patients={commandPatients}
        onOpenPatient={onOpenPatient}
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
      {safetyDrawerOpen ? (
        <PatientSafetyDrawer
          alerts={patientAlerts}
          onAlertsChanged={setPatientAlerts}
          onAuthExpired={onAuthExpired}
          onClose={() => setSafetyDrawerOpen(false)}
          onDataChanged={onDataChanged}
          patientId={patient.id}
        />
      ) : null}
    </>
  );
}
