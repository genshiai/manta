import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  ChipLabel,
  Heading,
  HeadingTitle,
  Input,
  Link,
  Select,
  Textarea,
  buttonBaseStyle,
} from '../vendor/dads';
import {
  nextVisit,
  soap,
  type PatientRecord,
  type ReceptionStatus,
} from '../data/chartMock';
import {
  addLabOrder,
  addImagingOrder,
  addProcedureOrder,
  addPrescription,
  copyLastPrescriptions,
  getChartOrderConfig,
  getChartWorkspace,
  getLabLongTrends,
  getPrescriptionTimeline,
  isUnauthorizedError,
  previewCopyLastPrescriptions,
  saveChart,
  savePatientContext,
  saveReservation,
  searchDiagnoses,
} from '../lib/api';
import { cn } from '../lib/cn';
import {
  readPrescriptionSignals,
  recordPrescriptionSignal,
  type PrescriptionUsageSignal,
} from '../lib/prescriptionSignals';
import { buildPmdaDrugInfoUrl } from '../lib/pmda';
import type {
  ChartOrderConfig,
  ChartMeta,
  ChartHistoryEntry,
  ChartTemplate,
  ChartWorkspaceData,
  ChartVersion,
  ImagingOrderEntry,
  LabLongTrendItem,
  LabSetOption,
  LabResultEntry,
  DiagnosisSearchResult,
  PatientProfileEntry,
  PrescriptionCopyPreview,
  PrescriptionCatalogItem,
  PrescriptionSetItem,
  PrescriptionTimelineGroup,
  PrescriptionSetMaster,
  ProblemListItem,
  ProcedureOrderEntry,
  ReservationSlot,
  ScheduledVisit,
  StandardUsageMaster,
  UserSession,
  VisitHistoryEntry,
  VitalEntry,
} from '../types/workflow';
import { prescriptionDayOptions } from '../data/workflowMock';
import { CalendarIcon, DuplicateIcon, PencilIcon, SaveIcon } from './Icons';
import { SoapSection } from './SoapSection';

type ChartWorkspaceProps = {
  patient: PatientRecord;
  currentUser: UserSession;
  onAuthExpired: () => void;
  onDataChanged: () => void;
  onReturnReception: () => void;
  onMetaChange: (meta: ChartMeta) => void;
  onPatientStatusChange: (patientId: string, nextStatus: ReceptionStatus, detail: string) => Promise<void>;
};

type PrescriptionSetPreviewItem = {
  drugId: string;
  drugName: string;
  dosage: string;
  days: string;
  status: 'ready' | 'warning' | 'blocked';
  messages: string[];
};

type PrescriptionSetPreview = {
  setId: string;
  label: string;
  items: PrescriptionSetPreviewItem[];
};

type LabSetPreview = {
  setId: string;
  label: string;
  items: Array<{ name: string; isDuplicate: boolean }>;
};

type PatientTab = 'chart' | 'history' | 'results' | 'profile';
type OrderTab = 'prescription' | 'lab' | 'imaging' | 'procedure';
type HistoryPrescriptionFilter = 'all' | '内服' | '外用' | '頓服';
type SoapDraft = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type PrescriptionComposerState = {
  drugId: string;
  dosage: string;
  days: string;
};

type LabComposerState = {
  setId: string;
  urgency: '通常' | '至急';
};

type ReservationComposerState = {
  slotId: string;
  comment: string;
};

type ImagingComposerState = {
  category: string;
  status: 'scheduled' | 'draft';
  scheduledAt: string;
  note: string;
};

type ProcedureComposerState = {
  title: string;
  status: 'planned' | 'done';
  note: string;
};

type EditablePatientProfileEntry = PatientProfileEntry & {
  id: string;
};

type EditableProblemListItem = ProblemListItem & {
  id: string;
};

const surfaceClassName = 'rounded-8 border border-solid-gray-200 bg-white';

const tabItemClassName = (active?: boolean) =>
  cn(
    buttonBaseStyle,
    'border-b-2 px-4 pb-3 pt-2 text-[16px] font-bold leading-none transition-colors',
    active
      ? 'border-blue-700 text-blue-900'
      : 'border-transparent text-solid-gray-536 hover:text-solid-gray-900',
  );

const orderFlagColor = (status: 'done' | 'pending') => (status === 'done' ? 'green' : 'yellow');
const labFlagColor = (flag: 'high' | 'normal') => (flag === 'high' ? 'red' : 'green');
const slotStateColor = (state: 'available' | 'few' | 'full') =>
  state === 'available' ? 'green' : state === 'few' ? 'yellow' : 'gray';
const slotStateLabel = (state: 'available' | 'few' | 'full') =>
  state === 'available' ? '空きあり' : state === 'few' ? '残りわずか' : '満枠';
const createEditorId = () => `item-${Math.random().toString(36).slice(2, 10)}`;
const toEditablePatientProfile = (items: PatientProfileEntry[]): EditablePatientProfileEntry[] =>
  items.map((item) => ({ ...item, id: createEditorId() }));
const toEditableProblems = (items: ProblemListItem[]): EditableProblemListItem[] =>
  items.map((item) => ({ ...item, id: createEditorId() }));
const getNextProblemOrdinal = (items: Array<Pick<ProblemListItem, 'name'>>) =>
  items.reduce((max, item) => {
    const matched = item.name.match(/^#(\d+)/);
    if (!matched) {
      return max;
    }

    return Math.max(max, Number(matched[1]));
  }, 0) + 1;
const buildProblemName = (ordinal: number, diseaseName = '') => `#${ordinal}${diseaseName ? ` ${diseaseName}` : ' '}`;
const problemTypeLabel = (value?: ProblemListItem['diagnosisType']) =>
  value === 'principal' ? '主病名' : value === 'secondary' ? '副病名' : '区分未設定';
const problemTypeColor = (value?: ProblemListItem['diagnosisType']) => (value === 'principal' ? 'blue' : 'gray');
const normalizeSearchText = (value: string) => value.normalize('NFKC').toLowerCase().trim();
const parsePrescriptionDays = (value: string | undefined) => value?.match(/(\d+)/)?.[1] ?? '';
const hoursSince = (value?: string) => {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return Number.POSITIVE_INFINITY;
  }

  return (Date.now() - timestamp) / (1000 * 60 * 60);
};
const getPrescriptionSignalBadge = (signal?: PrescriptionUsageSignal) => {
  if (!signal) {
    return null;
  }

  if (hoursSince(signal.lastPrescribedAt) <= 24 * 7) {
    return { label: '最近処方', color: 'yellow' as const };
  }

  if (signal.prescribedCount >= 3 || signal.selectedCount >= 5) {
    return { label: 'よく使う', color: 'green' as const };
  }

  return null;
};
const extractNumericValue = (value: string): number | null => {
  const match = value.replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};
const getLabResultTrendPoints = (result: LabResultEntry): LabResultEntry['history'] =>
  result.history.length > 0
    ? result.history
    : [
        { date: '前回', value: result.previous, flag: result.flag },
        { date: result.reportedAt ?? '今回', value: result.result, flag: result.flag },
      ];
const getLabResultDeltaLabel = (result: LabResultEntry) => {
  const points = getLabResultTrendPoints(result);
  if (points.length < 2) {
    return '比較不可';
  }

  const latestValue = extractNumericValue(points.at(-1)?.value ?? '');
  const previousValue = extractNumericValue(points.at(-2)?.value ?? '');
  if (latestValue === null || previousValue === null) {
    return '比較不可';
  }

  const delta = latestValue - previousValue;
  if (delta === 0) {
    return '±0.0';
  }

  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
};
const getLatestLabReportDate = (results: LabResultEntry[]) =>
  [...results]
    .map((result) => getLabResultTrendPoints(result).at(-1)?.date ?? result.reportedAt)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;
const getDefaultPrescriptionComposer = (
  catalog: PrescriptionCatalogItem[],
  current?: PrescriptionComposerState,
): PrescriptionComposerState => {
  const selectedDrug = catalog.find((item) => item.id === current?.drugId) ?? catalog[0];
  const dosage =
    selectedDrug?.dosageOptions.includes(current?.dosage ?? '') && current?.dosage
      ? current.dosage
      : selectedDrug?.dosageOptions[0] ?? '';

  return {
    drugId: selectedDrug?.id ?? '',
    dosage,
    days: current?.days ?? '28',
  };
};
const getDefaultLabComposer = (options: LabSetOption[], current?: LabComposerState): LabComposerState => ({
  setId: options.some((item) => item.id === current?.setId) ? (current?.setId ?? '') : (options[0]?.id ?? ''),
  urgency: current?.urgency ?? '通常',
});

const buildInitialVersion = (savedBy: string): ChartVersion => ({
  version: 1,
  savedAt: '前回診療',
  savedBy,
  ...soap,
});

const toSoapDraft = (note: ChartVersion | null): SoapDraft =>
  note
    ? {
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
      }
    : soap;

const getReservationFallback = (reservation: ScheduledVisit | null, slots: ReservationSlot[]): ReservationComposerState => ({
  slotId: reservation?.slotId ?? slots.find((slot) => slot.state !== 'full')?.id ?? slots[0]?.id ?? '',
  comment: reservation?.note ?? nextVisit.note,
});
const getDefaultTemplateId = (templates: ChartTemplate[], currentId?: string) =>
  templates.some((item) => item.id === currentId) ? (currentId ?? '') : (templates[0]?.id ?? '');
const mergeTemplateSection = (currentValue: string, templateValue: string) => {
  const normalizedTemplate = templateValue.trim();
  if (!normalizedTemplate) {
    return currentValue;
  }

  const normalizedCurrent = currentValue.trimEnd();
  if (!normalizedCurrent) {
    return normalizedTemplate;
  }

  return normalizedCurrent.includes(normalizedTemplate)
    ? normalizedCurrent
    : `${normalizedCurrent}\n${normalizedTemplate}`;
};

const formatApiMessage = (message: string) => {
  if (message === 'Duplicate prescription') {
    return '同一薬剤チェックで追加できません。';
  }

  if (message === 'Allergy conflict') {
    return 'アレルギーチェックで追加できません。';
  }

  if (message === 'Duplicate lab order') {
    return '検査重複のため追加できません。';
  }

  return message;
};

export const ChartWorkspace = ({
  patient,
  currentUser,
  onAuthExpired,
  onDataChanged,
  onReturnReception,
  onMetaChange,
  onPatientStatusChange,
}: ChartWorkspaceProps) => {
  const [activePatientTab, setActivePatientTab] = useState<PatientTab>('chart');
  const [activeOrderTab, setActiveOrderTab] = useState<OrderTab>('prescription');
  const [draft, setDraft] = useState<SoapDraft>(soap);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState('カルテを読み込み中です');
  const [isDirty, setIsDirty] = useState(false);
  const [version, setVersion] = useState(1);
  const [chartVersions, setChartVersions] = useState<ChartVersion[]>([buildInitialVersion(patient.doctor)]);
  const [currentPatientProfile, setCurrentPatientProfile] = useState<EditablePatientProfileEntry[]>([]);
  const [currentProblems, setCurrentProblems] = useState<EditableProblemListItem[]>([]);
  const [currentVisitHistory, setCurrentVisitHistory] = useState<VisitHistoryEntry[]>([]);
  const [selectedVisitDate, setSelectedVisitDate] = useState('');
  const [currentVitals, setCurrentVitals] = useState<VitalEntry[]>([]);
  const [currentLabResults, setCurrentLabResults] = useState<LabResultEntry[]>([]);
  const [currentLabLongTrends, setCurrentLabLongTrends] = useState<LabLongTrendItem[]>([]);
  const [selectedLabTrendItem, setSelectedLabTrendItem] = useState('');
  const [currentChartHistory, setCurrentChartHistory] = useState<ChartHistoryEntry[]>([]);
  const [currentImagingOrders, setCurrentImagingOrders] = useState<ImagingOrderEntry[]>([]);
  const [currentProcedureOrders, setCurrentProcedureOrders] = useState<ProcedureOrderEntry[]>([]);
  const [currentPrescriptions, setCurrentPrescriptions] = useState<ChartWorkspaceData['prescriptions']>([]);
  const [currentPrescriptionTimeline, setCurrentPrescriptionTimeline] = useState<PrescriptionTimelineGroup[]>([]);
  const [prescriptionCopyPreview, setPrescriptionCopyPreview] = useState<PrescriptionCopyPreview | null>(null);
  const [prescriptionSetPreview, setPrescriptionSetPreview] = useState<PrescriptionSetPreview | null>(null);
  const [labSetPreview, setLabSetPreview] = useState<LabSetPreview | null>(null);
  const [currentLabOrders, setCurrentLabOrders] = useState<ChartWorkspaceData['labOrders']>([]);
  const [orderConfig, setOrderConfig] = useState<ChartOrderConfig>({
    prescriptionCatalog: [],
    standardUsageMasters: [],
    prescriptionSets: [],
    labSetOptions: [],
    reservationSlots: [],
    chartTemplates: [],
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [prescriptionComposer, setPrescriptionComposer] = useState<PrescriptionComposerState>(
    getDefaultPrescriptionComposer([]),
  );
  const [labComposer, setLabComposer] = useState<LabComposerState>(getDefaultLabComposer([]));
  const [imagingComposer, setImagingComposer] = useState<ImagingComposerState>({
    category: '胸部X線',
    status: 'scheduled',
    scheduledAt: '2026/04/21 11:00',
    note: '追加確認待ち',
  });
  const [procedureComposer, setProcedureComposer] = useState<ProcedureComposerState>({
    title: '生活指導',
    status: 'planned',
    note: '次回診察で説明予定',
  });
  const [reservationComposer, setReservationComposer] = useState<ReservationComposerState>(
    getReservationFallback(null, []),
  );
  const [scheduledVisit, setScheduledVisit] = useState<ScheduledVisit>(nextVisit);
  const [orderMessage, setOrderMessage] = useState('処方・検査オーダを読み込み中です');
  const [prescriptionSearchQuery, setPrescriptionSearchQuery] = useState('');
  const [prescriptionCategoryFilter, setPrescriptionCategoryFilter] = useState<'all' | '内服' | '外用' | '頓服'>('all');
  const [prescriptionHistoryFilter, setPrescriptionHistoryFilter] = useState<HistoryPrescriptionFilter>('all');
  const [prescriptionSignals, setPrescriptionSignals] = useState<Record<string, PrescriptionUsageSignal>>({});
  const [imagingMessage, setImagingMessage] = useState('画像オーダーを読み込み中です');
  const [procedureMessage, setProcedureMessage] = useState('処置 / 指導を読み込み中です');
  const [reservationMessage, setReservationMessage] = useState('再診予約を読み込み中です');
  const [contextMessage, setContextMessage] = useState('患者情報を読み込み中です');
  const [diagnosisSearchQuery, setDiagnosisSearchQuery] = useState('');
  const [diagnosisSearchResults, setDiagnosisSearchResults] = useState<DiagnosisSearchResult[]>([]);
  const [diagnosisSearchMessage, setDiagnosisSearchMessage] = useState('標準病名マスターから候補を検索できます');
  const [isSearchingDiagnoses, setIsSearchingDiagnoses] = useState(false);
  const [isContextDirty, setIsContextDirty] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const deferredPrescriptionSearchQuery = useDeferredValue(prescriptionSearchQuery);
  const initializedPatientIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPrescriptionSignals(readPrescriptionSignals(currentUser.userId));
  }, [currentUser.userId]);

  useEffect(() => {
    if (currentLabResults.length === 0) {
      if (selectedLabTrendItem) {
        setSelectedLabTrendItem('');
      }
      return;
    }

    if (!currentLabResults.some((item) => item.item === selectedLabTrendItem)) {
      setSelectedLabTrendItem(currentLabResults[0]?.item ?? '');
    }
  }, [currentLabResults, selectedLabTrendItem]);

  const loadWorkspace = useCallback(async (options?: { preserveDraft?: boolean; preserveContext?: boolean }) => {
    const preserveDraft = options?.preserveDraft ?? false;
    const preserveContext = options?.preserveContext ?? false;

    setIsLoadingWorkspace(true);
    setWorkspaceError(null);

    try {
      const [workspace, nextOrderConfig, prescriptionTimeline, labLongTrends] = await Promise.all([
        getChartWorkspace(patient.id),
        getChartOrderConfig(),
        getPrescriptionTimeline(patient.id),
        getLabLongTrends(patient.id),
      ]);
      const latestNote = workspace.latestNote;
      const nextVersions = workspace.versions.length > 0 ? workspace.versions : [buildInitialVersion(patient.doctor)];

      setOrderConfig(nextOrderConfig);
      setSelectedTemplateId((current) => getDefaultTemplateId(nextOrderConfig.chartTemplates, current));
      setPrescriptionComposer((current) =>
        getDefaultPrescriptionComposer(nextOrderConfig.prescriptionCatalog, current),
      );
      setLabComposer((current) => getDefaultLabComposer(nextOrderConfig.labSetOptions, current));
      setChartVersions(nextVersions);
      setCurrentPrescriptions(workspace.prescriptions);
      setCurrentPrescriptionTimeline(prescriptionTimeline);
      setCurrentLabOrders(workspace.labOrders);
      setCurrentVisitHistory(workspace.visitHistory);
      setSelectedVisitDate((current) =>
        workspace.visitHistory.some((visit) => visit.date === current)
          ? current
          : (workspace.visitHistory.find((visit) => visit.active)?.date ?? workspace.visitHistory[0]?.date ?? ''),
      );
      setCurrentVitals(workspace.vitals);
      setCurrentLabResults(workspace.labResults);
      setCurrentLabLongTrends(labLongTrends);
      setSelectedLabTrendItem((current) =>
        workspace.labResults.some((item) => item.item === current) ? current : (workspace.labResults[0]?.item ?? ''),
      );
      setCurrentChartHistory(workspace.chartHistory);
      setCurrentImagingOrders(workspace.imagingOrders);
      setCurrentProcedureOrders(workspace.procedureOrders);
      setScheduledVisit(workspace.reservation ?? nextVisit);
      setReservationComposer(getReservationFallback(workspace.reservation, nextOrderConfig.reservationSlots));
      setVersion(latestNote?.version ?? nextVersions[0]?.version ?? 1);
      setLastSavedAt(latestNote?.savedAt ?? null);

      if (!preserveDraft) {
        setDraft(toSoapDraft(latestNote));
        setIsDirty(false);
        setSaveMessage(latestNote ? '保存済みカルテを読み込みました' : 'カルテはまだ保存されていません');
      }

      if (!preserveContext) {
        setCurrentPatientProfile(toEditablePatientProfile(workspace.patientProfile));
        setCurrentProblems(toEditableProblems(workspace.problems));
        setIsContextDirty(false);
        setContextMessage('患者プロファイルとプロブレムを表示しています');
      }

      setOrderMessage('処方・検査オーダを更新できます');
      setImagingMessage('画像オーダーを更新できます');
      setProcedureMessage('処置 / 指導を更新できます');
      setReservationMessage('再診予約を更新できます');
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
      setSaveMessage('カルテ取得に失敗しました');
      setOrderMessage('オーダ取得に失敗しました');
      setImagingMessage('画像オーダーの取得に失敗しました');
      setProcedureMessage('処置 / 指導の取得に失敗しました');
      setReservationMessage('予約取得に失敗しました');
      setContextMessage('患者情報の取得に失敗しました');
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [onAuthExpired, patient.doctor, patient.id]);

  useEffect(() => {
    if (initializedPatientIdRef.current === patient.id) {
      return;
    }

    initializedPatientIdRef.current = patient.id;
    setActivePatientTab('chart');
    setActiveOrderTab('prescription');
    setOrderConfig({
      prescriptionCatalog: [],
      standardUsageMasters: [],
      prescriptionSets: [],
      labSetOptions: [],
      reservationSlots: [],
      chartTemplates: [],
    });
    setSelectedTemplateId('');
    setPrescriptionComposer(getDefaultPrescriptionComposer([]));
    setLabComposer(getDefaultLabComposer([]));
    setImagingComposer({
      category: '胸部X線',
      status: 'scheduled',
      scheduledAt: '2026/04/21 11:00',
      note: '追加確認待ち',
    });
    setProcedureComposer({
      title: '生活指導',
      status: 'planned',
      note: '次回診察で説明予定',
    });
    setDiagnosisSearchQuery('');
    setDiagnosisSearchResults([]);
    setDiagnosisSearchMessage('標準病名マスターから候補を検索できます');
    setPrescriptionSearchQuery('');
    setPrescriptionCategoryFilter('all');
    setPrescriptionHistoryFilter('all');
    setSelectedVisitDate('');
    setCurrentPrescriptionTimeline([]);
    setPrescriptionCopyPreview(null);
    setPrescriptionSetPreview(null);
    setLabSetPreview(null);
    setCurrentLabLongTrends([]);
    loadWorkspace();
  }, [loadWorkspace, patient.id]);

  const selectedDrug = useMemo(
    () => orderConfig.prescriptionCatalog.find((item) => item.id === prescriptionComposer.drugId) ?? null,
    [orderConfig.prescriptionCatalog, prescriptionComposer.drugId],
  );
  const selectedDrugPmdaUrl = selectedDrug?.pmdaInfoUrl ?? buildPmdaDrugInfoUrl(selectedDrug?.yjCode);
  const selectedLabSet = useMemo(
    () => orderConfig.labSetOptions.find((item) => item.id === labComposer.setId) ?? null,
    [labComposer.setId, orderConfig.labSetOptions],
  );
  const resolvePrescriptionSetItems = useCallback(
    (setId: string, visited = new Set<string>()): PrescriptionSetItem[] => {
      if (visited.has(setId)) {
        return [];
      }
      const targetSet = orderConfig.prescriptionSets.find((item) => item.id === setId);
      if (!targetSet) {
        return [];
      }
      const nextVisited = new Set(visited).add(setId);
      return [
        ...targetSet.includedSetIds.flatMap((includedSetId) =>
          resolvePrescriptionSetItems(includedSetId, nextVisited),
        ),
        ...targetSet.items,
      ];
    },
    [orderConfig.prescriptionSets],
  );
  const resolveLabSetItems = useCallback(
    (setId: string, visited = new Set<string>()): string[] => {
      if (visited.has(setId)) {
        return [];
      }
      const targetSet = orderConfig.labSetOptions.find((item) => item.id === setId);
      if (!targetSet) {
        return [];
      }
      const nextVisited = new Set(visited).add(setId);
      return [
        ...targetSet.includedSetIds.flatMap((includedSetId) => resolveLabSetItems(includedSetId, nextVisited)),
        ...targetSet.items,
      ].filter((item, index, items) => items.indexOf(item) === index);
    },
    [orderConfig.labSetOptions],
  );
  const selectedLabSetItems = useMemo(
    () => (selectedLabSet ? resolveLabSetItems(selectedLabSet.id) : []),
    [resolveLabSetItems, selectedLabSet],
  );
  const selectedSlot = useMemo(
    () => orderConfig.reservationSlots.find((item) => item.id === reservationComposer.slotId) ?? null,
    [orderConfig.reservationSlots, reservationComposer.slotId],
  );
  const selectedTemplate = useMemo(
    () => orderConfig.chartTemplates.find((item) => item.id === selectedTemplateId) ?? null,
    [orderConfig.chartTemplates, selectedTemplateId],
  );
  const standardUsageById = useMemo(
    () =>
      new Map<string, StandardUsageMaster>(
        orderConfig.standardUsageMasters.map((item) => [item.id, item]),
      ),
    [orderConfig.standardUsageMasters],
  );
  const selectedDrugUsage = selectedDrug?.standardUsageCode
    ? standardUsageById.get(selectedDrug.standardUsageCode) ?? null
    : null;
  const selectedDrugDosageOptions = useMemo(() => {
    if (!selectedDrug) {
      return [];
    }

    const nextOptions = [...selectedDrug.dosageOptions];
    if (selectedDrugUsage?.instruction && !nextOptions.includes(selectedDrugUsage.instruction)) {
      nextOptions.unshift(selectedDrugUsage.instruction);
    }
    return nextOptions;
  }, [selectedDrug, selectedDrugUsage]);
  const filteredPrescriptionCatalog = useMemo(() => {
    const query = normalizeSearchText(deferredPrescriptionSearchQuery);
    const normalizedProblemNames = currentProblems.map((item) => normalizeSearchText(item.name.replace(/^#\d+\s*/, '')));

    const matches = orderConfig.prescriptionCatalog.filter((item) => {
      if (prescriptionCategoryFilter !== 'all' && item.category !== prescriptionCategoryFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystacks = [
        item.drugName,
        item.genericName ?? '',
        item.nameKana ?? '',
        item.yjCode ?? '',
        item.hotCode ?? '',
        item.dosageForm ?? '',
        item.strength ?? '',
        item.relatedProblem ?? '',
        item.category,
        ...item.dosageOptions,
        ...(item.aliases ?? []),
      ].map((value) => normalizeSearchText(value));
      return haystacks.some((value) => value.includes(query));
    });

    return matches.sort((left, right) => {
      const scoreDrug = (drug: PrescriptionCatalogItem) => {
        const normalizedDrugName = normalizeSearchText(drug.drugName);
        const normalizedGenericName = normalizeSearchText(drug.genericName ?? '');
        const normalizedRelatedProblem = normalizeSearchText(drug.relatedProblem?.replace(/^#\d+\s*/, '') ?? '');
        const normalizedAliases = (drug.aliases ?? []).map((item) => normalizeSearchText(item));
        const normalizedCodes = [drug.yjCode ?? '', drug.hotCode ?? ''].map((item) => normalizeSearchText(item));
        const signal = prescriptionSignals[drug.id];
        const matchedCurrentProblem = normalizedRelatedProblem
          ? normalizedProblemNames.some((item) => item === normalizedRelatedProblem || item.includes(normalizedRelatedProblem))
          : false;
        const exactDrugMatch = query && normalizedDrugName === query ? 1000 : 0;
        const prefixDrugMatch = query && normalizedDrugName.startsWith(query) ? 300 : 0;
        const containsDrugMatch = query && normalizedDrugName.includes(query) ? 140 : 0;
        const exactGenericMatch = query && normalizedGenericName === query ? 800 : 0;
        const prefixGenericMatch = query && normalizedGenericName.startsWith(query) ? 220 : 0;
        const aliasBoost = query && normalizedAliases.some((item) => item.includes(query)) ? 180 : 0;
        const codeBoost = query && normalizedCodes.some((item) => item.startsWith(query)) ? 320 : 0;
        const relatedProblemBoost = matchedCurrentProblem ? 180 : 0;
        const selectedBoost = (signal?.selectedCount ?? 0) * 18;
        const prescribedBoost = (signal?.prescribedCount ?? 0) * 42;
        const recentSelectedBoost = hoursSince(signal?.lastSelectedAt) <= 24 * 7 ? 80 : 0;
        const recentPrescribedBoost = hoursSince(signal?.lastPrescribedAt) <= 24 * 14 ? 140 : 0;
        const sameDrugContinuationBoost = currentPrescriptions.some((item) => item.drugName === drug.drugName) ? 120 : 0;

        return (
          exactDrugMatch +
          prefixDrugMatch +
          containsDrugMatch +
          exactGenericMatch +
          prefixGenericMatch +
          aliasBoost +
          codeBoost +
          relatedProblemBoost +
          selectedBoost +
          prescribedBoost +
          recentSelectedBoost +
          recentPrescribedBoost +
          sameDrugContinuationBoost
        );
      };

      const scoreDiff = scoreDrug(right) - scoreDrug(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return normalizeSearchText(left.drugName).localeCompare(normalizeSearchText(right.drugName), 'ja');
    });
  }, [
    currentPrescriptions,
    currentProblems,
    deferredPrescriptionSearchQuery,
    orderConfig.prescriptionCatalog,
    prescriptionCategoryFilter,
    prescriptionSignals,
  ]);
  const prescriptionSetSuggestions = useMemo(() => {
    const normalizedProblems = currentProblems.map((item) => normalizeSearchText(item.name.replace(/^#\d+\s*/, '')));
    return [...orderConfig.prescriptionSets].sort((left, right) => {
      const scoreSet = (item: PrescriptionSetMaster) => {
        const normalizedProblem = normalizeSearchText(item.relatedProblem?.replace(/^#\d+\s*/, '') ?? '');
        const problemBoost =
          normalizedProblem && normalizedProblems.some((problem) => problem === normalizedProblem || problem.includes(normalizedProblem))
            ? 260
            : 0;
        const departmentBoost = item.department === patient.department ? 60 : 0;
        const sizeBoost = Math.min(resolvePrescriptionSetItems(item.id).length * 10, 50);
        return problemBoost + departmentBoost + sizeBoost;
      };

      const scoreDiff = scoreSet(right) - scoreSet(left);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    });
  }, [currentProblems, orderConfig.prescriptionSets, patient.department, resolvePrescriptionSetItems]);
  const filteredPrescriptionHistory = useMemo(
    () =>
      currentPrescriptionTimeline
        .map((group) => ({
          ...group,
          items: group.items.filter((item) =>
            prescriptionHistoryFilter === 'all' ? true : item.type === prescriptionHistoryFilter,
          ),
        }))
        .filter((group) => group.items.length > 0),
    [currentPrescriptionTimeline, prescriptionHistoryFilter],
  );
  const medicationLongTimeline = useMemo(() => {
    const grouped = new Map<
      string,
      {
        drugName: string;
        category: string;
        firstDate: string;
        lastDate: string;
        occurrences: number;
        latestDosage: string;
        latestDays: string;
        warningCount: number;
        pmdaInfoUrl?: string;
      }
    >();

    for (const group of currentPrescriptionTimeline) {
      for (const item of group.items) {
        if (prescriptionHistoryFilter !== 'all' && item.type !== prescriptionHistoryFilter) {
          continue;
        }
        const existing = grouped.get(item.drugName);
        if (!existing) {
          grouped.set(item.drugName, {
            drugName: item.drugName,
            category: item.type,
            firstDate: group.date,
            lastDate: group.date,
            occurrences: 1,
            latestDosage: item.dosage,
            latestDays: item.days,
            warningCount: item.warnings.length,
            pmdaInfoUrl: item.pmdaInfoUrl,
          });
          continue;
        }

        existing.firstDate = group.date < existing.firstDate ? group.date : existing.firstDate;
        existing.lastDate = group.date > existing.lastDate ? group.date : existing.lastDate;
        existing.occurrences += 1;
        existing.warningCount += item.warnings.length;
        if (group.date >= existing.lastDate) {
          existing.latestDosage = item.dosage;
          existing.latestDays = item.days;
          existing.pmdaInfoUrl = item.pmdaInfoUrl;
        }
      }
    }

    return [...grouped.values()].sort((left, right) => right.lastDate.localeCompare(left.lastDate, 'ja'));
  }, [currentPrescriptionTimeline, prescriptionHistoryFilter]);
  const latestCopyablePrescriptionGroup = useMemo(
    () => currentPrescriptionTimeline.find((group) => group.copyable) ?? null,
    [currentPrescriptionTimeline],
  );
  const selectedVisitHistory = useMemo(
    () =>
      currentVisitHistory.find((visit) => visit.date === selectedVisitDate) ??
      currentVisitHistory.find((visit) => visit.active) ??
      currentVisitHistory[0] ??
      null,
    [currentVisitHistory, selectedVisitDate],
  );
  const prescriptionSelectOptions = useMemo(() => {
    const base = filteredPrescriptionCatalog.length > 0 ? filteredPrescriptionCatalog : orderConfig.prescriptionCatalog;
    if (selectedDrug && !base.some((item) => item.id === selectedDrug.id)) {
      return [selectedDrug, ...base];
    }
    return base;
  }, [filteredPrescriptionCatalog, orderConfig.prescriptionCatalog, selectedDrug]);
  const prescriptionSuggestions = useMemo(() => prescriptionSelectOptions.slice(0, 6), [prescriptionSelectOptions]);
  const allergyConflictLabel = selectedDrug?.allergyConflictLabel;
  const latestMatchingPrescription = useMemo(
    () => (selectedDrug ? currentPrescriptions.find((item) => item.drugName === selectedDrug.drugName) ?? null : null),
    [currentPrescriptions, selectedDrug],
  );
  const prescriptionAutofillHint = latestMatchingPrescription
    ? `前回入力を使用: ${latestMatchingPrescription.dosage} / ${latestMatchingPrescription.days}`
    : selectedDrug
      ? selectedDrugUsage
        ? `${selectedDrugUsage.label} を初期値に使用します`
        : '標準候補の先頭用法を使用します'
      : '薬剤を選択してください';

  const prescriptionWarnings = [
    allergyConflictLabel &&
    patient.alerts.some((alert) => alert.label.includes(allergyConflictLabel))
      ? `${allergyConflictLabel} のため追加できません。`
      : null,
    selectedDrug &&
    currentPrescriptions.some((item) => item.drugName === selectedDrug.drugName)
      ? '同一薬剤チェックにより、同名処方が既に存在します。'
      : null,
    selectedDrug?.relatedProblem &&
    !currentProblems.some((problem) => problem.name === selectedDrug.relatedProblem)
      ? `関連病名 ${selectedDrug.relatedProblem} を確認してください。`
      : null,
  ].filter(Boolean) as string[];

  const prescriptionSetPreviewReadyCount =
    prescriptionSetPreview?.items.filter((item) => item.status !== 'blocked').length ?? 0;
  const prescriptionSetPreviewBlockedCount =
    prescriptionSetPreview?.items.filter((item) => item.status === 'blocked').length ?? 0;
  const labSetPreviewDuplicateCount = labSetPreview?.items.filter((item) => item.isDuplicate).length ?? 0;

  const labWarnings = [
    selectedLabSet &&
    currentLabOrders.some((order) => selectedLabSetItems.some((item) => order.items.includes(item)))
      ? '同日内で同一検査項目の重複が疑われます。'
      : null,
    labComposer.urgency === '至急' ? '至急指定です。採血導線を再確認してください。' : null,
  ].filter(Boolean) as string[];

  const reservationWarnings = [
    selectedSlot?.state === 'full' ? 'この予約枠は満枠です。別の時間を選択してください。' : null,
  ].filter(Boolean) as string[];
  const activeVisit = currentVisitHistory.find((visit) => visit.active) ?? currentVisitHistory[0] ?? null;
  const workQueueWarningsCount = prescriptionWarnings.length + labWarnings.length + reservationWarnings.length;
  const abnormalLabCount = currentLabResults.filter((result) => result.flag === 'high').length;
  const latestLabReportDate = useMemo(() => getLatestLabReportDate(currentLabResults), [currentLabResults]);
  const hba1cTrend = useMemo(() => {
    const hba1c = currentLabResults.find((result) => result.item.includes('HbA1c'));
    if (!hba1c) {
      return { label: 'データなし', accent: 'blue' as const };
    }

    const currentValue = extractNumericValue(hba1c.result);
    const previousValue = extractNumericValue(hba1c.previous);
    if (currentValue === null || previousValue === null) {
      return { label: 'データなし', accent: 'blue' as const };
    }

    const delta = currentValue - previousValue;
    if (delta === 0) {
      return { label: 'HbA1c ±0.0', accent: 'blue' as const };
    }

    return {
      label: `HbA1c ${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
      accent: delta < 0 ? ('green' as const) : ('red' as const),
    };
  }, [currentLabResults]);
  const labTrendSummaries = useMemo(
    () =>
      currentLabResults.map((result) => {
        return {
          ...result,
          deltaLabel: getLabResultDeltaLabel(result),
        };
      }),
    [currentLabResults],
  );
  const selectedLabResult = useMemo(
    () => currentLabResults.find((result) => result.item === selectedLabTrendItem) ?? currentLabResults[0] ?? null,
    [currentLabResults, selectedLabTrendItem],
  );
  const selectedLabLongTrend = useMemo(
    () =>
      selectedLabResult
        ? currentLabLongTrends.find((trend) => trend.item === selectedLabResult.item) ?? null
        : currentLabLongTrends[0] ?? null,
    [currentLabLongTrends, selectedLabResult],
  );
  const longTrendSummary = useMemo(() => {
    const trackedItems = currentLabLongTrends.filter((trend) => trend.pointCount >= 2).length;
    const abnormalPoints = currentLabLongTrends.reduce((sum, trend) => sum + trend.abnormalCount, 0);
    return { trackedItems, abnormalPoints };
  }, [currentLabLongTrends]);

  useEffect(() => {
    onMetaChange({
      isDirty,
      lastSavedAt,
      version,
      pendingWarnings: prescriptionWarnings.length + labWarnings.length + reservationWarnings.length,
    });
  }, [
    isDirty,
    labWarnings.length,
    lastSavedAt,
    onMetaChange,
    prescriptionWarnings.length,
    reservationWarnings.length,
    version,
  ]);

  const updateDraft = (field: keyof SoapDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
    setIsDirty(true);
    setSaveMessage('未保存の変更があります');
  };

  const handleSave = async () => {
    setIsMutating(true);

    try {
      const result = await saveChart(patient.id, {
        ...draft,
        savedBy: currentUser.displayName,
      });

      setVersion(result.version);
      setLastSavedAt(
        new Date(result.saved_at).toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
      setIsDirty(false);
      setSaveMessage(`カルテを保存しました (v${result.version})`);
      await loadWorkspace({ preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setSaveMessage(
        `カルテ保存に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopyPrevious = () => {
    const latestVersion = chartVersions[0] ?? buildInitialVersion(patient.doctor);

    setDraft({
      subjective: latestVersion.subjective,
      objective: latestVersion.objective,
      assessment: latestVersion.assessment,
      plan: latestVersion.plan,
    });
    setIsDirty(true);
    setSaveMessage('前回カルテを複写しました');
  };

  const handleApplyTemplate = () => {
    if (!selectedTemplate) {
      setSaveMessage('テンプレートを選択してください');
      return;
    }

    setDraft((current) => ({
      subjective: mergeTemplateSection(current.subjective, selectedTemplate.subjective),
      objective: mergeTemplateSection(current.objective, selectedTemplate.objective),
      assessment: mergeTemplateSection(current.assessment, selectedTemplate.assessment),
      plan: mergeTemplateSection(current.plan, selectedTemplate.plan),
    }));
    setIsDirty(true);
    setSaveMessage(`${selectedTemplate.label} をSOAPに挿入しました`);
  };

  const handleRestoreVersion = (history: ChartVersion) => {
    setDraft({
      subjective: history.subjective,
      objective: history.objective,
      assessment: history.assessment,
      plan: history.plan,
    });
    setActivePatientTab('chart');
    setIsDirty(true);
    setSaveMessage(`保存版 v${history.version} を本日の記載欄へ読み込みました。保存するまでは確定されません。`);
  };

  const handleAddPrescription = async () => {
    if (!selectedDrug || !prescriptionComposer.dosage) {
      setOrderMessage('薬剤と用法を選択してください。');
      return;
    }

    if (prescriptionWarnings.some((warning) => warning.includes('追加できません') || warning.includes('同一薬剤'))) {
      setOrderMessage('処方チェックにより追加を中止しました。');
      return;
    }

    setIsMutating(true);

    try {
      await addPrescription(patient.id, {
        type: selectedDrug.category,
        days: `${prescriptionComposer.days}日分`,
        drugName: selectedDrug.drugName,
        dosage: prescriptionComposer.dosage,
        actor: currentUser.displayName,
      });
      setPrescriptionSignals(recordPrescriptionSignal(currentUser.userId, selectedDrug.id, 'prescribed'));
      setOrderMessage(`${selectedDrug.drugName} を ${prescriptionComposer.days} 日分で追加しました。`);
      await loadWorkspace({ preserveDraft: true, preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setOrderMessage(
        `処方追加に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const applyPrescriptionComposer = (
    drug: PrescriptionCatalogItem,
    options?: {
      preferredDosage?: string;
      preferredDays?: string;
      sourceLabel?: string;
    },
  ) => {
    const previousForDrug = currentPrescriptions.find((item) => item.drugName === drug.drugName) ?? null;
    const usageMaster = drug.standardUsageCode ? standardUsageById.get(drug.standardUsageCode) ?? null : null;
    const dosageOptions = [...drug.dosageOptions];
    if (usageMaster?.instruction && !dosageOptions.includes(usageMaster.instruction)) {
      dosageOptions.unshift(usageMaster.instruction);
    }
    const preferredDays = options?.preferredDays && prescriptionDayOptions.includes(options.preferredDays)
      ? options.preferredDays
      : parsePrescriptionDays(previousForDrug?.days) ||
        usageMaster?.defaultDays ||
        drug.defaultDays ||
        (drug.category === '頓服' ? '14' : '28');
    const preferredDosage =
      options?.preferredDosage && dosageOptions.includes(options.preferredDosage)
        ? options.preferredDosage
        : previousForDrug?.dosage && dosageOptions.includes(previousForDrug.dosage)
          ? previousForDrug.dosage
          : usageMaster?.instruction || dosageOptions[0] || '';

    setPrescriptionComposer({
      drugId: drug.id,
      dosage: preferredDosage,
      days: preferredDays,
    });
    setPrescriptionSearchQuery(drug.drugName);
    setOrderMessage(
      options?.sourceLabel
        ? `${options.sourceLabel}: ${drug.drugName} を入力欄へ反映しました。`
        : `${drug.drugName} を選択し、用法を自動入力しました。`,
    );
  };

  const buildPrescriptionSetPreview = (setId: string): PrescriptionSetPreview | null => {
    const targetSet = orderConfig.prescriptionSets.find((item) => item.id === setId);
    if (!targetSet) {
      return null;
    }

    const items = resolvePrescriptionSetItems(targetSet.id).map((setItem) => {
      const drug = orderConfig.prescriptionCatalog.find((item) => item.id === setItem.drugId);
      if (!drug) {
        return {
          drugId: setItem.drugId,
          drugName: `${setItem.drugId}(未登録)`,
          dosage: setItem.dosage,
          days: setItem.days,
          status: 'blocked' as const,
          messages: ['処方候補 master に未登録です。'],
        };
      }

      const messages = [
        currentPrescriptions.some((item) => item.drugName === drug.drugName)
          ? '同一薬剤が現在処方にあります。'
          : null,
        drug.allergyConflictLabel &&
        patient.alerts.some((alert) => alert.label.includes(drug.allergyConflictLabel ?? ''))
          ? `${drug.allergyConflictLabel} のため追加できません。`
          : null,
        drug.relatedProblem && !currentProblems.some((problem) => problem.name === drug.relatedProblem)
          ? `関連病名 ${drug.relatedProblem} を確認してください。`
          : null,
      ].filter(Boolean) as string[];
      const hasBlockingMessage = messages.some((message) => message.includes('追加できません') || message.includes('同一薬剤'));

      return {
        drugId: setItem.drugId,
        drugName: drug.drugName,
        dosage: setItem.dosage,
        days: setItem.days,
        status: hasBlockingMessage ? 'blocked' as const : messages.length > 0 ? 'warning' as const : 'ready' as const,
        messages,
      };
    });

    return { setId: targetSet.id, label: targetSet.label, items };
  };

  const handlePreviewPrescriptionSet = (setId: string) => {
    const preview = buildPrescriptionSetPreview(setId);
    if (!preview) {
      return;
    }

    setPrescriptionSetPreview(preview);
    setOrderMessage(
      `${preview.label} の展開前確認: 追加可能 ${preview.items.filter((item) => item.status !== 'blocked').length} 剤 / ブロック ${preview.items.filter((item) => item.status === 'blocked').length} 剤`,
    );
  };

  const handleApplyPrescriptionSet = async (setId: string, allowedDrugIds?: Set<string>) => {
    const targetSet = orderConfig.prescriptionSets.find((item) => item.id === setId);
    if (!targetSet) {
      return;
    }

    setIsMutating(true);

    let successCount = 0;
    const failedDrugNames: string[] = [];
    let nextSignals = prescriptionSignals;

    try {
      const expandedItems = resolvePrescriptionSetItems(targetSet.id);
      for (const setItem of expandedItems) {
        if (allowedDrugIds && !allowedDrugIds.has(setItem.drugId)) {
          continue;
        }

        const drug = orderConfig.prescriptionCatalog.find((item) => item.id === setItem.drugId);
        if (!drug) {
          failedDrugNames.push(`${setItem.drugId}(未登録)`);
          continue;
        }

        try {
          await addPrescription(patient.id, {
            type: drug.category,
            days: `${setItem.days}日分`,
            drugName: drug.drugName,
            dosage: setItem.dosage,
            actor: currentUser.displayName,
          });
          nextSignals = recordPrescriptionSignal(currentUser.userId, drug.id, 'prescribed');
          successCount += 1;
        } catch (error) {
          failedDrugNames.push(
            `${drug.drugName}: ${error instanceof Error ? formatApiMessage(error.message) : '失敗'}`,
          );
        }
      }

      setPrescriptionSignals(nextSignals);
      setPrescriptionSetPreview(null);
      if (successCount > 0) {
        await loadWorkspace({ preserveDraft: true, preserveContext: true });
        onDataChanged();
      }

      if (successCount === 0) {
        setOrderMessage(`${targetSet.label} は追加できませんでした。${failedDrugNames.join(' / ')}`);
      } else if (failedDrugNames.length > 0) {
        setOrderMessage(
          `${targetSet.label} を ${successCount} 剤追加しました。一部失敗: ${failedDrugNames.join(' / ')}`,
        );
      } else {
        setOrderMessage(`${targetSet.label} を ${successCount} 剤まとめて追加しました。`);
      }
    } finally {
      setIsMutating(false);
    }
  };

  const handlePreviewPrescriptionCopy = async (group?: PrescriptionTimelineGroup | null) => {
    const sourceGroup = group ?? latestCopyablePrescriptionGroup;
    if (!sourceGroup) {
      setOrderMessage('複写できる過去処方がありません。');
      return;
    }

    setIsMutating(true);

    try {
      const preview = await previewCopyLastPrescriptions(patient.id, {
        actor: currentUser.displayName,
        sourceDate: sourceGroup.date,
      });
      setPrescriptionCopyPreview(preview);
      setOrderMessage(
        `${sourceGroup.label} の複写前確認: 追加予定 ${preview.plannedCount} 剤 / スキップ ${preview.skippedCount} 剤`,
      );
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setOrderMessage(`処方複写プレビューに失敗しました: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`);
    } finally {
      setIsMutating(false);
    }
  };

  const handleCopyPrescriptionGroup = async (group?: PrescriptionTimelineGroup | null) => {
    const sourceDate = group?.date ?? prescriptionCopyPreview?.sourceDate ?? latestCopyablePrescriptionGroup?.date;
    if (!sourceDate) {
      setOrderMessage('複写できる過去処方がありません。');
      return;
    }

    setIsMutating(true);

    try {
      const result = await copyLastPrescriptions(patient.id, {
        actor: currentUser.displayName,
        sourceDate,
      });
      let nextSignals = prescriptionSignals;
      for (const item of result.copiedItems) {
        const drug = orderConfig.prescriptionCatalog.find((catalogItem) => catalogItem.drugName === item.drugName);
        if (drug) {
          nextSignals = recordPrescriptionSignal(currentUser.userId, drug.id, 'prescribed');
        }
      }

      setPrescriptionSignals(nextSignals);
      setCurrentPrescriptionTimeline(result.timeline);
      setPrescriptionCopyPreview(null);
      if (result.copiedCount > 0) {
        await loadWorkspace({ preserveDraft: true, preserveContext: true });
        onDataChanged();
      }

      if (result.copiedCount === 0) {
        setOrderMessage(
          `${result.sourceDate} 処方は再利用できませんでした。${result.skippedItems
            .map((item) => `${item.drugName}: ${item.reason}`)
            .join(' / ')}`,
        );
      } else if (result.skippedCount > 0) {
        setOrderMessage(
          `${result.sourceDate} 処方を ${result.copiedCount} 剤追加しました。一部スキップ: ${result.skippedItems
            .map((item) => item.drugName)
            .join(' / ')}`,
        );
      } else {
        setOrderMessage(`${result.sourceDate} 処方を ${result.copiedCount} 剤まとめて再利用しました。`);
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setOrderMessage(
        `前回処方の一括複写に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleSelectPrescriptionDrug = (drugId: string) => {
    const nextDrug = orderConfig.prescriptionCatalog.find((item) => item.id === drugId);
    if (!nextDrug) {
      return;
    }
    setPrescriptionSignals(recordPrescriptionSignal(currentUser.userId, nextDrug.id, 'selected'));
    const previous = currentPrescriptions.find((item) => item.drugName === nextDrug.drugName) ?? null;
    applyPrescriptionComposer(nextDrug, {
      preferredDosage: previous?.dosage,
      preferredDays: parsePrescriptionDays(previous?.days),
      sourceLabel: previous ? '前回処方を自動反映' : '処方候補を選択',
    });
  };

  const handleCopyPrescriptionToComposer = (drugName: string, dosage: string, days: string) => {
    const matchedDrug = orderConfig.prescriptionCatalog.find((item) => item.drugName === drugName);
    if (!matchedDrug) {
      setOrderMessage(`${drugName} は処方候補 master に未登録です。`);
      return;
    }

    setPrescriptionSignals(recordPrescriptionSignal(currentUser.userId, matchedDrug.id, 'selected'));
    applyPrescriptionComposer(matchedDrug, {
      preferredDosage: dosage,
      preferredDays: parsePrescriptionDays(days),
      sourceLabel: '既存処方を複写',
    });
  };

  const handlePreviewLabSet = () => {
    if (!selectedLabSet) {
      setOrderMessage('検査セットを選択してください。');
      return;
    }

    const items = selectedLabSetItems.map((name) => ({
      name,
      isDuplicate: currentLabOrders.some((order) => order.items.includes(name)),
    }));
    setLabSetPreview({
      setId: selectedLabSet.id,
      label: selectedLabSet.label,
      items,
    });
    setOrderMessage(
      `${selectedLabSet.label} の展開前確認: ${items.length} 項目 / 重複 ${items.filter((item) => item.isDuplicate).length} 項目`,
    );
  };

  const handleAddLabOrder = async () => {
    if (!selectedLabSet) {
      setOrderMessage('検査セットを選択してください。');
      return;
    }

    if (selectedLabSetItems.length === 0) {
      setOrderMessage(`${selectedLabSet.label} に展開できる検査項目がありません。`);
      return;
    }

    if (labWarnings.some((warning) => warning.includes('重複'))) {
      setOrderMessage('検査重複のため追加を中止しました。');
      return;
    }

    setIsMutating(true);

    try {
      await addLabOrder(patient.id, {
        category: selectedLabSet.label,
        urgency: labComposer.urgency,
            items: selectedLabSetItems,
        actor: currentUser.displayName,
      });
      setOrderMessage(`${selectedLabSet.label} を${labComposer.urgency}で追加しました。`);
      setLabSetPreview(null);
      await loadWorkspace({ preserveDraft: true, preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setOrderMessage(
        `検査追加に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleSaveReservation = async () => {
    if (!selectedSlot || selectedSlot.state === 'full') {
      setReservationMessage('満枠以外の予約枠を選択してください。');
      return;
    }

    setIsMutating(true);

    try {
      await saveReservation(patient.id, {
        slotId: selectedSlot.id,
        scheduledFor: `${selectedSlot.date} ${selectedSlot.time}`,
        department: selectedSlot.department,
        doctor: selectedSlot.doctor,
        note: reservationComposer.comment || '再診フォロー',
        actor: currentUser.displayName,
      });
      setReservationMessage('再診予約を更新しました。');
      await loadWorkspace({ preserveDraft: true, preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setReservationMessage(
        `再診予約の更新に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddImagingOrder = async () => {
    if (!imagingComposer.category.trim() || !imagingComposer.scheduledAt.trim()) {
      setImagingMessage('検査種別と予定日時を入力してください。');
      return;
    }

    setIsMutating(true);

    try {
      await addImagingOrder(patient.id, {
        category: imagingComposer.category.trim(),
        status: imagingComposer.status,
        scheduledAt: imagingComposer.scheduledAt.trim(),
        note: imagingComposer.note.trim() || '補足なし',
        actor: currentUser.displayName,
      });
      setImagingMessage(`${imagingComposer.category.trim()} を追加しました。`);
      await loadWorkspace({ preserveDraft: true, preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setImagingMessage(
        `画像オーダー追加に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleAddProcedureOrder = async () => {
    if (!procedureComposer.title.trim()) {
      setProcedureMessage('処置 / 指導名を入力してください。');
      return;
    }

    setIsMutating(true);

    try {
      await addProcedureOrder(patient.id, {
        title: procedureComposer.title.trim(),
        status: procedureComposer.status,
        note: procedureComposer.note.trim() || '補足なし',
        actor: currentUser.displayName,
      });
      setProcedureMessage(`${procedureComposer.title.trim()} を追加しました。`);
      await loadWorkspace({ preserveDraft: true, preserveContext: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setProcedureMessage(
        `処置 / 指導の追加に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const handleCompleteVisit = async () => {
    if (isDirty) {
      setSaveMessage('保存してから診察終了してください');
      return;
    }

    if (isContextDirty) {
      setActivePatientTab('profile');
      setContextMessage('患者情報を保存してから診察終了してください');
      return;
    }

    setIsMutating(true);

    try {
      await onPatientStatusChange(patient.id, '診察終了', 'カルテ保存後に診察終了へ更新しました。');
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

  const updatePatientProfileEntry = (index: number, field: keyof PatientProfileEntry, value: string) => {
    setCurrentPatientProfile((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const addPatientProfileEntry = () => {
    setCurrentPatientProfile((current) => [...current, { id: createEditorId(), label: '', value: '' }]);
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const removePatientProfileEntry = (index: number) => {
    setCurrentPatientProfile((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const updateProblem = (index: number, field: keyof ProblemListItem, value: string) => {
    setCurrentProblems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]:
                field === 'managementNumber' || field === 'icd10Code' || field === 'diagnosisType'
                  ? value || undefined
                  : value,
            }
          : item,
      ),
    );
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const addProblem = () => {
    setCurrentProblems((current) => [
      ...current,
      {
        id: createEditorId(),
        name: buildProblemName(getNextProblemOrdinal(current)),
        since: '',
        status: 'active',
        diagnosisType: current.some((item) => item.diagnosisType === 'principal') ? 'secondary' : 'principal',
      },
    ]);
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const removeProblem = (index: number) => {
    setCurrentProblems((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
  };

  const handleSearchDiagnoses = async () => {
    const query = diagnosisSearchQuery.trim();
    if (!query) {
      setDiagnosisSearchResults([]);
      setDiagnosisSearchMessage('病名または ICD10 コードを入力してください');
      return;
    }

    setIsSearchingDiagnoses(true);

    try {
      const results = await searchDiagnoses(query, 10);
      setDiagnosisSearchResults(results);
      setDiagnosisSearchMessage(results.length > 0 ? `${results.length} 件ヒットしました` : '候補が見つかりませんでした');
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setDiagnosisSearchResults([]);
      setDiagnosisSearchMessage(
        `病名検索に失敗しました: ${error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'}`,
      );
    } finally {
      setIsSearchingDiagnoses(false);
    }
  };

  const addDiagnosisProblem = (diagnosis: DiagnosisSearchResult) => {
    const alreadyExists = currentProblems.some(
      (item) =>
        item.managementNumber === diagnosis.managementNumber ||
        item.name.replace(/^#\d+\s*/, '') === diagnosis.diseaseName,
    );
    if (alreadyExists) {
      setDiagnosisSearchMessage(`${diagnosis.diseaseName} はすでに登録されています`);
      return;
    }

    const nextOrdinal = getNextProblemOrdinal(currentProblems);
    const now = new Date();
    const defaultSince = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')} 〜`;
    setCurrentProblems((current) => [
      ...current,
      {
        id: createEditorId(),
        name: buildProblemName(nextOrdinal, diagnosis.diseaseName),
        since: defaultSince,
        status: 'active',
        managementNumber: diagnosis.managementNumber,
        icd10Code: diagnosis.icd10Code,
        diagnosisType: current.some((item) => item.diagnosisType === 'principal') ? 'secondary' : 'principal',
      },
    ]);
    setIsContextDirty(true);
    setContextMessage('患者情報に未保存の変更があります');
    setDiagnosisSearchMessage(`${diagnosis.diseaseName} をプロブレムに追加しました`);
  };

  const handleSavePatientContext = async () => {
    const normalizedPatientProfile = currentPatientProfile.filter(
      (item) => item.label.trim() !== '' || item.value.trim() !== '',
    );
    const normalizedProblems = currentProblems.filter((item) => item.name.trim() !== '');

    setIsMutating(true);

    try {
      await savePatientContext(patient.id, {
        patientProfile: normalizedPatientProfile.map((item) => ({
          label: item.label.trim(),
          value: item.value.trim(),
        })),
        problems: normalizedProblems.map((item) => ({
          name: item.name.trim(),
          since: item.since.trim(),
          status: item.status,
          managementNumber: item.managementNumber,
          icd10Code: item.icd10Code,
          diagnosisType: item.diagnosisType,
        })),
      });
      setContextMessage('患者情報を保存しました');
      setIsContextDirty(false);
      await loadWorkspace({ preserveDraft: true });
      onDataChanged();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setContextMessage(
        `患者情報の保存に失敗しました: ${
          error instanceof Error ? formatApiMessage(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsMutating(false);
    }
  };

  const patientTabs: Array<{ key: PatientTab; label: string }> = [
    { key: 'chart', label: '本日の記載' },
    { key: 'history', label: '過去カルテ' },
    { key: 'results', label: '検査結果' },
    { key: 'profile', label: '患者情報' },
  ];

  const orderTabs: Array<{ key: OrderTab; label: string }> = [
    { key: 'prescription', label: '処方' },
    { key: 'lab', label: '検査' },
    { key: 'imaging', label: '画像' },
    { key: 'procedure', label: '処置' },
  ];

  return (
    <>
      <section className='sticky top-0 z-20 border-b border-solid-gray-200 bg-white/95 backdrop-blur'>
        <div className='mx-auto grid max-w-[1760px] gap-3 px-3 py-3 lg:px-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center'>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-x-3 gap-y-2'>
              <p className='text-[20px] font-bold leading-snug text-solid-gray-900'>{patient.name}</p>
              <p className='text-mono-14N-150 text-solid-gray-536'>
                {patient.age} {patient.sex} / ID: {patient.id}
              </p>
              <ChipLabel color='blue' variant='filled-outline'>
                {patient.status}
              </ChipLabel>
              <ChipLabel color={isDirty || isContextDirty ? 'orange' : 'green'} variant='filled-outline'>
                {isDirty || isContextDirty ? '未保存あり' : '保存済み'}
              </ChipLabel>
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              <ChipLabel color='gray' variant='filled-outline'>
                {patient.department}
              </ChipLabel>
              <ChipLabel color='gray' variant='filled-outline'>
                担当: {patient.doctor}
              </ChipLabel>
              {activeVisit ? (
                <ChipLabel color='cyan' variant='filled-outline'>
                  {activeVisit.date} / {activeVisit.department}
                </ChipLabel>
              ) : null}
              {patient.alerts.map((alert) => (
                <ChipLabel color={alert.color} key={alert.label} variant='filled-outline'>
                  {alert.label}
                </ChipLabel>
              ))}
            </div>
          </div>

          <nav className='flex flex-wrap gap-4 border-b border-solid-gray-200 xl:justify-end'>
            {patientTabs.map((item) => (
              <button
                className={tabItemClassName(activePatientTab === item.key)}
                key={item.key}
                onClick={() => setActivePatientTab(item.key)}
                type='button'
              >
                {item.label}
              </button>
            ))}
          </nav>

          <Button onClick={onReturnReception} size='xs' type='button' variant='text'>
            受付へ戻る
          </Button>
        </div>
      </section>

      <div className='mx-auto grid max-w-[1760px] gap-4 px-3 py-4 lg:grid-cols-[14.5rem_minmax(0,1fr)_19.5rem] lg:px-4 xl:grid-cols-[16rem_minmax(0,1fr)_25rem]'>
        <aside className='flex flex-col gap-3'>
          <section className={cn(surfaceClassName, 'p-4')}>
            <div className='flex items-start gap-3'>
              <div className='grid h-10 w-10 place-items-center rounded-full bg-blue-50 text-[20px] font-bold leading-snug text-blue-900'>
                {patient.name.slice(0, 1)}
              </div>
              <div className='flex-1'>
                <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>{patient.name}</p>
                <p className='text-mono-14N-150 text-solid-gray-536'>ID: {patient.id}</p>
              </div>
              <ChipLabel color={patient.sex === '女性' ? 'red' : 'blue'} variant='filled-outline'>
                {patient.sex === '女性' ? '女' : '男'}
              </ChipLabel>
            </div>

            <dl className='mt-3 grid gap-2 border-t border-solid-gray-200 pt-3'>
              {patient.demographics.map((detail) => (
                <div className='flex items-start justify-between gap-3' key={detail.label}>
                  <dt className='text-[14px] font-normal leading-none text-solid-gray-536'>{detail.label}</dt>
                  <dd className='text-right text-[16px] font-normal leading-none text-solid-gray-900'>{detail.value}</dd>
                </div>
              ))}
            </dl>

            <div className='mt-3 flex flex-wrap gap-2 border-t border-solid-gray-200 pt-3'>
              <ChipLabel color='blue' variant='filled-outline'>
                利用者: {currentUser.displayName}
              </ChipLabel>
              <ChipLabel color={currentUser.role === '管理者' ? 'purple' : 'green'} variant='filled-outline'>
                {currentUser.role}
              </ChipLabel>
              <ChipLabel color='gray' variant='filled-outline'>
                版数 v{version}
              </ChipLabel>
            </div>
          </section>

          <section className={cn(surfaceClassName, 'p-4')}>
            <div className='mb-3 flex items-center justify-between'>
              <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>過去受診</h2>
              <Button onClick={() => setActivePatientTab('history')} size='xs' type='button' variant='text'>
                全体
              </Button>
            </div>
            <div className='flex flex-col gap-2'>
              {currentVisitHistory.length > 0 ? (
                currentVisitHistory.map((visit) => (
                  <button
                    className={cn(
                      buttonBaseStyle,
                      'rounded-8 border px-3 py-2 text-left transition-colors',
                      visit.date === selectedVisitHistory?.date
                        ? 'border-blue-900 bg-blue-50'
                        : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                    )}
                    key={`${visit.date}-${visit.summary}`}
                    onClick={() => {
                      setSelectedVisitDate(visit.date);
                      setActivePatientTab('history');
                    }}
                    type='button'
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <span className='text-mono-14B-150 text-solid-gray-900'>{visit.date}</span>
                      <ChipLabel color='blue' variant='filled-outline'>
                        {visit.department}
                      </ChipLabel>
                    </div>
                    <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-700'>{visit.summary}</p>
                  </button>
                ))
              ) : (
                <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                  受診履歴はまだ登録されていません。
                </div>
              )}
            </div>
          </section>

          <section className={cn(surfaceClassName, 'p-4')}>
            <h2 className='mb-3 text-[18px] font-bold leading-snug text-solid-gray-900'>プロブレムリスト</h2>
            <div className='flex flex-col gap-3'>
              {currentProblems.length > 0 ? (
                currentProblems.map((problem) => (
                  <div
                    className='flex items-start gap-3 rounded-8 border border-solid-gray-200 bg-white px-3 py-2'
                    key={problem.id}
                  >
                    <span
                      className={cn(
                        'mt-2 h-2.5 w-2.5 rounded-full',
                        problem.status === 'active' ? 'bg-green-600' : 'bg-solid-gray-300',
                      )}
                    />
                    <div>
                      <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{problem.name}</p>
                      <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{problem.since}</p>
                      <div className='mt-2 flex flex-wrap gap-2'>
                        <ChipLabel color={problemTypeColor(problem.diagnosisType)} variant='filled-outline'>
                          {problemTypeLabel(problem.diagnosisType)}
                        </ChipLabel>
                        {problem.icd10Code ? (
                          <ChipLabel color='gray' variant='filled-outline'>
                            ICD10 {problem.icd10Code}
                          </ChipLabel>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                  登録済みのプロブレムはありません。
                </div>
              )}
            </div>
          </section>
        </aside>

        <main className='min-w-0 space-y-4'>
          <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
            <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
              <div className='space-y-3'>
                <Heading size='24'>
                  <HeadingTitle level='h1'>
                    {activePatientTab === 'chart'
                      ? '本日の記載'
                      : activePatientTab === 'history'
                        ? '過去カルテ'
                        : activePatientTab === 'results'
                          ? '検査結果'
                          : '患者情報'}
                  </HeadingTitle>
                </Heading>
                <div className='flex flex-wrap gap-2'>
                  <ChipLabel color='blue' variant='filled-outline'>
                    2026年4月14日（火） {patient.department}
                  </ChipLabel>
                  <ChipLabel color='gray' variant='filled-outline'>
                    担当: {patient.doctor}
                  </ChipLabel>
                  <ChipLabel color={isDirty ? 'orange' : 'green'} variant='filled-outline'>
                    {isDirty ? '未保存' : '保存済み'}
                  </ChipLabel>
                  <ChipLabel color='purple' variant='filled-outline'>
                    版数 v{version}
                  </ChipLabel>
                  {isContextDirty ? (
                    <ChipLabel color='orange' variant='filled-outline'>
                      患者情報未保存
                    </ChipLabel>
                  ) : null}
                  {isLoadingWorkspace ? (
                    <ChipLabel color='cyan' variant='filled-outline'>
                      読込中
                    </ChipLabel>
                  ) : null}
                </div>
                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>
                  {saveMessage}
                  {lastSavedAt ? ` / 最終保存 ${lastSavedAt}` : ''}
                </p>
                {workspaceError ? (
                  <p className='text-[14px] font-normal leading-none text-red-900'>{workspaceError}</p>
                ) : null}
              </div>

              <div className='flex min-w-0 flex-col gap-2 xl:min-w-[18rem]'>
                {orderConfig.chartTemplates.length > 0 ? (
                  <Select
                    blockSize='md'
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    value={selectedTemplateId}
                  >
                    {orderConfig.chartTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label} / {template.department}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <div className='flex flex-wrap gap-2'>
                  <Button aria-disabled={isMutating} onClick={handleApplyTemplate} size='sm' type='button' variant='outline'>
                    <PencilIcon className='h-4 w-4' />
                    テンプレート挿入
                  </Button>
                  <Button aria-disabled={isMutating} onClick={handleCopyPrevious} size='sm' type='button' variant='outline'>
                    <DuplicateIcon className='h-4 w-4' />
                    前回複写
                  </Button>
                  <Button aria-disabled={isMutating} onClick={handleSave} size='sm' type='button' variant='solid-fill'>
                    <SaveIcon className='h-4 w-4' />
                    保存
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {activePatientTab === 'chart' ? (
            <>
              <section className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
                <MetricCard
                  accent='blue'
                  label='直近受診'
                  value={currentVisitHistory[0]?.date ?? '履歴なし'}
                />
                <MetricCard
                  accent={abnormalLabCount > 0 ? 'red' : 'green'}
                  label='異常検査'
                  value={`${abnormalLabCount}件`}
                />
                <MetricCard
                  accent='blue'
                  label='継続処方'
                  value={`${currentPrescriptions.length}剤`}
                />
                <MetricCard
                  accent={workQueueWarningsCount > 0 ? 'red' : 'green'}
                  label='作業キュー警告'
                  value={`${workQueueWarningsCount}件`}
                />
              </section>

              {selectedTemplate ? (
                <section className={cn(surfaceClassName, 'p-4')}>
                  <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                    <div>
                      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>テンプレートプレビュー</p>
                      <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                        選択したテンプレートを現在の SOAP に追記します。
                      </p>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <ChipLabel color='blue' variant='filled-outline'>
                        {selectedTemplate.label}
                      </ChipLabel>
                      <ChipLabel color='gray' variant='filled-outline'>
                        {selectedTemplate.department}
                      </ChipLabel>
                    </div>
                  </div>
                  <div className='mt-4 grid gap-4 md:grid-cols-2'>
                    <TemplatePreviewCard label='S' title='主観的情報' value={selectedTemplate.subjective} />
                    <TemplatePreviewCard label='O' title='客観的情報' value={selectedTemplate.objective} />
                    <TemplatePreviewCard label='A' title='評価' value={selectedTemplate.assessment} />
                    <TemplatePreviewCard label='P' title='計画' value={selectedTemplate.plan} />
                  </div>
                </section>
              ) : null}

              <SoapSection accentClassName='bg-solid-gray-800' label='S' title='主観的情報（Subjective）'>
                <Textarea
                  className='w-full'
                  onChange={(event) => updateDraft('subjective', event.target.value)}
                  rows={6}
                  value={draft.subjective}
                />
              </SoapSection>

              <SoapSection accentClassName='bg-solid-gray-800' label='O' title='客観的情報（Objective）'>
                <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                  {currentVitals.length > 0 ? (
                    currentVitals.map((vital) => (
                      <div
                        className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 px-4 py-4'
                        key={vital.label}
                      >
                        <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{vital.label}</p>
                        <p className='mt-2 text-mono-16B-150 text-solid-gray-900'>{vital.value}</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{vital.unit}</p>
                      </div>
                    ))
                  ) : (
                    <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536 md:col-span-2 xl:col-span-3'>
                      バイタルはまだ記録されていません。
                    </div>
                  )}
                </div>

                <Textarea
                  className='w-full'
                  onChange={(event) => updateDraft('objective', event.target.value)}
                  rows={5}
                  value={draft.objective}
                />

                <ResultsTable reportDate={latestLabReportDate} results={currentLabResults} />
              </SoapSection>

              <SoapSection accentClassName='bg-solid-gray-800' label='A' title='評価（Assessment）'>
                <Textarea
                  className='w-full'
                  onChange={(event) => updateDraft('assessment', event.target.value)}
                  rows={8}
                  value={draft.assessment}
                />
              </SoapSection>

              <SoapSection accentClassName='bg-solid-gray-800' label='P' title='計画（Plan）'>
                <Textarea
                  className='w-full'
                  onChange={(event) => updateDraft('plan', event.target.value)}
                  rows={7}
                  value={draft.plan}
                />
              </SoapSection>
            </>
          ) : null}

          {activePatientTab === 'history' ? (
            <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
              <div className='space-y-6'>
                <section className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                  <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                    <div>
                      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>過去カルテの見方</p>
                      <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                        新しい受診日から順にスクロールして確認します。各日付には診療サマリ・薬歴・検査オーダの要点だけを表示し、保存版や全期間リストは必要なときだけ開けます。
                      </p>
                    </div>
                    <Button onClick={() => setActivePatientTab('chart')} size='xs' type='button' variant='outline'>
                      本日の記載へ戻る
                    </Button>
                  </div>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <ChipLabel color='blue' variant='filled-outline'>
                      受診 {currentVisitHistory.length}件
                    </ChipLabel>
                    <ChipLabel color='blue' variant='filled-outline'>
                      保存版 {chartVersions.length}版
                    </ChipLabel>
                    <ChipLabel color='blue' variant='filled-outline'>
                      薬歴 {medicationLongTimeline.length}剤
                    </ChipLabel>
                    <ChipLabel color='green' variant='filled-outline'>
                      検査 {currentLabOrders.length}件
                    </ChipLabel>
                    <ChipLabel color='gray' variant='filled-outline'>
                      サマリ {currentChartHistory.length}件
                    </ChipLabel>
                  </div>
                </section>

                <section className='space-y-3'>
                  <div className='flex flex-col gap-1'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>時系列</p>
                    <p className='text-[14px] font-normal leading-none text-solid-gray-536'>
                      新しい受診日から順に、診療サマリ・薬歴・検査オーダの要点だけを表示します。
                    </p>
                  </div>
                  <div className='space-y-3'>
                    {currentVisitHistory.map((visit) => {
                      const datePrescriptionGroup =
                        currentPrescriptionTimeline.find((group) => group.date === visit.date) ?? null;
                      const dateChartSummaries = currentChartHistory.filter((history) => history.date === visit.date);
                      const dateLabOrders = currentLabOrders.filter((order) => order.createdAt?.startsWith(visit.date));
                      return (
                        <article
                          className={cn(
                            'rounded-8 border bg-white p-4',
                            visit.active ? 'border-blue-200 bg-blue-50' : 'border-solid-gray-200',
                          )}
                          key={`${visit.date}-${visit.department}-${visit.summary}`}
                        >
                          <div className='flex flex-col gap-2 md:flex-row md:items-start md:justify-between'>
                            <div>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='text-mono-16B-150 text-solid-gray-900'>{visit.date}</span>
                                <ChipLabel color='gray' variant='filled-outline'>
                                  {visit.department}
                                </ChipLabel>
                                {visit.active ? (
                                  <ChipLabel color='green' variant='filled-outline'>
                                    今回
                                  </ChipLabel>
                                ) : null}
                              </div>
                              <p className='mt-2 text-[16px] font-bold leading-none text-solid-gray-900'>{visit.summary}</p>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                              <ChipLabel color='blue' variant='filled-outline'>
                                薬歴 {datePrescriptionGroup?.items.length ?? 0}
                              </ChipLabel>
                              <ChipLabel color='green' variant='filled-outline'>
                                検査 {dateLabOrders.length}
                              </ChipLabel>
                              <ChipLabel color='gray' variant='filled-outline'>
                                サマリ {dateChartSummaries.length}
                              </ChipLabel>
                            </div>
                          </div>

                          <div className='mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'>
                            <div className='space-y-2'>
                              {dateChartSummaries.length > 0 ? (
                                dateChartSummaries.slice(0, 2).map((history) => (
                                  <div key={`${history.date}-${history.title}`}>
                                    <p className='text-[14px] font-bold leading-none text-solid-gray-900'>{history.title}</p>
                                    <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-700'>{history.summary}</p>
                                  </div>
                                ))
                              ) : (
                                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>診療サマリは未登録です。</p>
                              )}
                            </div>

                            <div className='space-y-2'>
                              {datePrescriptionGroup?.items.slice(0, 3).map((item) => (
                                <div className='flex flex-wrap items-center gap-2 text-[14px] font-normal leading-none' key={`${visit.date}-${item.drugName}-${item.dosage}`}>
                                  <ChipLabel color='gray' variant='filled-outline'>
                                    {item.type}
                                  </ChipLabel>
                                  <span className='text-solid-gray-900'>{item.drugName}</span>
                                  <span className='text-solid-gray-536'>{item.days}</span>
                                </div>
                              ))}
                              {dateLabOrders.slice(0, 2).map((order) => (
                                <div className='text-[14px] font-normal leading-none text-solid-gray-700' key={`${visit.date}-${order.category}-${order.createdAt}`}>
                                  検査: {order.category}
                                </div>
                              ))}
                              {!datePrescriptionGroup && dateLabOrders.length === 0 ? (
                                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>薬歴・検査オーダはありません。</p>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>

                <details className='rounded-8 border border-solid-gray-200 bg-white p-4'>
                  <summary className='cursor-pointer text-[18px] font-bold leading-snug text-solid-gray-900'>
                    保存版を表示
                  </summary>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    過去に保存した SOAP の版です。押すと現在の記載欄へ読み込みます。保存するまでは確定反映されません。
                  </p>

                  <div className='mt-3 grid gap-3'>
                    {chartVersions.map((history) => (
                      <article className='rounded-8 border border-blue-100 bg-blue-50 p-4' key={history.version}>
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color='blue' variant='filled-outline'>
                              版数 v{history.version}
                            </ChipLabel>
                            <span className='text-mono-14B-150 text-solid-gray-700'>{history.savedAt}</span>
                            <span className='text-[14px] font-normal leading-none text-solid-gray-536'>{history.savedBy}</span>
                          </div>
                          <Button
                            aria-disabled={isMutating}
                            onClick={() => handleRestoreVersion(history)}
                            size='xs'
                            type='button'
                            variant='outline'
                          >
                            この版を記載欄へ読み込む
                          </Button>
                        </div>
                        <p className='mt-3 whitespace-pre-line text-[14px] font-normal leading-none text-solid-gray-700'>
                          {history.assessment}
                        </p>
                      </article>
                    ))}
                  </div>
                </details>

                <details className='rounded-8 border border-solid-gray-200 bg-white p-4'>
                  <summary className='cursor-pointer text-[18px] font-bold leading-snug text-solid-gray-900'>
                    全期間の詳細リストを表示
                  </summary>
                <div className='mt-4 grid gap-6 xl:grid-cols-2'>
                  <section className='space-y-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>受診履歴</p>
                      <ChipLabel color='gray' variant='filled-outline'>
                        {currentVisitHistory.length}件
                      </ChipLabel>
                    </div>
                    {currentVisitHistory.length > 0 ? (
                      currentVisitHistory.map((history) => (
                        <button
                          className={cn(
                            buttonBaseStyle,
                            'rounded-8 border p-4 text-left',
                            history.date === selectedVisitHistory?.date
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-solid-gray-200 bg-white',
                          )}
                          key={`${history.date}-${history.department}-${history.summary}`}
                          onClick={() => setSelectedVisitDate(history.date)}
                          type='button'
                        >
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={history.date === selectedVisitHistory?.date ? 'blue' : 'gray'} variant='filled-outline'>
                              {history.department}
                            </ChipLabel>
                            <span className='text-mono-14B-150 text-solid-gray-700'>{history.date}</span>
                            {history.active ? (
                              <ChipLabel color='green' variant='filled-outline'>
                                今回
                              </ChipLabel>
                            ) : null}
                          </div>
                          <p className='mt-3 text-[16px] font-normal leading-none text-solid-gray-700'>{history.summary}</p>
                        </button>
                      ))
                    ) : (
                      <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                        受診履歴はまだありません。
                      </div>
                    )}
                  </section>

                  <section className='space-y-3'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>薬歴</p>
                      <div className='flex flex-wrap gap-2'>
                        {(['all', '内服', '外用', '頓服'] as const).map((category) => (
                          <button
                            className={tabItemClassName(prescriptionHistoryFilter === category)}
                            key={category}
                            onClick={() => setPrescriptionHistoryFilter(category)}
                            type='button'
                          >
                            {category === 'all' ? 'すべて' : category}
                          </button>
                        ))}
                      </div>
                    </div>
                    {medicationLongTimeline.length > 0 ? (
                      <div className='grid gap-2 rounded-8 border border-blue-100 bg-blue-50 p-3'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>薬剤別の長期サマリ</p>
                          <ChipLabel color='blue' variant='filled-outline'>
                            {medicationLongTimeline.length}剤
                          </ChipLabel>
                        </div>
                        <div className='grid gap-2'>
                          {medicationLongTimeline.slice(0, 5).map((item) => (
                            <article className='rounded-8 border border-solid-gray-200 bg-white px-3 py-2' key={item.drugName}>
                              <div className='flex flex-wrap items-center justify-between gap-2'>
                                <div className='flex flex-wrap items-center gap-2'>
                                  <ChipLabel color='gray' variant='filled-outline'>
                                    {item.category}
                                  </ChipLabel>
                                  <span className='text-[14px] font-bold leading-none text-solid-gray-900'>{item.drugName}</span>
                                </div>
                                <span className='text-mono-14B-150 text-solid-gray-700'>
                                  {item.firstDate} - {item.lastDate}
                                </span>
                              </div>
                              <div className='mt-1 flex flex-wrap items-center gap-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                                <span>{item.occurrences}回</span>
                                <span>{item.latestDosage}</span>
                                <span>{item.latestDays}</span>
                                {item.warningCount > 0 ? (
                                  <ChipLabel color='yellow' variant='filled-outline'>
                                    警告 {item.warningCount}
                                  </ChipLabel>
                                ) : null}
                                {item.pmdaInfoUrl ? <Link href={item.pmdaInfoUrl}>PMDA</Link> : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {filteredPrescriptionHistory.length > 0 ? (
                      filteredPrescriptionHistory.map((group) => (
                        <article className='rounded-8 border border-solid-gray-200 bg-white p-4' key={group.date}>
                          <div className='flex flex-wrap items-center justify-between gap-3'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <ChipLabel color={group.isLatest ? 'blue' : 'gray'} variant='filled-outline'>
                                {group.label}
                              </ChipLabel>
                              <span className='text-[14px] font-normal leading-none text-solid-gray-536'>{group.items.length}剤</span>
                              {group.isLatest ? (
                                <ChipLabel color='green' variant='filled-outline'>
                                  最新
                                </ChipLabel>
                              ) : null}
                            </div>
                            {group.copyable ? (
                              <Button
                                aria-disabled={isMutating}
                                onClick={() => handlePreviewPrescriptionCopy(group)}
                                size='xs'
                                type='button'
                                variant='outline'
                              >
                                この回を確認
                              </Button>
                            ) : null}
                          </div>

                          <div className='mt-3 grid gap-3'>
                            {group.items.map((prescription) => {
                              const matchedDrug =
                                orderConfig.prescriptionCatalog.find((item) => item.drugName === prescription.drugName) ??
                                null;
                              const matchedDrugPmdaUrl =
                                matchedDrug?.pmdaInfoUrl ?? buildPmdaDrugInfoUrl(matchedDrug?.yjCode);
                              return (
                                <div
                                  className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'
                                  key={`${group.date}-${prescription.drugName}-${prescription.dosage}-${prescription.createdAt}`}
                                >
                                  <div className='flex flex-wrap items-center justify-between gap-3'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                      <ChipLabel color='blue' variant='filled-outline'>
                                        {prescription.type}
                                      </ChipLabel>
                                      {prescription.createdAt ? (
                                        <span className='text-mono-14B-150 text-solid-gray-700'>{prescription.createdAt}</span>
                                      ) : null}
                                    </div>
                                    <div className='flex flex-wrap gap-2'>
                                      {matchedDrugPmdaUrl ? (
                                        <Link href={matchedDrugPmdaUrl}>PMDA</Link>
                                      ) : null}
                                      <Button
                                        aria-disabled={isMutating}
                                        onClick={() =>
                                          handleCopyPrescriptionToComposer(
                                            prescription.drugName,
                                            prescription.dosage,
                                            prescription.days,
                                          )
                                        }
                                        size='xs'
                                        type='button'
                                        variant='outline'
                                      >
                                        この内容で入力
                                      </Button>
                                    </div>
                                  </div>
                                  <p className='mt-3 text-[16px] font-bold leading-none text-solid-gray-900'>{prescription.drugName}</p>
                                  <p className='mt-1 text-[16px] font-normal leading-none text-solid-gray-700'>{prescription.dosage}</p>
                                  <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{prescription.days}</p>
                                  {prescription.warnings.length > 0 ? (
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                      {prescription.warnings.map((warning) => (
                                        <ChipLabel color='yellow' key={warning} variant='filled-outline'>
                                          {warning}
                                        </ChipLabel>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                        条件に一致する薬歴はありません。
                      </div>
                    )}
                  </section>
                </div>
                </details>

                <section className='space-y-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>検査オーダ履歴</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {currentLabOrders.length}件
                    </ChipLabel>
                  </div>
                  {currentLabOrders.length > 0 ? (
                    <div className='grid gap-3 xl:grid-cols-2'>
                      {currentLabOrders.map((order) => (
                        <article
                          className='rounded-8 border border-solid-gray-200 bg-white p-4'
                          key={`${order.category}-${order.createdAt}-${order.items.join('-')}`}
                        >
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={orderFlagColor(order.status)} variant='filled-outline'>
                              {order.status === 'done' ? '完了' : 'オーダ中'}
                            </ChipLabel>
                            {order.urgency ? (
                              <ChipLabel color={order.urgency === '至急' ? 'yellow' : 'gray'} variant='filled-outline'>
                                {order.urgency}
                              </ChipLabel>
                            ) : null}
                            {order.createdAt ? (
                              <span className='text-mono-14B-150 text-solid-gray-700'>{order.createdAt}</span>
                            ) : null}
                          </div>
                          <p className='mt-3 text-[16px] font-bold leading-none text-solid-gray-900'>{order.category}</p>
                          <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-700'>{order.items.join(' / ')}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                      検査オーダ履歴はまだありません。
                    </div>
                  )}
                </section>

                <section className='space-y-3'>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>診療サマリ</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {currentChartHistory.length}件
                    </ChipLabel>
                  </div>
                  {currentChartHistory.map((history) => (
                    <article
                      className='rounded-8 border border-solid-gray-200 bg-white p-4'
                      key={`${history.date}-${history.title}`}
                    >
                      <div className='flex flex-wrap items-center gap-2'>
                        <ChipLabel color='gray' variant='filled-outline'>
                          {history.department}
                        </ChipLabel>
                        <span className='text-mono-14B-150 text-solid-gray-700'>{history.date}</span>
                      </div>
                      <p className='mt-3 text-[18px] font-bold leading-snug text-solid-gray-900'>{history.title}</p>
                      <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-700'>{history.summary}</p>
                    </article>
                  ))}
                </section>
              </div>
            </section>
          ) : null}

          {activePatientTab === 'results' ? (
            <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
              <div className='grid gap-4 lg:grid-cols-3'>
                <MetricCard accent={abnormalLabCount > 0 ? 'red' : 'green'} label='異常値' value={`${abnormalLabCount}項目`} />
                <MetricCard accent='green' label='到着済み' value={`${currentLabResults.length}項目`} />
                <MetricCard accent={longTrendSummary.abnormalPoints > 0 ? 'red' : hba1cTrend.accent} label='長期推移' value={`${longTrendSummary.trackedItems}項目`} />
              </div>
              <div className='mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
                {labTrendSummaries.map((result) => (
                  <article
                    className={cn(
                      'rounded-8 border p-4 text-left transition-colors',
                      selectedLabResult?.item === result.item
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-solid-gray-200 bg-solid-gray-50 hover:border-blue-200 hover:bg-white',
                    )}
                    key={`${result.item}-${result.result}-${result.previous}`}
                  >
                    <button className='w-full text-left' onClick={() => setSelectedLabTrendItem(result.item)} type='button'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{result.item}</p>
                        <ChipLabel color={labFlagColor(result.flag)} variant='filled-outline'>
                          {result.flag === 'high' ? '異常' : '基準内'}
                        </ChipLabel>
                      </div>
                      <p className='mt-3 text-mono-16B-150 text-solid-gray-900'>{result.result}</p>
                      <div className='mt-2 flex flex-wrap items-center gap-3 text-[14px] font-normal leading-none text-solid-gray-536'>
                        <span>前回 {result.previous}</span>
                        <span>差分 {result.deltaLabel}</span>
                      </div>
                    </button>
                  </article>
                ))}
              </div>
              <div className='mt-6'>
                <LabTrendPanel longTrend={selectedLabLongTrend} reportDate={latestLabReportDate} result={selectedLabResult} />
              </div>
              <div className='mt-6'>
                <ResultsTable reportDate={latestLabReportDate} results={currentLabResults} />
              </div>
            </section>
          ) : null}

          {activePatientTab === 'profile' ? (
            <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
              <div className='flex flex-col gap-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>患者プロファイル</p>
                    <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>{contextMessage}</p>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button aria-disabled={isMutating} onClick={addPatientProfileEntry} size='xs' type='button' variant='outline'>
                      プロファイル項目を追加
                    </Button>
                    <Button aria-disabled={isMutating} onClick={addProblem} size='xs' type='button' variant='outline'>
                      プロブレムを追加
                    </Button>
                    <Button aria-disabled={isMutating} onClick={handleSavePatientContext} size='xs' type='button' variant='solid-fill'>
                      患者情報を保存
                    </Button>
                  </div>
                </div>

                <div className='grid gap-4 xl:grid-cols-2'>
                  <section className='space-y-4'>
                    {currentPatientProfile.map((item, index) => (
                      <div className='rounded-8 border border-solid-gray-200 bg-white p-4' key={item.id}>
                        <div className='grid gap-3'>
                          <Input
                            blockSize='md'
                            onChange={(event) => updatePatientProfileEntry(index, 'label', event.target.value)}
                            placeholder='項目名'
                            value={item.label}
                          />
                          <Textarea
                            className='w-full'
                            onChange={(event) => updatePatientProfileEntry(index, 'value', event.target.value)}
                            placeholder='内容'
                            rows={3}
                            value={item.value}
                          />
                          <div className='flex justify-end'>
                            <Button aria-disabled={isMutating} onClick={() => removePatientProfileEntry(index)} size='xs' type='button' variant='text'>
                              項目を削除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>

                  <section className='space-y-4'>
                    <div className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                      <div className='flex flex-col gap-3'>
                        <div>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>病名ツール</p>
                          <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{diagnosisSearchMessage}</p>
                        </div>
                        <div className='flex flex-col gap-3 sm:flex-row'>
                          <Input
                            blockSize='md'
                            onChange={(event) => {
                              setDiagnosisSearchQuery(event.target.value);
                              if (!event.target.value.trim()) {
                                setDiagnosisSearchResults([]);
                                setDiagnosisSearchMessage('標準病名マスターから候補を検索できます');
                              }
                            }}
                            placeholder='病名、カナ、ICD10 コードで検索'
                            value={diagnosisSearchQuery}
                          />
                          <Button
                            aria-disabled={isMutating || isSearchingDiagnoses}
                            onClick={handleSearchDiagnoses}
                            size='xs'
                            type='button'
                            variant='outline'
                          >
                            {isSearchingDiagnoses ? '検索中...' : '病名を検索'}
                          </Button>
                        </div>
                        {diagnosisSearchResults.length > 0 ? (
                          <div className='space-y-2'>
                            {diagnosisSearchResults.map((item) => (
                              <div
                                className='flex flex-col gap-3 rounded-8 border border-solid-gray-200 bg-white p-3'
                                key={item.managementNumber}
                              >
                                <div className='flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between'>
                                  <div>
                                    <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.diseaseName}</p>
                                    <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{item.diseaseNameKana}</p>
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                      {item.icd10Code ? (
                                        <ChipLabel color='gray' variant='filled-outline'>
                                          ICD10 {item.icd10Code}
                                        </ChipLabel>
                                      ) : null}
                                      <ChipLabel color='blue' variant='filled-outline'>
                                        管理番号 {item.managementNumber}
                                      </ChipLabel>
                                    </div>
                                  </div>
                                  <Button
                                    aria-disabled={isMutating}
                                    onClick={() => addDiagnosisProblem(item)}
                                    size='xs'
                                    type='button'
                                    variant='solid-fill'
                                  >
                                    プロブレムに追加
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {currentProblems.map((problem, index) => (
                      <div className='rounded-8 border border-solid-gray-200 bg-white p-4' key={problem.id}>
                        <div className='grid gap-3'>
                          <Input
                            blockSize='md'
                            onChange={(event) => updateProblem(index, 'name', event.target.value)}
                            placeholder='病名'
                            value={problem.name}
                          />
                          <Input
                            blockSize='md'
                            onChange={(event) => updateProblem(index, 'since', event.target.value)}
                            placeholder='発症時期 / 経過'
                            value={problem.since}
                          />
                          <div className='grid gap-3 sm:grid-cols-2'>
                            <Select
                              blockSize='md'
                              onChange={(event) => updateProblem(index, 'diagnosisType', event.target.value)}
                              value={problem.diagnosisType ?? ''}
                            >
                              <option value=''>病名区分を選択</option>
                              <option value='principal'>主病名</option>
                              <option value='secondary'>副病名</option>
                            </Select>
                            <Select
                              blockSize='md'
                              onChange={(event) => updateProblem(index, 'status', event.target.value)}
                              value={problem.status}
                            >
                              <option value='active'>active</option>
                              <option value='resolved'>resolved</option>
                            </Select>
                          </div>
                          <div className='grid gap-3 sm:grid-cols-2'>
                            <Input
                              blockSize='md'
                              onChange={(event) => updateProblem(index, 'icd10Code', event.target.value)}
                              placeholder='ICD10 コード'
                              value={problem.icd10Code ?? ''}
                            />
                            <Input
                              blockSize='md'
                              onChange={(event) => updateProblem(index, 'managementNumber', event.target.value)}
                              placeholder='病名管理番号'
                              value={problem.managementNumber ?? ''}
                            />
                          </div>
                          <div className='flex justify-end'>
                            <Button aria-disabled={isMutating} onClick={() => removeProblem(index)} size='xs' type='button' variant='text'>
                              プロブレムを削除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>
                </div>

                {currentPatientProfile.length === 0 && currentProblems.length === 0 ? (
                  <div className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                    患者プロファイルとプロブレムは未登録です。
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </main>

        <aside className='space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto'>
          <section className={cn(surfaceClassName, 'p-4')}>
            <div className='mb-3 flex items-start justify-between gap-3'>
              <div>
                <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>今日の作業キュー</h2>
                <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>入力中の指示と警告を右側で確認します。</p>
              </div>
              <ChipLabel color={workQueueWarningsCount > 0 ? 'orange' : 'green'} variant='filled-outline'>
                警告 {workQueueWarningsCount}
              </ChipLabel>
            </div>
            <div className='grid grid-cols-3 gap-2'>
              <button
                className={cn(
                  buttonBaseStyle,
                  'rounded-8 border px-3 py-2 text-left',
                  activeOrderTab === 'prescription' ? 'border-blue-900 bg-blue-50' : 'border-solid-gray-200 bg-white',
                )}
                onClick={() => setActiveOrderTab('prescription')}
                type='button'
              >
                <span className='block text-[14px] font-normal leading-none text-solid-gray-536'>処方</span>
                <span className='mt-1 block text-mono-16B-150 text-solid-gray-900'>{currentPrescriptions.length}</span>
              </button>
              <button
                className={cn(
                  buttonBaseStyle,
                  'rounded-8 border px-3 py-2 text-left',
                  activeOrderTab === 'lab' ? 'border-blue-900 bg-blue-50' : 'border-solid-gray-200 bg-white',
                )}
                onClick={() => setActiveOrderTab('lab')}
                type='button'
              >
                <span className='block text-[14px] font-normal leading-none text-solid-gray-536'>検査</span>
                <span className='mt-1 block text-mono-16B-150 text-solid-gray-900'>{currentLabOrders.length}</span>
              </button>
              <button
                className={cn(
                  buttonBaseStyle,
                  'rounded-8 border px-3 py-2 text-left',
                  activeOrderTab === 'procedure' || activeOrderTab === 'imaging'
                    ? 'border-blue-900 bg-blue-50'
                    : 'border-solid-gray-200 bg-white',
                )}
                onClick={() => setActiveOrderTab('procedure')}
                type='button'
              >
                <span className='block text-[14px] font-normal leading-none text-solid-gray-536'>処置</span>
                <span className='mt-1 block text-mono-16B-150 text-solid-gray-900'>
                  {procedureComposer.title.trim() ? 1 : 0}
                </span>
              </button>
            </div>
          </section>

          <section className={cn(surfaceClassName, 'p-4')}>
            <div className='flex flex-wrap gap-6 border-b border-solid-gray-200'>
              {orderTabs.map((item) => (
                <button
                  className={tabItemClassName(activeOrderTab === item.key)}
                  key={item.key}
                  onClick={() => setActiveOrderTab(item.key)}
                  type='button'
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {activeOrderTab === 'prescription' ? (
            <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>現在の処方</h2>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    aria-disabled={isMutating || !latestCopyablePrescriptionGroup}
                    onClick={() => handlePreviewPrescriptionCopy()}
                    size='xs'
                    type='button'
                    variant='outline'
                  >
                    前回まとめて確認
                  </Button>
                  <Button aria-disabled={isMutating} onClick={handleAddPrescription} size='xs' type='button' variant='solid-fill'>
                    追加
                  </Button>
                </div>
              </div>

              <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                <Input
                  blockSize='md'
                  onChange={(event) => setPrescriptionSearchQuery(event.target.value)}
                  placeholder='薬剤名・関連病名・用法で検索'
                  value={prescriptionSearchQuery}
                />

                <div className='flex flex-wrap gap-2'>
                  {(['all', '内服', '外用', '頓服'] as const).map((category) => (
                    <button
                      className={tabItemClassName(prescriptionCategoryFilter === category)}
                      key={category}
                      onClick={() => setPrescriptionCategoryFilter(category)}
                      type='button'
                    >
                      {category === 'all' ? 'すべて' : category}
                    </button>
                  ))}
                </div>

                {prescriptionCopyPreview ? (
                  <div className='rounded-8 border border-yellow-300 bg-yellow-50 p-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-[16px] font-bold leading-none text-solid-gray-900'>複写前プレビュー</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-700'>
                          {prescriptionCopyPreview.sourceDate} 処方 / 追加予定 {prescriptionCopyPreview.plannedCount} 剤 / スキップ {prescriptionCopyPreview.skippedCount} 剤
                        </p>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          aria-disabled={isMutating}
                          onClick={() => setPrescriptionCopyPreview(null)}
                          size='xs'
                          type='button'
                          variant='outline'
                        >
                          閉じる
                        </Button>
                        <Button
                          aria-disabled={isMutating || prescriptionCopyPreview.plannedCount === 0}
                          onClick={() => handleCopyPrescriptionGroup()}
                          size='xs'
                          type='button'
                          variant='solid-fill'
                        >
                          確定して追加
                        </Button>
                      </div>
                    </div>
                    <div className='mt-3 grid gap-2'>
                      {prescriptionCopyPreview.diffItems.map((item) => (
                        <div className='rounded-8 border border-solid-gray-200 bg-white px-3 py-2' key={`${item.status}-${item.drugName}`}>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={item.status === 'skipped' || item.status === 'changed' ? 'yellow' : item.status === 'to_copy' ? 'blue' : 'gray'} variant='filled-outline'>
                              {item.label}
                            </ChipLabel>
                            <span className='text-[14px] font-bold leading-none text-solid-gray-900'>{item.drugName}</span>
                          </div>
                          <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                            {item.sourceDosage ? `前回: ${item.sourceDosage}` : ''}
                            {item.currentDosage ? ` / 今回: ${item.currentDosage}` : ''}
                            {item.reason ? ` / ${item.reason}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {prescriptionSetPreview ? (
                  <div className='rounded-8 border border-blue-200 bg-blue-50 p-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-[16px] font-bold leading-none text-solid-gray-900'>セット展開前プレビュー</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-700'>
                          {prescriptionSetPreview.label} / 追加可能 {prescriptionSetPreviewReadyCount} 剤 / ブロック {prescriptionSetPreviewBlockedCount} 剤
                        </p>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          aria-disabled={isMutating}
                          onClick={() => setPrescriptionSetPreview(null)}
                          size='xs'
                          type='button'
                          variant='outline'
                        >
                          閉じる
                        </Button>
                        <Button
                          aria-disabled={isMutating || prescriptionSetPreviewReadyCount === 0}
                          onClick={() =>
                            handleApplyPrescriptionSet(
                              prescriptionSetPreview.setId,
                              new Set(
                                prescriptionSetPreview.items
                                  .filter((item) => item.status !== 'blocked')
                                  .map((item) => item.drugId),
                              ),
                            )
                          }
                          size='xs'
                          type='button'
                          variant='solid-fill'
                        >
                          確定して追加
                        </Button>
                      </div>
                    </div>
                    <div className='mt-3 grid gap-2'>
                      {prescriptionSetPreview.items.map((item) => (
                        <div className='rounded-8 border border-solid-gray-200 bg-white px-3 py-2' key={`${prescriptionSetPreview.setId}-${item.drugId}`}>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel
                              color={item.status === 'blocked' ? 'yellow' : item.status === 'warning' ? 'green' : 'blue'}
                              variant='filled-outline'
                            >
                              {item.status === 'blocked' ? '要除外' : item.status === 'warning' ? '要確認' : '追加予定'}
                            </ChipLabel>
                            <span className='text-[14px] font-bold leading-none text-solid-gray-900'>{item.drugName}</span>
                          </div>
                          <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                            {item.dosage} / {item.days}日分
                            {item.messages.length > 0 ? ` / ${item.messages.join(' / ')}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {prescriptionSetSuggestions.length > 0 ? (
                  <div className='grid gap-2'>
                    {prescriptionSetSuggestions.slice(0, 3).map((setItem) => {
                      const expandedItems = resolvePrescriptionSetItems(setItem.id);
                      return (
                        <div className='rounded-8 border border-blue-100 bg-blue-50 px-4 py-3' key={setItem.id}>
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div>
                              <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{setItem.label}</p>
                              <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                                {setItem.department} / 展開後 {expandedItems.length}剤
                              </p>
                            </div>
                            <Button
                              aria-disabled={isMutating}
                              onClick={() => handlePreviewPrescriptionSet(setItem.id)}
                              size='xs'
                              type='button'
                              variant='outline'
                            >
                              セットを確認
                            </Button>
                          </div>
                          <div className='mt-2 flex flex-wrap gap-2'>
                            {setItem.relatedProblem ? (
                              <ChipLabel color='blue' variant='filled-outline'>
                                {setItem.relatedProblem}
                              </ChipLabel>
                            ) : null}
                            {setItem.includedSetIds.length > 0 ? (
                              <ChipLabel color='green' variant='filled-outline'>
                                複合 {setItem.includedSetIds.length}セット
                              </ChipLabel>
                            ) : null}
                            {expandedItems.map((item) => {
                              const drug = orderConfig.prescriptionCatalog.find((catalog) => catalog.id === item.drugId);
                              return (
                                <ChipLabel color='gray' key={`${setItem.id}-${item.drugId}`} variant='filled-outline'>
                                  {drug?.drugName ?? item.drugId}
                                </ChipLabel>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {prescriptionSuggestions.length > 0 ? (
                  <div className='grid gap-2'>
                    {prescriptionSuggestions.map((drug) => (
                      <button
                        className='rounded-8 border border-solid-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-solid-gray-50'
                        key={drug.id}
                        onClick={() => handleSelectPrescriptionDrug(drug.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <div>
                            <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{drug.drugName}</p>
                            {drug.genericName ? (
                              <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{drug.genericName}</p>
                            ) : null}
                          </div>
                          <ChipLabel color='blue' variant='filled-outline'>
                            {drug.category}
                          </ChipLabel>
                        </div>
                        <div className='mt-2 flex flex-wrap gap-2'>
                          {getPrescriptionSignalBadge(prescriptionSignals[drug.id]) ? (
                            <ChipLabel
                              color={getPrescriptionSignalBadge(prescriptionSignals[drug.id])?.color ?? 'gray'}
                              variant='filled-outline'
                            >
                              {getPrescriptionSignalBadge(prescriptionSignals[drug.id])?.label}
                            </ChipLabel>
                          ) : null}
                          {drug.relatedProblem &&
                          currentProblems.some((problem) => problem.name === drug.relatedProblem) ? (
                            <ChipLabel color='blue' variant='filled-outline'>
                              病名一致
                            </ChipLabel>
                          ) : null}
                          {drug.relatedProblem ? (
                            <ChipLabel color='gray' variant='filled-outline'>
                              {drug.relatedProblem}
                            </ChipLabel>
                          ) : null}
                          {drug.defaultDays ? (
                            <ChipLabel color='gray' variant='filled-outline'>
                              {drug.defaultDays}日
                            </ChipLabel>
                          ) : null}
                          <ChipLabel color='gray' variant='filled-outline'>
                            {drug.dosageOptions[0] ?? '用法未設定'}
                          </ChipLabel>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className='rounded-8 border border-dashed border-solid-gray-300 bg-white px-4 py-4 text-[14px] font-normal leading-none text-solid-gray-536'>
                    検索条件に一致する処方候補はありません。
                  </div>
                )}

                <Select
                  blockSize='md'
                  onChange={(event) => handleSelectPrescriptionDrug(event.target.value)}
                  value={prescriptionComposer.drugId}
                >
                  {prescriptionSelectOptions.map((drug) => (
                    <option key={drug.id} value={drug.id}>
                      {drug.drugName}
                    </option>
                  ))}
                </Select>

                <Select
                  blockSize='md'
                  onChange={(event) =>
                    setPrescriptionComposer((current) => ({
                      ...current,
                      dosage: event.target.value,
                    }))
                  }
                  value={prescriptionComposer.dosage}
                >
                  {selectedDrugDosageOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>

                <div className='flex flex-wrap gap-2'>
                  {prescriptionDayOptions.map((days) => (
                    <button
                      className={tabItemClassName(prescriptionComposer.days === days)}
                      key={days}
                      onClick={() =>
                        setPrescriptionComposer((current) => ({
                          ...current,
                          days,
                        }))
                      }
                      type='button'
                    >
                      {days}日
                    </button>
                  ))}
                </div>

                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{prescriptionAutofillHint}</p>
                {selectedDrugPmdaUrl ? (
                  <p className='text-[14px] font-normal leading-none'>
                    <Link href={selectedDrugPmdaUrl}>PMDA 添付文書 / 安全情報を確認</Link>
                  </p>
                ) : null}

                {prescriptionWarnings.length > 0 ? (
                  <WarningList items={prescriptionWarnings} title='共通チェック' />
                ) : null}

                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{orderMessage}</p>
              </div>

              <div className='mt-4 space-y-3'>
                {currentPrescriptions.map((prescription) => (
                  <article
                    className='rounded-8 border border-blue-100 bg-blue-50 p-4'
                    key={`${prescription.drugName}-${prescription.days}-${prescription.dosage}`}
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <ChipLabel color='blue' variant='filled-outline'>
                        {prescription.type}
                      </ChipLabel>
                      <div className='flex items-center gap-2'>
                        <span className='text-[14px] font-bold leading-none text-blue-900'>{prescription.days}</span>
                        <Button
                          aria-disabled={isMutating}
                          onClick={() =>
                            handleCopyPrescriptionToComposer(
                              prescription.drugName,
                              prescription.dosage,
                              prescription.days,
                            )
                          }
                          size='xs'
                          type='button'
                          variant='text'
                        >
                          この内容で入力
                        </Button>
                      </div>
                    </div>
                    <p className='mt-3 text-[16px] font-bold leading-none text-solid-gray-900'>{prescription.drugName}</p>
                    <p className='mt-1 text-[16px] font-normal leading-none text-solid-gray-700'>{prescription.dosage}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeOrderTab === 'lab' ? (
            <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>検査オーダー</h2>
                <Button aria-disabled={isMutating} onClick={handlePreviewLabSet} size='xs' type='button' variant='outline'>
                  セットを確認
                </Button>
              </div>

              <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                <Select
                  blockSize='md'
                  onChange={(event) => {
                    setLabSetPreview(null);
                    setLabComposer((current) => ({
                      ...current,
                      setId: event.target.value,
                    }));
                  }}
                  value={labComposer.setId}
                >
                  {orderConfig.labSetOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <Select
                  blockSize='md'
                  onChange={(event) =>
                    setLabComposer((current) => ({
                      ...current,
                      urgency: event.target.value as '通常' | '至急',
                    }))
                  }
                  value={labComposer.urgency}
                >
                  <option value='通常'>通常</option>
                  <option value='至急'>至急</option>
                </Select>

                {selectedLabSet ? (
                  <div className='rounded-8 border border-green-100 bg-white px-3 py-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-[14px] font-bold leading-none text-solid-gray-900'>展開後 {selectedLabSetItems.length}項目</span>
                      {selectedLabSet.includedSetIds.length > 0 ? (
                        <ChipLabel color='green' variant='filled-outline'>
                          複合 {selectedLabSet.includedSetIds.length}セット
                        </ChipLabel>
                      ) : null}
                    </div>
                    <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{selectedLabSetItems.join(' / ')}</p>
                  </div>
                ) : null}

                {labSetPreview ? (
                  <div className='rounded-8 border border-green-200 bg-green-50 p-4'>
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <p className='text-[16px] font-bold leading-none text-solid-gray-900'>検査セット展開前プレビュー</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-700'>
                          {labSetPreview.label} / {labSetPreview.items.length} 項目 / 重複 {labSetPreviewDuplicateCount} 項目
                        </p>
                      </div>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          aria-disabled={isMutating}
                          onClick={() => setLabSetPreview(null)}
                          size='xs'
                          type='button'
                          variant='outline'
                        >
                          閉じる
                        </Button>
                        <Button
                          aria-disabled={isMutating || labSetPreview.items.length === 0 || labSetPreviewDuplicateCount > 0}
                          onClick={handleAddLabOrder}
                          size='xs'
                          type='button'
                          variant='solid-fill'
                        >
                          確定して追加
                        </Button>
                      </div>
                    </div>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {labSetPreview.items.map((item) => (
                        <ChipLabel
                          color={item.isDuplicate ? 'yellow' : 'green'}
                          key={`${labSetPreview.setId}-${item.name}`}
                          variant='filled-outline'
                        >
                          {item.name}
                          {item.isDuplicate ? ' / 重複' : ''}
                        </ChipLabel>
                      ))}
                    </div>
                  </div>
                ) : null}

                {labWarnings.length > 0 ? <WarningList items={labWarnings} title='検査チェック' /> : null}
              </div>

              <div className='mt-4 space-y-3'>
                {currentLabOrders.map((order) => (
                  <article
                    className='rounded-8 border border-green-200 bg-green-50 p-4'
                    key={`${order.category}-${order.items.join('-')}`}
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-[16px] font-bold leading-none text-green-900'>{order.category}</p>
                      <div className='flex flex-wrap gap-2'>
                        {order.urgency ? (
                          <ChipLabel color={order.urgency === '至急' ? 'red' : 'gray'} variant='filled-outline'>
                            {order.urgency}
                          </ChipLabel>
                        ) : null}
                        <ChipLabel color={orderFlagColor(order.status)} variant='filled-outline'>
                          {order.status === 'done' ? '結果あり' : '依頼中'}
                        </ChipLabel>
                      </div>
                    </div>
                    <div className='mt-3 flex flex-wrap gap-2'>
                      {order.items.map((item) => (
                        <ChipLabel color='gray' key={item} variant='filled-outline'>
                          {item}
                        </ChipLabel>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeOrderTab === 'imaging' ? (
            <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>画像オーダー</h2>
                <Button aria-disabled={isMutating} onClick={handleAddImagingOrder} size='xs' type='button' variant='outline'>
                  追加
                </Button>
              </div>
              <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                <Input
                  blockSize='md'
                  onChange={(event) =>
                    setImagingComposer((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                  placeholder='画像オーダー名'
                  value={imagingComposer.category}
                />
                <Select
                  blockSize='md'
                  onChange={(event) =>
                    setImagingComposer((current) => ({
                      ...current,
                      status: event.target.value as 'scheduled' | 'draft',
                    }))
                  }
                  value={imagingComposer.status}
                >
                  <option value='scheduled'>scheduled</option>
                  <option value='draft'>draft</option>
                </Select>
                <Input
                  blockSize='md'
                  onChange={(event) =>
                    setImagingComposer((current) => ({
                      ...current,
                      scheduledAt: event.target.value,
                    }))
                  }
                  placeholder='予定日時'
                  value={imagingComposer.scheduledAt}
                />
                <Textarea
                  className='w-full'
                  onChange={(event) =>
                    setImagingComposer((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  rows={3}
                  value={imagingComposer.note}
                />
                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{imagingMessage}</p>
              </div>
              <div className='space-y-3'>
                {currentImagingOrders.map((order) => (
                  <article className='rounded-8 border border-cyan-200 bg-cyan-50 p-4' key={order.category}>
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-[16px] font-bold leading-none text-cyan-900'>{order.category}</p>
                      <ChipLabel color={order.status === 'scheduled' ? 'cyan' : 'gray'} variant='filled-outline'>
                        {order.status === 'scheduled' ? '予約済み' : '下書き'}
                      </ChipLabel>
                    </div>
                    <p className='mt-3 text-[16px] font-normal leading-none text-solid-gray-700'>{order.note}</p>
                    <p className='mt-2 text-mono-14N-150 text-solid-gray-536'>{order.scheduledAt}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {activeOrderTab === 'procedure' ? (
            <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
              <div className='mb-4 flex items-center justify-between gap-3'>
                <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>処置 / 指導</h2>
                <Button aria-disabled={isMutating} onClick={handleAddProcedureOrder} size='xs' type='button' variant='outline'>
                  追加
                </Button>
              </div>
              <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
                <Input
                  blockSize='md'
                  onChange={(event) =>
                    setProcedureComposer((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder='処置 / 指導名'
                  value={procedureComposer.title}
                />
                <Select
                  blockSize='md'
                  onChange={(event) =>
                    setProcedureComposer((current) => ({
                      ...current,
                      status: event.target.value as 'planned' | 'done',
                    }))
                  }
                  value={procedureComposer.status}
                >
                  <option value='planned'>planned</option>
                  <option value='done'>done</option>
                </Select>
                <Textarea
                  className='w-full'
                  onChange={(event) =>
                    setProcedureComposer((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  rows={3}
                  value={procedureComposer.note}
                />
                <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{procedureMessage}</p>
              </div>
              <div className='space-y-3'>
                {currentProcedureOrders.map((order) => (
                  <article
                    className='rounded-8 border border-purple-200 bg-purple-50 p-4'
                    key={order.title}
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-[16px] font-bold leading-none text-purple-800'>{order.title}</p>
                      <ChipLabel color={order.status === 'done' ? 'green' : 'purple'} variant='filled-outline'>
                        {order.status === 'done' ? '完了' : '予定'}
                      </ChipLabel>
                    </div>
                    <p className='mt-3 text-[16px] font-normal leading-none text-solid-gray-700'>{order.note}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
            <div className='mb-4 flex items-center justify-between gap-3'>
              <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>次回予約</h2>
              <Button aria-disabled={isMutating} onClick={handleSaveReservation} size='xs' type='button' variant='outline'>
                <CalendarIcon className='h-4 w-4' />
                更新
              </Button>
            </div>

            <div className='grid gap-3'>
              <div className='grid gap-3 sm:grid-cols-2'>
                {orderConfig.reservationSlots.map((slot) => (
                  <button
                    className={cn(
                      buttonBaseStyle,
                      'rounded-8 border p-4 text-left transition-colors',
                      reservationComposer.slotId === slot.id
                        ? 'border-blue-900 bg-blue-50'
                        : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                    )}
                    key={slot.id}
                    onClick={() =>
                      setReservationComposer((current) => ({
                        ...current,
                        slotId: slot.id,
                      }))
                    }
                    type='button'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <ChipLabel color={slotStateColor(slot.state)} variant='filled-outline'>
                        {slotStateLabel(slot.state)}
                      </ChipLabel>
                      <span className='text-mono-14B-150 text-solid-gray-700'>{slot.time}</span>
                    </div>
                    <p className='mt-2 text-[16px] font-bold leading-none text-solid-gray-900'>{slot.date}</p>
                    <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                      {slot.department} / {slot.doctor}
                    </p>
                  </button>
                ))}
              </div>

              <Textarea
                className='w-full'
                onChange={(event) =>
                  setReservationComposer((current) => ({
                    ...current,
                    comment: event.target.value,
                  }))
                }
                rows={3}
                value={reservationComposer.comment}
              />

              {reservationWarnings.length > 0 ? (
                <WarningList items={reservationWarnings} title='予約チェック' />
              ) : null}

              <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{reservationMessage}</p>
            </div>

            <div className='mt-4 rounded-8 border border-blue-100 bg-blue-50 p-4'>
              <p className='flex items-center gap-2 text-[16px] font-bold leading-none text-blue-900'>
                <CalendarIcon className='h-4 w-4' />
                {scheduledVisit.date}
              </p>
              <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-700'>{scheduledVisit.department}</p>
              <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{scheduledVisit.note}</p>
            </div>
          </section>

          <section className={cn(surfaceClassName, 'p-4 lg:p-5')}>
            <Button aria-disabled={isMutating} onClick={handleCompleteVisit} size='md' type='button' variant='solid-fill'>
              診察終了
            </Button>
            <p className='mt-3 text-[14px] font-normal leading-none text-solid-gray-536'>
              カルテ保存と状態更新をまとめて実行し、受付へ戻します。
            </p>
          </section>
        </aside>
      </div>
    </>
  );
};

const TemplatePreviewCard = ({
  label,
  title,
  value,
}: {
  label: string;
  title: string;
  value: string;
}) => (
  <article className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
    <div className='flex items-center gap-2'>
      <span className='grid h-7 w-7 place-items-center rounded-full bg-blue-900 text-[14px] font-bold leading-none text-white'>
        {label}
      </span>
      <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{title}</p>
    </div>
    <p className='mt-3 whitespace-pre-line text-[14px] font-normal leading-none text-solid-gray-700'>{value}</p>
  </article>
);

const TrendSparkline = ({ points }: { points: LabResultEntry['history'] }) => {
  const numericPoints = points
    .map((point, index) => ({
      index,
      date: point.date,
      value: extractNumericValue(point.value),
      flag: point.flag,
    }))
    .filter(
      (point): point is { index: number; date: string; value: number; flag: LabResultEntry['flag'] } =>
        point.value !== null,
    );

  if (numericPoints.length < 2) {
    return (
      <div className='grid h-40 place-items-center rounded-8 border border-dashed border-solid-gray-300 bg-white text-[14px] font-normal leading-none text-solid-gray-536'>
        推移グラフを表示できるデータが不足しています。
      </div>
    );
  }

  const width = 420;
  const height = 160;
  const paddingX = 24;
  const paddingY = 18;
  const minValue = Math.min(...numericPoints.map((point) => point.value));
  const maxValue = Math.max(...numericPoints.map((point) => point.value));
  const range = maxValue - minValue || 1;
  const stepX = numericPoints.length === 1 ? 0 : (width - paddingX * 2) / (numericPoints.length - 1);
  const polylinePoints = numericPoints
    .map((point, index) => {
      const x = paddingX + stepX * index;
      const normalizedY = (point.value - minValue) / range;
      const y = height - paddingY - normalizedY * (height - paddingY * 2);
      return { ...point, x, y };
    });

  return (
    <div className='rounded-8 border border-solid-gray-200 bg-white p-4'>
      <svg aria-label='検査値推移' className='h-40 w-full' viewBox={`0 0 ${width} ${height}`}>
        <line stroke='#d0d0d0' strokeDasharray='4 4' x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} />
        <line stroke='#d0d0d0' strokeDasharray='4 4' x1={paddingX} x2={width - paddingX} y1={paddingY} y2={paddingY} />
        <polyline
          fill='none'
          points={polylinePoints.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke='#0d5ad1'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='3'
        />
        {polylinePoints.map((point) => (
          <g key={`${point.index}-${point.value}`}>
            <circle cx={point.x} cy={point.y} fill={point.flag === 'high' ? '#b11f24' : '#0d5ad1'} r='5' />
            <text fill='#4b4b4b' fontSize='11' textAnchor='middle' x={point.x} y={height - 2}>
              {point.date}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

const LabTrendPanel = ({
  longTrend,
  result,
  reportDate,
}: {
  longTrend: LabLongTrendItem | null;
  result: LabResultEntry | null;
  reportDate: string | null;
}) => {
  if (!result) {
    return (
      <section className='rounded-8 border border-dashed border-solid-gray-300 bg-solid-gray-50 px-4 py-6 text-[14px] font-normal leading-none text-solid-gray-536'>
        推移表示できる検査結果はありません。
      </section>
    );
  }

  const trendPoints = longTrend?.points.length ? longTrend.points : getLabResultTrendPoints(result);
  const latestPoint = trendPoints.at(-1) ?? null;
  const previousPoint = trendPoints.at(-2) ?? null;
  const trendPointCount = longTrend?.pointCount ?? trendPoints.length;
  const abnormalCount = longTrend?.abnormalCount ?? trendPoints.filter((point) => point.flag === 'high').length;
  const deltaLabel = longTrend?.deltaLabel ?? getLabResultDeltaLabel(result);

  return (
    <section className='rounded-12 border border-blue-200 bg-blue-50 p-5'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
        <div>
          <p className='text-[18px] font-bold leading-snug text-blue-900'>{result.item} の推移</p>
          <p className='mt-1 text-[14px] font-normal leading-none text-blue-900'>
            {reportDate ? `${reportDate} 報告分までの ${trendPointCount} 回比較` : '履歴データを表示します'}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <ChipLabel color={labFlagColor(result.flag)} variant='filled-outline'>
            {result.flag === 'high' ? '異常継続' : '基準内'}
          </ChipLabel>
          <ChipLabel color='gray' variant='filled-outline'>
            差分 {deltaLabel}
          </ChipLabel>
          <ChipLabel color={abnormalCount > 0 ? 'red' : 'green'} variant='filled-outline'>
            異常 {abnormalCount}回
          </ChipLabel>
        </div>
      </div>

      <div className='mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]'>
        <TrendSparkline points={trendPoints} />
        <div className='space-y-3'>
          <article className='rounded-8 border border-solid-gray-200 bg-white p-4'>
            <p className='text-[14px] font-bold leading-none text-solid-gray-700'>最新値</p>
            <p className='mt-2 text-mono-16B-150 text-solid-gray-900'>{latestPoint?.value ?? result.result}</p>
            <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
              {latestPoint?.date ?? longTrend?.latestDate ?? result.reportedAt ?? '今回'} / 基準 {longTrend?.baseline ?? result.baseline}
            </p>
          </article>
          <article className='rounded-8 border border-solid-gray-200 bg-white p-4'>
            <p className='text-[14px] font-bold leading-none text-solid-gray-700'>前回値</p>
            <p className='mt-2 text-mono-16B-150 text-solid-gray-900'>{previousPoint?.value ?? longTrend?.previousValue ?? result.previous}</p>
            <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{previousPoint?.date ?? '前回採血'}</p>
          </article>
          <article className='rounded-8 border border-solid-gray-200 bg-white p-4'>
            <p className='text-[14px] font-bold leading-none text-solid-gray-700'>トレンドメモ</p>
            <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-700'>
              {abnormalCount > 0
                ? `${trendPointCount}回中 ${abnormalCount}回で異常判定です。長期推移と直近値をあわせて評価できます。`
                : `${trendPointCount}回の推移で基準内です。変動幅を見ながら再評価できます。`}
            </p>
          </article>
        </div>
      </div>
    </section>
  );
};

const ResultsTable = ({ reportDate, results }: { reportDate: string | null; results: LabResultEntry[] }) => (
  <section className='overflow-hidden rounded-8 border border-solid-gray-200'>
    <header className='flex flex-col gap-3 border-b border-solid-gray-200 bg-white px-4 py-4 lg:flex-row lg:items-center lg:justify-between'>
      <div>
        <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>検査結果（{reportDate ?? '今回'}）</p>
      </div>
      <Link href='#'>全検査値を表示</Link>
    </header>

    <div className='overflow-x-auto'>
      <table className='min-w-full border-collapse'>
        <thead>
          <tr className='border-b border-solid-gray-200 bg-white text-left text-[14px] font-bold leading-none text-solid-gray-700'>
            <th className='px-4 py-3'>項目</th>
            <th className='px-4 py-3'>結果</th>
            <th className='px-4 py-3'>基準値</th>
            <th className='px-4 py-3'>前回値</th>
            <th className='px-4 py-3'>判定</th>
          </tr>
        </thead>
        <tbody>
          {results.length > 0 ? (
            results.map((result) => (
              <tr className='border-b border-solid-gray-200 last:border-b-0' key={result.item}>
                <td className='px-4 py-4 text-[16px] font-bold leading-none text-solid-gray-900'>{result.item}</td>
                <td
                  className={cn(
                    'px-4 py-4 text-mono-16B-150',
                    result.flag === 'high' ? 'text-red-900' : 'text-solid-gray-900',
                  )}
                >
                  {result.result}
                </td>
                <td className='px-4 py-4 text-[16px] font-normal leading-none text-solid-gray-700'>{result.baseline}</td>
                <td className='px-4 py-4 text-[16px] font-normal leading-none text-solid-gray-700'>{result.previous}</td>
                <td className='px-4 py-4'>
                  <ChipLabel color={labFlagColor(result.flag)} variant='filled-outline'>
                    {result.flag === 'high' ? 'H' : 'N'}
                  </ChipLabel>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className='px-4 py-6 text-[14px] font-normal leading-none text-solid-gray-536' colSpan={5}>
                検査結果はまだ登録されていません。
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </section>
);

const WarningList = ({ items, title }: { items: string[]; title: string }) => (
  <div className='rounded-8 border border-yellow-200 bg-yellow-50 p-4'>
    <p className='text-[16px] font-bold leading-none text-yellow-1000'>{title}</p>
    <div className='mt-2 space-y-2'>
      {items.map((item) => (
        <p className='text-[14px] font-normal leading-none text-yellow-1100' key={item}>
          {item}
        </p>
      ))}
    </div>
  </div>
);

const MetricCard = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'blue' | 'green' | 'red';
}) => (
  <div className='rounded-8 border border-solid-gray-200 bg-white p-4'>
    <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{label}</p>
    <p
      className={cn(
        'mt-2 text-[20px] font-bold leading-snug',
        accent === 'blue' && 'text-blue-900',
        accent === 'green' && 'text-green-900',
        accent === 'red' && 'text-red-900',
      )}
    >
      {value}
    </p>
  </div>
);
