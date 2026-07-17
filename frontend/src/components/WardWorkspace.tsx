import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Bed,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  FileSignature,
  FlaskConical,
  HeartPulse,
  Hospital,
  ListChecks,
  MoveRight,
  NotebookPen,
  ReceiptText,
  Thermometer,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import {
  createInpatientClaimDraft,
  createInpatientDocument,
  createInpatientInstruction,
  createInpatientPathway,
  createInpatientSummaryReview,
  createNursingNote,
  assignInpatientToMe,
  getInpatientPathway,
  getInpatientClaimDraft,
  getInpatientDischargePlan,
  getInpatientProgress,
  getInpatientSummaryDraft,
  isUnauthorizedError,
  listClaimDraftLineReceiptCodeCandidates,
  listInpatientAdmissions,
  listInpatientBeds,
  listInpatientDocuments,
  listInpatientEvents,
  listInpatientInstructions,
  listMyInpatientCareAssignments,
  listInpatientPathwayMasters,
  listNursingNotes,
  listInpatientSummaryReviews,
  previewClaimDraftOrcaPayload,
  recheckClaimDraft,
  submitClaimDraftToOrca,
  transferInpatientAdmission,
  updateInpatientBedStatus,
  updateClaimDraftStatus,
  updateClaimDraftLineReceiptCode,
  updateClaimLineAdjustmentStatus,
  updateInpatientDocument,
  updateInpatientDischargePlan,
  updateInpatientInstruction,
  updateInpatientInstructionStatus,
  updateInpatientPathwayTask,
  unassignInpatientFromMe,
} from '../lib/api';
import { cn } from '../lib/cn';
import type {
  InpatientAdmission,
  InpatientAiSummaryReview,
  InpatientBed,
  InpatientCareAssignment,
  ClaimDraft,
  ClaimDraftLine,
  ClaimLineAdjustment,
  InpatientDocument,
  InpatientDocumentType,
  InpatientDischargePlan,
  InpatientEvent,
  InpatientInstruction,
  InpatientPathway,
  InpatientPathwayMaster,
  InpatientPathwayTask,
  InpatientProgress,
  InpatientSummaryDraft,
  NursingNote,
  ReceiptCodeCandidate,
  UserSession,
} from '../types/workflow';
import { WardOverview } from './ward/WardOverview';
import { Button } from './ui/button';
import { Drawer } from './ui/drawer';
import { Input } from './ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type WardWorkspaceProps = {
  admissions: InpatientAdmission[];
  currentUser: UserSession;
  onAuthExpired: () => void;
  onOpenChart: (patientId: string) => void;
  onRefreshAdmissions: (admissions: InpatientAdmission[]) => void;
};

const statusLabels: Record<InpatientInstruction['status'], string> = {
  pending: '未実施',
  done: '実施済',
  cancelled: '中止',
};

const statusClasses: Record<InpatientInstruction['status'], string> = {
  pending: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  done: 'border-green-200 bg-green-50 text-green-900',
  cancelled: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const bedStatusLabels: Record<InpatientBed['status'], string> = {
  available: '空床',
  occupied: '使用中',
  cleaning: '清掃中',
  blocked: '使用不可',
};

const bedStatusClasses: Record<InpatientBed['status'], string> = {
  available: 'border-green-200 bg-green-50 text-green-900',
  occupied: 'border-blue-200 bg-blue-50 text-blue-900',
  cleaning: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  blocked: 'border-red-200 bg-red-50 text-red-1000',
};

const documentTypeLabels: Record<InpatientDocumentType, string> = {
  admission_care_plan: '入院診療計画書',
  discharge_summary: '退院サマリ',
  discharge_instruction: '退院時指導文書',
};

const claimAdjustmentStatusLabels: Record<ClaimLineAdjustment['status'], string> = {
  suggested: '提案',
  accepted: '採用済',
  ignored: '無視',
};

const claimAdjustmentStatusClasses: Record<ClaimLineAdjustment['status'], string> = {
  suggested: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  accepted: 'border-green-200 bg-green-50 text-green-900',
  ignored: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const claimIssueLabels: Record<string, string> = {
  claim_line_unresolved_receipt_code: '明細コード未解決',
  missing_receipt_code: '候補コードなし',
  lab_order_not_done: '検査未実施',
  instruction_not_done: '指示未実施',
};

const claimIssueClasses: Record<string, string> = {
  claim_line_unresolved_receipt_code: 'border-red-200 bg-red-50 text-red-950',
  missing_receipt_code: 'border-red-200 bg-red-50 text-red-950',
  lab_order_not_done: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  instruction_not_done: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
};

const documentStatusLabels: Record<InpatientDocument['status'], string> = {
  draft: '下書き',
  signed: '署名済',
  archived: '取消済',
};

const documentStatusClasses: Record<InpatientDocument['status'], string> = {
  draft: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  signed: 'border-green-200 bg-green-50 text-green-900',
  archived: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const pathwayStatusLabels: Record<InpatientPathwayTask['status'], string> = {
  pending: '未実施',
  done: '完了',
  variance: '逸脱',
  skipped: '除外',
};

const pathwayStatusClasses: Record<InpatientPathwayTask['status'], string> = {
  pending: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  done: 'border-green-200 bg-green-50 text-green-900',
  variance: 'border-red-200 bg-red-50 text-red-1000',
  skipped: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const emptyNoteForm = {
  focus: '',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
};

const emptyInstructionForm = {
  category: '検査',
  title: '',
  dueAt: '',
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const getOrcaPayloadClaim = (payload: Record<string, unknown>) => asRecord(payload.claim);

const getPayloadArray = (claim: Record<string, unknown> | null, key: string): Record<string, unknown>[] => {
  const value = claim?.[key];
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
};

const getPayloadSummary = (claim: Record<string, unknown> | null) => asRecord(claim?.summary);

const payloadText = (item: Record<string, unknown>, key: string) => {
  const value = item[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

type WardDrawerPanel = 'summary' | 'claim' | 'events' | null;

type LabTimelineRow = {
  key: string;
  date: string;
  type: 'result' | 'order';
  item: string;
};

const vitalMetricLabels = [
  { key: 'temperature', label: '体温', keywords: ['体温', 'BT', 'T'], unit: '℃' },
  { key: 'pulse', label: '脈拍', keywords: ['脈拍', 'HR', 'Pulse'], unit: '/分' },
  { key: 'bloodPressure', label: '血圧', keywords: ['血圧', 'BP'], unit: '' },
  { key: 'spo2', label: 'SpO2', keywords: ['SpO2', 'SPO2', '酸素'], unit: '%' },
];

const findVitalValue = (vitals: string[], keywords: string[]) => {
  const matched = vitals.find((vital) => keywords.some((keyword) => vital.includes(keyword)));
  if (!matched) return '-';
  return matched.replace(/^(体温|脈拍|血圧|SpO2|SPO2|BT|HR|Pulse|BP|酸素飽和度)\s*[:：]?\s*/i, '');
};

const csvEscape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

const buildLabTimelineCsv = (rows: LabTimelineRow[]) => [
  ['日付', '種別', '内容'].map(csvEscape).join(','),
  ...rows.map((row) => [
    row.date,
    row.type === 'result' ? '結果' : '依頼',
    row.item,
  ].map(csvEscape).join(',')),
].join('\n');

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const WardWorkspace = ({
  admissions,
  currentUser,
  onAuthExpired,
  onOpenChart,
  onRefreshAdmissions,
}: WardWorkspaceProps) => {
  const [selectedAdmissionId, setSelectedAdmissionId] = useState<number | null>(null);
  const [instructions, setInstructions] = useState<InpatientInstruction[]>([]);
  const [nursingNotes, setNursingNotes] = useState<NursingNote[]>([]);
  const [documents, setDocuments] = useState<InpatientDocument[]>([]);
  const [progress, setProgress] = useState<InpatientProgress | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<InpatientSummaryDraft | null>(null);
  const [events, setEvents] = useState<InpatientEvent[]>([]);
  const [pathway, setPathway] = useState<InpatientPathway | null>(null);
  const [pathwayMasters, setPathwayMasters] = useState<InpatientPathwayMaster[]>([]);
  const [selectedPathwayMasterId, setSelectedPathwayMasterId] = useState('');
  const [pathwayRoleFilter, setPathwayRoleFilter] = useState('all');
  const [, setSummaryReviews] = useState<InpatientAiSummaryReview[]>([]);
  const [dischargePlan, setDischargePlan] = useState<InpatientDischargePlan | null>(null);
  const [claimDraft, setClaimDraft] = useState<ClaimDraft | null>(null);
  const [editingClaimLineId, setEditingClaimLineId] = useState<number | null>(null);
  const [claimLineForm, setClaimLineForm] = useState({ receiptCode: '', receiptName: '', points: '', unit: '' });
  const [receiptCodeCandidates, setReceiptCodeCandidates] = useState<ReceiptCodeCandidate[]>([]);
  const [orcaPreviewPayload, setOrcaPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [isLoadingReceiptCandidates, setIsLoadingReceiptCandidates] = useState(false);
  const [beds, setBeds] = useState<InpatientBed[]>([]);
  const [careAssignments, setCareAssignments] = useState<InpatientCareAssignment[]>([]);
  const [isAssigningAdmissionId, setIsAssigningAdmissionId] = useState<number | null>(null);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [instructionForm, setInstructionForm] = useState(emptyInstructionForm);
  const [isInstructionFormOpen, setIsInstructionFormOpen] = useState(false);
  const [editingInstructionId, setEditingInstructionId] = useState<number | null>(null);
  const [instructionEditForm, setInstructionEditForm] = useState(emptyInstructionForm);
  const [editingDocumentId, setEditingDocumentId] = useState<number | null>(null);
  const [documentForm, setDocumentForm] = useState({ title: '', body: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [isPatientListOpen, setIsPatientListOpen] = useState(false);
  const [selectedLabRowKeys, setSelectedLabRowKeys] = useState<Set<string>>(() => new Set());
  const [lastSelectedLabKey, setLastSelectedLabKey] = useState<string | null>(null);
  const [isDraggingLabSelection, setIsDraggingLabSelection] = useState(false);
  const [labDragMode, setLabDragMode] = useState<'select' | 'deselect'>('select');
  const [drawerPanel, setDrawerPanel] = useState<WardDrawerPanel>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingInstruction, setIsSavingInstruction] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isSavingDocument, setIsSavingDocument] = useState(false);
  const [isStartingPathway, setIsStartingPathway] = useState(false);
  const [isReviewingSummary, setIsReviewingSummary] = useState(false);
  const [isSavingDischargePlan, setIsSavingDischargePlan] = useState(false);
  const [isSavingClaimDraft, setIsSavingClaimDraft] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAdmissionId === null || admissions.some((admission) => admission.id === selectedAdmissionId)) {
      return;
    }
    setSelectedAdmissionId(null);
  }, [admissions, selectedAdmissionId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies(selectedAdmissionId): 入院の切替をトリガーに選択・編集状態をリセットする
  useEffect(() => {
    setSelectedLabRowKeys(new Set());
    setLastSelectedLabKey(null);
    setIsDraggingLabSelection(false);
    setEditingClaimLineId(null);
    setReceiptCodeCandidates([]);
    setOrcaPreviewPayload(null);
  }, [selectedAdmissionId]);

  const selectedAdmission = useMemo(
    () => selectedAdmissionId === null ? null : admissions.find((admission) => admission.id === selectedAdmissionId) ?? null,
    [admissions, selectedAdmissionId],
  );

  useEffect(() => {
    if (!selectedAdmission) {
      setInstructions([]);
      setNursingNotes([]);
      setDocuments([]);
      setProgress(null);
      setSummaryDraft(null);
      setEvents([]);
      setPathway(null);
      setSummaryReviews([]);
      setDischargePlan(null);
      setClaimDraft(null);
      setEditingInstructionId(null);
      setInstructionEditForm(emptyInstructionForm);
      setEditingDocumentId(null);
      setDocumentForm({ title: '', body: '' });
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setErrorMessage(null);
      try {
        const [
          nextInstructions,
          nextNotes,
          nextDocuments,
          nextProgress,
          nextSummaryDraft,
          nextEvents,
          nextPathway,
          nextPathwayMasters,
          nextSummaryReviews,
          nextDischargePlan,
          nextClaimDraft,
        ] = await Promise.all([
          listInpatientInstructions(selectedAdmission.id),
          listNursingNotes(selectedAdmission.id),
          listInpatientDocuments(selectedAdmission.id),
          getInpatientProgress(selectedAdmission.id),
          getInpatientSummaryDraft(selectedAdmission.id),
          listInpatientEvents(selectedAdmission.id),
          getInpatientPathway(selectedAdmission.id),
          listInpatientPathwayMasters(),
          listInpatientSummaryReviews(selectedAdmission.id),
          getInpatientDischargePlan(selectedAdmission.id),
          getInpatientClaimDraft(selectedAdmission.id),
        ]);
        if (cancelled) {
          return;
        }
        setInstructions(nextInstructions);
        setNursingNotes(nextNotes);
        setDocuments(nextDocuments);
        setProgress(nextProgress);
        setSummaryDraft(nextSummaryDraft);
        setEvents(nextEvents);
        setPathway(nextPathway);
        setPathwayMasters(nextPathwayMasters);
        setSelectedPathwayMasterId(nextPathway?.pathwayMasterId ?? nextPathwayMasters[0]?.id ?? '');
        setSummaryReviews(nextSummaryReviews);
        setDischargePlan(nextDischargePlan);
        setClaimDraft(nextClaimDraft);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '病棟詳細の取得に失敗しました。');
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired, selectedAdmission]);

  useEffect(() => {
    if (!isDraggingLabSelection) {
      return undefined;
    }

    const stopDragging = () => setIsDraggingLabSelection(false);
    window.addEventListener('pointerup', stopDragging);
    return () => window.removeEventListener('pointerup', stopDragging);
  }, [isDraggingLabSelection]);

  useEffect(() => {
    let cancelled = false;

    const loadBeds = async () => {
      try {
        const [nextBeds, nextCareAssignments] = await Promise.all([
          listInpatientBeds(),
          listMyInpatientCareAssignments(),
        ]);
        if (!cancelled) {
          setBeds(nextBeds);
          setCareAssignments(nextCareAssignments);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '病床一覧の取得に失敗しました。');
      }
    };

    loadBeds();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired]);

  const refreshAdmissions = async () => {
    const [nextAdmissions, nextBeds] = await Promise.all([
      listInpatientAdmissions({ status: 'all' }),
      listInpatientBeds(),
    ]);
    onRefreshAdmissions(nextAdmissions.filter((item) => item.status === 'active' || item.status === 'discharge_permitted'));
    setBeds(nextBeds);
  };

  const handleCreateInstruction = async () => {
    if (!selectedAdmission || isSavingInstruction || !instructionForm.title.trim()) {
      return;
    }

    setIsSavingInstruction(true);
    setErrorMessage(null);
    try {
      const instruction = await createInpatientInstruction(selectedAdmission.id, {
        category: instructionForm.category.trim() || '指示',
        title: instructionForm.title.trim(),
        dueAt: instructionForm.dueAt || undefined,
      });
      setInstructions((current) => [instruction, ...current]);
      setProgress(await getInpatientProgress(selectedAdmission.id));
      setInstructionForm(emptyInstructionForm);
      setIsInstructionFormOpen(false);
      await refreshAdmissions();
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入院指示の追加に失敗しました。');
    } finally {
      setIsSavingInstruction(false);
    }
  };

  const handleInstructionStatus = async (
    instruction: InpatientInstruction,
    status: InpatientInstruction['status'],
  ) => {
    try {
      const updated = await updateInpatientInstructionStatus(instruction.id, status);
      setInstructions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '指示の更新に失敗しました。');
    }
  };

  const startEditingInstruction = (instruction: InpatientInstruction) => {
    setEditingInstructionId(instruction.id);
    setInstructionEditForm({
      category: instruction.category,
      title: instruction.title,
      dueAt: instruction.dueAt ? instruction.dueAt.slice(0, 16) : '',
    });
  };

  const handleSaveInstruction = async (instruction: InpatientInstruction) => {
    if (instruction.status !== 'pending' || isSavingInstruction) {
      return;
    }

    setIsSavingInstruction(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientInstruction(instruction.id, {
        category: instructionEditForm.category,
        title: instructionEditForm.title,
        dueAt: instructionEditForm.dueAt || null,
      });
      setInstructions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingInstructionId(null);
      setInstructionEditForm(emptyInstructionForm);
      setProgress(selectedAdmission ? await getInpatientProgress(selectedAdmission.id) : progress);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '指示の保存に失敗しました。');
    } finally {
      setIsSavingInstruction(false);
    }
  };

  const handleSaveNote = async () => {
    if (!selectedAdmission || isSavingNote) {
      return;
    }

    setIsSavingNote(true);
    setErrorMessage(null);
    try {
      const note = await createNursingNote(selectedAdmission.id, noteForm);
      setNursingNotes((current) => [note, ...current]);
      setProgress(await getInpatientProgress(selectedAdmission.id));
      setNoteForm(emptyNoteForm);
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '看護記録の保存に失敗しました。');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCreateDocument = async (documentType: InpatientDocumentType) => {
    if (!selectedAdmission || isCreatingDocument) {
      return;
    }

    setIsCreatingDocument(true);
    setErrorMessage(null);
    try {
      const document = await createInpatientDocument(selectedAdmission.id, { documentType });
      setDocuments((current) => [document, ...current]);
      setEditingDocumentId(document.id);
      setDocumentForm({ title: document.title, body: document.body });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の作成に失敗しました。');
    } finally {
      setIsCreatingDocument(false);
    }
  };

  const handleSignDocument = async (document: InpatientDocument) => {
    if (document.status === 'signed' || isSavingDocument) {
      return;
    }

    setIsSavingDocument(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientDocument(document.id, { status: 'signed' });
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingDocumentId(null);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の署名に失敗しました。');
    } finally {
      setIsSavingDocument(false);
    }
  };

  const startEditingDocument = (document: InpatientDocument) => {
    setEditingDocumentId(document.id);
    setDocumentForm({ title: document.title, body: document.body });
  };

  const handleSaveDocument = async (document: InpatientDocument) => {
    if (document.status !== 'draft' || isSavingDocument) {
      return;
    }

    setIsSavingDocument(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientDocument(document.id, {
        title: documentForm.title,
        body: documentForm.body,
      });
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingDocumentId(null);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の保存に失敗しました。');
    } finally {
      setIsSavingDocument(false);
    }
  };

  const handleArchiveDocument = async (document: InpatientDocument) => {
    if (document.status === 'archived' || isSavingDocument) {
      return;
    }

    setIsSavingDocument(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientDocument(document.id, { status: 'archived' });
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingDocumentId(null);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の取消に失敗しました。');
    } finally {
      setIsSavingDocument(false);
    }
  };

  const handlePrintDocument = (document: InpatientDocument) => {
    const content = [
      `<h1>${document.title}</h1>`,
      `<p>患者: ${selectedAdmission?.patientName ?? ''} / 入院ID: ${selectedAdmission?.id ?? ''}</p>`,
      `<p>状態: ${documentStatusLabels[document.status]} / 作成: ${document.createdBy} / 更新: ${document.updatedAt}</p>`,
      `<pre>${document.body.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</pre>`,
    ].join('\n');
    downloadTextFile(
      `inpatient-document-${document.id}.html`,
      `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${document.title}</title><body>${content}</body></html>`,
      'text/html;charset=utf-8',
    );
  };

  const handleCreateSummaryDocument = async () => {
    if (!selectedAdmission || !summaryDraft || isCreatingDocument) {
      return;
    }

    setIsCreatingDocument(true);
    setErrorMessage(null);
    try {
      const document = await createInpatientDocument(selectedAdmission.id, {
        documentType: 'discharge_summary',
        title: '退院サマリ',
        body: summaryDraft.body,
      });
      setDocuments((current) => [document, ...current]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '要約案の文書化に失敗しました。');
    } finally {
      setIsCreatingDocument(false);
    }
  };

  const refreshEvents = async () => {
    if (!selectedAdmission) {
      return;
    }
    setEvents(await listInpatientEvents(selectedAdmission.id));
  };

  const handleStartPathway = async () => {
    if (!selectedAdmission || isStartingPathway) {
      return;
    }

    setIsStartingPathway(true);
    setErrorMessage(null);
    try {
      const selectedMaster = pathwayMasters.find((master) => master.id === selectedPathwayMasterId);
      const nextPathway = await createInpatientPathway(selectedAdmission.id, {
        pathwayMasterId: selectedMaster?.id,
        pathwayName: selectedMaster?.name ?? '標準入院パス',
      });
      setPathway(nextPathway);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'クリティカルパスの開始に失敗しました。');
    } finally {
      setIsStartingPathway(false);
    }
  };

  const handlePathwayTaskStatus = async (
    task: InpatientPathwayTask,
    status: InpatientPathwayTask['status'],
  ) => {
    try {
      const updated = await updateInpatientPathwayTask(task.id, {
        status,
        varianceNote: status === 'variance' ? `${task.title} の逸脱を記録` : undefined,
      });
      setPathway((current) => current ? {
        ...current,
        tasks: current.tasks.map((item) => (item.id === updated.id ? updated : item)),
      } : current);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'パスタスクの更新に失敗しました。');
    }
  };

  const handleSummaryReview = async (status: InpatientAiSummaryReview['status']) => {
    if (!selectedAdmission || !summaryDraft || isReviewingSummary) {
      return;
    }

    setIsReviewingSummary(true);
    setErrorMessage(null);
    try {
      const review = await createInpatientSummaryReview(selectedAdmission.id, {
        summaryTitle: summaryDraft.title,
        summaryBody: summaryDraft.body,
        status,
        sourceCounts: summaryDraft.sourceCounts,
        reviewNote: status === 'accepted' ? '退院サマリ作成候補として採用' : '記載内容を再確認',
      });
      setSummaryReviews((current) => [review, ...current]);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '要約レビューの保存に失敗しました。');
    } finally {
      setIsReviewingSummary(false);
    }
  };

  const handleSaveDischargePlan = async (status: InpatientDischargePlan['status']) => {
    if (!selectedAdmission || !dischargePlan || isSavingDischargePlan) {
      return;
    }

    setIsSavingDischargePlan(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientDischargePlan(selectedAdmission.id, {
        status,
        dischargeMedicationNote: dischargePlan.dischargeMedicationNote,
        billingCandidates: dischargePlan.billingCandidates,
        followUpNote: dischargePlan.followUpNote,
      });
      setDischargePlan(updated);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '退院計画の保存に失敗しました。');
    } finally {
      setIsSavingDischargePlan(false);
    }
  };

  const handleCreateClaimDraft = async () => {
    if (!selectedAdmission || isSavingClaimDraft) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await createInpatientClaimDraft(selectedAdmission.id);
      setClaimDraft(draft);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '請求ドラフトの作成に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleUpdateClaimDraftStatus = async (status: ClaimDraft['status']) => {
    if (!claimDraft || isSavingClaimDraft) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await updateClaimDraftStatus(claimDraft.id, status);
      setClaimDraft(draft);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '請求ドラフトの更新に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleRecheckClaimDraft = async () => {
    if (!claimDraft || isSavingClaimDraft) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await recheckClaimDraft(claimDraft.id);
      const preview = await previewClaimDraftOrcaPayload(draft.id);
      setClaimDraft(draft);
      setOrcaPreviewPayload(preview);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '請求ドラフトの再点検に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handlePreviewClaimDraft = async () => {
    if (!claimDraft || isSavingClaimDraft) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const preview = await previewClaimDraftOrcaPayload(claimDraft.id);
      setOrcaPreviewPayload(preview);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '送信前previewの取得に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleUpdateClaimLineAdjustmentStatus = async (
    adjustment: ClaimLineAdjustment,
    status: ClaimLineAdjustment['status'],
  ) => {
    if (isSavingClaimDraft || adjustment.status === status) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await updateClaimLineAdjustmentStatus(adjustment.id, status);
      setClaimDraft(draft);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '請求点数調整の更新に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const startEditClaimLine = async (line: ClaimDraftLine) => {
    setEditingClaimLineId(line.id);
    setClaimLineForm({
      receiptCode: line.receiptCode ?? '',
      receiptName: line.receiptName ?? '',
      points: String(line.points),
      unit: line.unit ?? '',
    });
    setReceiptCodeCandidates([]);
    setIsLoadingReceiptCandidates(true);
    try {
      const candidates = await listClaimDraftLineReceiptCodeCandidates(line.id);
      setReceiptCodeCandidates(candidates);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setReceiptCodeCandidates([]);
    } finally {
      setIsLoadingReceiptCandidates(false);
    }
  };

  const applyReceiptCodeCandidate = (candidate: ReceiptCodeCandidate) => {
    setClaimLineForm({
      receiptCode: candidate.receiptCode,
      receiptName: candidate.receiptName,
      points: candidate.points !== undefined ? String(candidate.points) : claimLineForm.points,
      unit: candidate.unit ?? claimLineForm.unit,
    });
  };

  const handleUpdateClaimLineReceiptCode = async (line: ClaimDraftLine) => {
    if (isSavingClaimDraft || !claimLineForm.receiptCode.trim()) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await updateClaimDraftLineReceiptCode(line.id, {
        receiptCode: claimLineForm.receiptCode.trim(),
        receiptName: claimLineForm.receiptName.trim() || undefined,
        points: claimLineForm.points.trim() ? Number(claimLineForm.points) : undefined,
        unit: claimLineForm.unit.trim() || undefined,
        resolveIssues: true,
      });
      setClaimDraft(draft);
      setEditingClaimLineId(null);
      setReceiptCodeCandidates([]);
      setOrcaPreviewPayload(null);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '請求明細コードの補正に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleSubmitClaimDraftToOrca = async () => {
    if (!claimDraft || isSavingClaimDraft) {
      return;
    }

    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const transmission = await submitClaimDraftToOrca(claimDraft.id);
      const preview = await previewClaimDraftOrcaPayload(claimDraft.id);
      setClaimDraft((current) => current ? {
        ...current,
        status: transmission.status === 'accepted' ? 'submitted' : 'error',
        transmissions: [transmission, ...current.transmissions],
      } : current);
      setOrcaPreviewPayload(preview);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'ORCA送信に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const applyLabRowSelection = (key: string, mode: 'select' | 'deselect') => {
    setSelectedLabRowKeys((current) => {
      const next = new Set(current);
      if (mode === 'select') {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleLabRowPointerDown = (event: PointerEvent<HTMLButtonElement>, row: LabTimelineRow, index: number) => {
    if (event.button !== 0) {
      return;
    }

    if (event.shiftKey && lastSelectedLabKey) {
      const previousIndex = labTimelineRows.findIndex((item) => item.key === lastSelectedLabKey);
      if (previousIndex >= 0) {
        const [start, end] = [previousIndex, index].sort((a, b) => a - b);
        setSelectedLabRowKeys((current) => {
          const next = new Set(current);
          for (const item of labTimelineRows.slice(start, end + 1)) {
            next.add(item.key);
          }
          return next;
        });
        setIsDraggingLabSelection(false);
        return;
      }
    }

    const nextMode = selectedLabRowKeys.has(row.key) ? 'deselect' : 'select';
    setLabDragMode(nextMode);
    setIsDraggingLabSelection(true);
    setLastSelectedLabKey(row.key);
    applyLabRowSelection(row.key, nextMode);
  };

  const handleLabRowPointerEnter = (row: LabTimelineRow) => {
    if (!isDraggingLabSelection) {
      return;
    }
    applyLabRowSelection(row.key, labDragMode);
  };

  const handleCopyLabRows = async () => {
    if (labRowsForExport.length === 0) {
      return;
    }

    const text = labRowsForExport
      .map((row) => `${row.date}\t${row.type === 'result' ? '結果' : '依頼'}\t${row.item}`)
      .join('\n');
    await navigator.clipboard.writeText(text);
  };

  const handleDownloadLabCsv = () => {
    if (labRowsForExport.length === 0) {
      return;
    }

    const filename = `${selectedAdmission?.patientName ?? 'ward'}-labs-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(filename, buildLabTimelineCsv(labRowsForExport), 'text/csv;charset=utf-8');
  };

  const pendingInstructions = instructions.filter((instruction) => instruction.status === 'pending');
  const progressRows = progress?.rows ?? [];
  const vitalTrendRows = progressRows.slice(0, 10);
  const labTimelineRows = progressRows.flatMap((row) => [
    ...row.labs.map((item, index) => ({
      key: `${row.date}:result:${index}:${item}`,
      date: row.date,
      type: 'result' as const,
      item,
    })),
    ...row.labOrders.map((item, index) => ({
      key: `${row.date}:order:${index}:${item}`,
      date: row.date,
      type: 'order' as const,
      item,
    })),
  ]);
  const selectedLabRows = labTimelineRows.filter((row) => selectedLabRowKeys.has(row.key));
  const labRowsForExport = selectedLabRows.length > 0 ? selectedLabRows : labTimelineRows;
  const unsignedDocumentCount = documents.filter((document) => document.status !== 'signed').length;
  const openClaimIssueCount = claimDraft?.issues.filter((issue) => issue.status === 'open').length ?? 0;
  const reviewClaimAdjustmentCount = claimDraft?.adjustments.filter((adjustment) => adjustment.status === 'suggested').length ?? 0;
  const highlightedClaimIssues = claimDraft?.issues.filter((issue) => issue.status === 'open' && [
    'claim_line_unresolved_receipt_code',
    'missing_receipt_code',
    'lab_order_not_done',
    'instruction_not_done',
  ].includes(issue.issueType)) ?? [];
  const claimIssuesByType = highlightedClaimIssues.reduce<Record<string, ClaimDraft['issues']>>((groups, issue) => {
    groups[issue.issueType] = [...(groups[issue.issueType] ?? []), issue];
    return groups;
  }, {});
  const unresolvedClaimLineCount = claimDraft?.lines.filter((line) => !line.receiptCode).length ?? 0;
  const latestClaimTransmission = claimDraft?.transmissions[0] ?? null;
  const previewPayloadSource = orcaPreviewPayload ?? latestClaimTransmission?.requestPayload ?? null;
  const previewValidation = asRecord(previewPayloadSource?.validation);
  const previewCanSubmit = previewValidation?.can_submit === true;
  const latestClaimPayload = previewPayloadSource ? getOrcaPayloadClaim(previewPayloadSource) : null;
  const latestPayloadSummary = getPayloadSummary(latestClaimPayload);
  const hasLatestPayloadSummary = Boolean(latestPayloadSummary);
  const latestSendableItems = getPayloadArray(latestClaimPayload, 'orca_receipt_items');
  const latestUnresolvedItems = getPayloadArray(latestClaimPayload, 'unresolved_items');
  const dischargeStatusLabel = dischargePlan?.status === 'ready'
    ? '退院準備完了'
    : dischargePlan?.status === 'reviewed'
      ? '退院レビュー済'
      : '退院下書き';
  const claimStatusLabel = claimDraft
    ? claimDraft.status === 'submitted'
      ? '請求送信済'
      : claimDraft.status === 'error'
        ? '送信エラー'
        : claimDraft.status === 'ready'
          ? '請求準備完了'
          : claimDraft.status === 'reviewed'
            ? '請求レビュー済'
            : '請求下書き'
    : '請求未作成';
  const actionItems = [
    {
      label: '未実施指示',
      value: pendingInstructions.length,
      tone: pendingInstructions.length > 0 ? 'amber' : 'green',
      detail: pendingInstructions[0]?.title ?? '未実施指示なし',
    },
    {
      label: '未署名文書',
      value: unsignedDocumentCount,
      tone: unsignedDocumentCount > 0 ? 'blue' : 'green',
      detail: documents[0]?.title ?? '文書未作成',
    },
    {
      label: '会計要確認',
      value: openClaimIssueCount + reviewClaimAdjustmentCount,
      tone: openClaimIssueCount + reviewClaimAdjustmentCount > 0 ? 'red' : 'gray',
      detail: claimDraft ? `${openClaimIssueCount} issue / ${reviewClaimAdjustmentCount} 提案` : '請求ドラフト未作成',
    },
    {
      label: '退院前確認',
      value: dischargePlan?.status === 'ready' ? 0 : 1,
      tone: dischargePlan?.status === 'ready' ? 'green' : 'blue',
      detail: dischargeStatusLabel,
    },
  ];
  const currentAiSummaryLine = [...(summaryDraft?.keyEvents ?? [])].reverse().find((event) => !event.includes(' 入院')) ?? summaryDraft?.keyEvents[0] ?? '記録を集約中';
  const currentAiSummarySentence = currentAiSummaryLine.replace(/[。.!！?？]+$/, '');
  const nextAiSummaryAction = pendingInstructions[0]
    ? `${pendingInstructions[0].category}: ${pendingInstructions[0].title}`
    : claimDraft && openClaimIssueCount + reviewClaimAdjustmentCount > 0
      ? `請求点検 ${openClaimIssueCount + reviewClaimAdjustmentCount}件`
      : dischargePlan?.status === 'ready'
        ? '退院準備完了を確認'
        : '退院可否と未署名文書を確認';
  const aiOverviewText = [
    `${selectedAdmission?.patientName ?? '選択患者'}さんは、${selectedAdmission?.primaryDiagnosis ?? selectedAdmission?.note ?? '入院目的未設定'}で${selectedAdmission?.wardName ?? '病棟未定'} ${selectedAdmission?.bedLabel ?? '病床未定'}に入院中です。`,
    `入院${selectedAdmission?.stayDays ?? '-'}日目で、直近では${currentAiSummarySentence}。`,
    `現時点の優先確認は「${nextAiSummaryAction}」です。`,
  ].join(' ');
  const pathwayTaskCounts = pathway?.tasks.reduce(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    { pending: 0, done: 0, variance: 0, skipped: 0 } as Record<InpatientPathwayTask['status'], number>,
  );
  const pathwayRoles = Array.from(new Set((pathway?.tasks ?? []).map((task) => task.role || '未設定'))).sort();
  const filteredPathwayTasks = (pathway?.tasks ?? []).filter((task) => pathwayRoleFilter === 'all' || (task.role || '未設定') === pathwayRoleFilter);
  const nursingNecessity = {
    pendingInstructions: pendingInstructions.length,
    recentNursingNotes: nursingNotes.filter((note) => note.recordedAt.slice(0, 10) === new Date().toLocaleDateString('sv-SE')).length,
    unsignedDocuments: unsignedDocumentCount,
    varianceTasks: pathway?.tasks.filter((task) => task.status === 'variance').length ?? 0,
  };
  const nursingNecessityScore = nursingNecessity.pendingInstructions * 2 + nursingNecessity.varianceTasks * 2 + nursingNecessity.unsignedDocuments + Math.max(0, 2 - nursingNecessity.recentNursingNotes);
  const nursingNecessityLevel = nursingNecessityScore >= 6 ? '高' : nursingNecessityScore >= 3 ? '中' : '低';
  const bedsByWard = useMemo(() => {
    const grouped = new Map<string, InpatientBed[]>();
    beds.forEach((bed) => {
      const key = `${bed.wardId}:${bed.wardName}`;
      grouped.set(key, [...(grouped.get(key) ?? []), bed]);
    });
    return Array.from(grouped.entries()).map(([key, wardBeds]) => ({
      key,
      wardName: wardBeds[0]?.wardName ?? '病棟未設定',
      beds: wardBeds,
    }));
  }, [beds]);
  const occupiedBedIds = new Set(admissions.map((admission) => admission.bedId).filter(Boolean));
  const bedCounts = beds.reduce(
    (counts, bed) => {
      counts[occupiedBedIds.has(bed.id) ? 'occupied' : bed.status] += 1;
      return counts;
    },
    { available: 0, occupied: 0, cleaning: 0, blocked: 0 } as Record<InpatientBed['status'], number>,
  );

  const handleTransfer = async (bed: InpatientBed) => {
    if (!selectedAdmission || bed.status !== 'available' || isTransferring) {
      return;
    }

    setIsTransferring(true);
    setErrorMessage(null);
    try {
      const updated = await transferInpatientAdmission(selectedAdmission.id, {
        wardId: bed.wardId,
        bedId: bed.id,
        note: `${bed.wardName} ${bed.bedLabel} へ転床`,
      });
      onRefreshAdmissions(admissions.map((admission) => (admission.id === updated.id ? updated : admission)));
      setSelectedAdmissionId(updated.id);
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '転床に失敗しました。');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleBedStatus = async (bed: InpatientBed, status: InpatientBed['status']) => {
    try {
      const updated = await updateInpatientBedStatus(bed.id, status, bed.note);
      setBeds((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '病床状態の更新に失敗しました。');
    }
  };

  const handleCareAssignment = async (admission: InpatientAdmission) => {
    if (isAssigningAdmissionId !== null) return;
    setIsAssigningAdmissionId(admission.id);
    setErrorMessage(null);
    try {
      const current = careAssignments.find((item) => item.admissionId === admission.id);
      if (current) {
        await unassignInpatientFromMe(admission.id);
        setCareAssignments((items) => items.filter((item) => item.admissionId !== admission.id));
      } else {
        const assignment = await assignInpatientToMe(admission.id);
        setCareAssignments((items) => [...items, assignment]);
      }
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '担当患者の更新に失敗しました。');
    } finally {
      setIsAssigningAdmissionId(null);
    }
  };

  return (
    <main className='mx-auto w-full max-w-[1440px] space-y-4 px-4 py-5 lg:px-6'>
      <section className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-[28px] font-bold leading-tight text-text-primary'>病棟</h1>
          <p className='mt-1 text-[14px] text-text-tertiary'>病床・入退転棟・担当患者</p>
        </div>
        <div className='flex flex-wrap items-center gap-2 text-[12px] text-text-secondary'>
          <span className='rounded-full border border-border bg-card px-3 py-1'>入院中 {admissions.length}</span>
          <span className='rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-yellow-1100'>
            未実施 {admissions.reduce((sum, item) => sum + item.pendingInstructionCount, 0)}
          </span>
          <span className='rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-900'>空床 {bedCounts.available}</span>
          <span className='rounded-full border border-border bg-card px-3 py-1'>清掃中 {bedCounts.cleaning}</span>
        </div>
      </section>

      {errorMessage ? (
        <section className='rounded-8 border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-900'>
          {errorMessage}
        </section>
      ) : null}

      <WardOverview
        admissions={admissions}
        assignments={careAssignments}
        beds={beds}
        currentUser={currentUser}
        isAssigning={isAssigningAdmissionId}
        onAssign={handleCareAssignment}
        onBedStatus={handleBedStatus}
        onOpenChart={onOpenChart}
        onSelect={(admissionId) => setSelectedAdmissionId(admissionId)}
      />

      {selectedAdmission ? <section className='sticky top-0 z-20 rounded-8 border border-border bg-card shadow-sm'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <Users size={18} className='text-brand' />
            <div className='min-w-0'>
              <h2 className='text-[15px] font-bold text-text-primary'>選択患者</h2>
              <p className='truncate text-[12px] text-text-tertiary'>
                {selectedAdmission
                  ? `${selectedAdmission.patientName} · ${selectedAdmission.wardName ?? '病棟未定'} ${selectedAdmission.bedLabel ?? '病床未定'} · ${selectedAdmission.stayDays}日目`
                  : '患者未選択'}
              </p>
            </div>
          </div>
          <Button onClick={() => setIsPatientListOpen((current) => !current)} size='xs' type='button' variant='outline'>
            {isPatientListOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            患者を選ぶ
          </Button>
          <Button onClick={() => setSelectedAdmissionId(null)} size='xs' type='button' variant='ghost'>
            <ArrowLeft size={14} />全体へ戻る
          </Button>
        </div>
        {isPatientListOpen ? (
          <div className='overflow-x-auto border-b border-border'>
            <div className='min-w-[900px] divide-y divide-border'>
              {admissions.map((admission) => (
                <button
                  className={cn(
                    'grid w-full grid-cols-[11rem_11rem_5rem_minmax(12rem,1fr)_6rem_9rem] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-subtle',
                    selectedAdmission?.id === admission.id ? 'bg-blue-50' : 'bg-card',
                  )}
                  key={admission.id}
                  onClick={() => {
                    setSelectedAdmissionId(admission.id);
                    setIsPatientListOpen(false);
                  }}
                  type='button'
                >
                  <span className='truncate text-[14px] font-bold text-text-primary'>{admission.patientName}</span>
                  <span className='text-[12px] text-text-secondary'>
                    {admission.wardName ?? '病棟未定'} {admission.bedLabel ?? '病床未定'}
                  </span>
                  <span className='text-[12px] font-bold text-text-secondary'>{admission.stayDays}日目</span>
                  <span className='truncate text-[12px] text-text-secondary'>
                    {admission.primaryDiagnosis ?? admission.note ?? '入院目的未設定'}
                  </span>
                  <span className={cn(
                    'w-fit rounded-md border px-2 py-1 text-[11px] font-bold',
                    admission.pendingInstructionCount > 0 ? 'border-yellow-200 bg-yellow-50 text-yellow-1100' : 'border-green-200 bg-green-50 text-green-900',
                  )}>
                    未実施 {admission.pendingInstructionCount}
                  </span>
                  <span className='flex items-center justify-end gap-1 text-[11px] font-bold text-brand'>
                    選択 <ChevronRight size={13} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {selectedAdmission ? (
          <div className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'>
            <div className='flex min-w-0 flex-wrap items-center gap-3'>
              <UserRoundCheck size={18} className='text-brand' />
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='text-[18px] font-bold text-text-primary'>{selectedAdmission.patientName}</h2>
                  <span className='rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[12px] text-text-secondary'>
                    {selectedAdmission.wardName ?? '病棟未定'} {selectedAdmission.bedLabel ?? '病床未定'} · {selectedAdmission.stayDays}日目
                  </span>
                </div>
                <p className='mt-1 text-[13px] text-text-secondary'>
                  {selectedAdmission.primaryDiagnosis ?? '主病名未設定'} · 担当 {selectedAdmission.attendingDoctor} · {dischargeStatusLabel} · {claimStatusLabel}
                </p>
                <div className='mt-3 rounded-8 border border-blue-100 bg-blue-50/80 p-3.5'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Activity size={15} className='text-brand' />
                        <p className='text-[13px] font-bold text-blue-950'>AI Overview</p>
                        <span className='rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-bold text-blue-900'>
                          {summaryDraft?.periodLabel ?? '集約中'}
                        </span>
                      </div>
                      <p className='mt-2 max-w-[78rem] text-[14px] leading-relaxed text-blue-950'>{aiOverviewText}</p>
                      <div className='mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-blue-900'>
                        <span className='rounded-full border border-blue-100 bg-white px-2 py-0.5'>看護 {summaryDraft?.sourceCounts.nursingNotes ?? 0}</span>
                        <span className='rounded-full border border-blue-100 bg-white px-2 py-0.5'>観察 {summaryDraft?.sourceCounts.observations ?? 0}</span>
                        <span className='rounded-full border border-blue-100 bg-white px-2 py-0.5'>処方 {summaryDraft?.sourceCounts.prescriptions ?? 0}</span>
                        <span className='rounded-full border border-blue-100 bg-white px-2 py-0.5'>指示 {summaryDraft?.sourceCounts.instructions ?? 0}</span>
                      </div>
                    </div>
                    <Button onClick={() => setDrawerPanel('summary')} size='xs' type='button' variant='outline'>
                      全文
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button onClick={() => setDrawerPanel('summary')} size='xs' type='button' variant='outline'>
                <Activity size={14} />
                AI要約
              </Button>
              <Button onClick={() => setDrawerPanel('claim')} size='xs' type='button' variant='outline'>
                <ReceiptText size={14} />
                請求点検
              </Button>
              <Button onClick={() => setDrawerPanel('events')} size='xs' type='button' variant='outline'>
                <ListChecks size={14} />
                履歴
              </Button>
              <Button onClick={() => onOpenChart(selectedAdmission.patientId)} size='xs' type='button'>
                カルテを開く
              </Button>
            </div>
          </div>
        ) : null}
      </section> : null}

      {selectedAdmission ? (
        <Tabs className='gap-4' onValueChange={setActiveTab} value={activeTab}>
          <TabsList className='sticky top-[12.5rem] z-10 h-auto w-full flex-wrap justify-start gap-1 rounded-8 border border-solid-gray-300 bg-solid-gray-100 p-1 shadow-inner'>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='overview'
            >
              <ListChecks size={15} />概要
            </TabsTrigger>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='orders'
            >
              <ClipboardList size={15} />指示・記録
            </TabsTrigger>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='progress'
            >
              <Activity size={15} />経過表
            </TabsTrigger>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='documents'
            >
              <FileSignature size={15} />文書
            </TabsTrigger>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='billing'
            >
              <ReceiptText size={15} />退院・会計
            </TabsTrigger>
            <TabsTrigger
              className='min-h-11 rounded-md border border-transparent px-4 text-[14px] font-bold text-solid-gray-700 hover:border-solid-gray-300 hover:bg-white data-[state=active]:border-blue-900 data-[state=active]:bg-blue-900 data-[state=active]:text-white data-[state=active]:shadow-md'
              value='beds'
            >
              <Hospital size={15} />病床
            </TabsTrigger>
          </TabsList>

          <TabsContent className='space-y-4' value='overview'>
            <section className='grid gap-3 md:grid-cols-4'>
              {actionItems.map((item) => (
                <div
                  className={cn(
                    'rounded-8 border bg-card p-4',
                    item.tone === 'amber' && 'border-yellow-200 bg-yellow-50',
                    item.tone === 'red' && 'border-red-200 bg-red-50',
                    item.tone === 'blue' && 'border-blue-200 bg-blue-50',
                    item.tone === 'green' && 'border-green-200 bg-green-50',
                    item.tone === 'gray' && 'border-border bg-card',
                  )}
                  key={item.label}
                >
                  <div className='flex items-start justify-between gap-2'>
                    <p className='text-[12px] font-bold text-text-secondary'>{item.label}</p>
                    {item.label === '未実施指示' ? (
                      <Button onClick={() => setIsInstructionFormOpen(true)} size='xs' type='button' variant='ghost'>追加</Button>
                    ) : item.label === '未署名文書' ? (
                      <Button onClick={() => setActiveTab('documents')} size='xs' type='button' variant='ghost'>作成</Button>
                    ) : item.label === '会計要確認' ? (
                      <Button
                        disabled={isSavingClaimDraft}
                        onClick={() => claimDraft ? setDrawerPanel('claim') : handleCreateClaimDraft()}
                        size='xs'
                        type='button'
                        variant='ghost'
                      >
                        {claimDraft ? '点検' : '作成'}
                      </Button>
                    ) : (
                      <Button onClick={() => setActiveTab('billing')} size='xs' type='button' variant='ghost'>確認</Button>
                    )}
                  </div>
                  <p className='mt-2 text-[28px] font-bold leading-none text-text-primary'>{item.value}</p>
                  <p className='mt-2 min-h-10 text-[12px] leading-normal text-text-secondary'>{item.detail}</p>
                </div>
              ))}
            </section>

            <section className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.55fr)]'>
              <div className='rounded-8 border border-border bg-card'>
                <div className='flex items-center justify-between border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <ClipboardList size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>今日やること</h2>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-[12px] text-text-tertiary'>未実施 {pendingInstructions.length}</span>
                    <Button onClick={() => setIsInstructionFormOpen((current) => !current)} size='xs' type='button' variant='outline'>
                      {isInstructionFormOpen ? '閉じる' : '指示を追加'}
                    </Button>
                  </div>
                </div>
                <div className='divide-y divide-border'>
                  {isInstructionFormOpen ? (
                    <div className='grid gap-2 bg-blue-50/50 px-4 py-3 md:grid-cols-[8rem_minmax(0,1fr)_12rem_auto]'>
                      <Input
                        aria-label='指示カテゴリ'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, category: event.target.value }))}
                        placeholder='カテゴリ'
                        value={instructionForm.category}
                      />
                      <Input
                        aria-label='指示内容'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder='指示内容'
                        value={instructionForm.title}
                      />
                      <Input
                        aria-label='期限'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, dueAt: event.target.value }))}
                        type='datetime-local'
                        value={instructionForm.dueAt}
                      />
                      <Button disabled={isSavingInstruction || !instructionForm.title.trim()} onClick={handleCreateInstruction} size='sm' type='button'>
                        追加
                      </Button>
                    </div>
                  ) : null}
                  {pendingInstructions.slice(0, 5).map((instruction) => (
                    <div className='grid gap-3 px-4 py-3 md:grid-cols-[7rem_minmax(0,1fr)_10rem]' key={instruction.id}>
                      {editingInstructionId === instruction.id ? (
                        <>
                          <Input aria-label='指示カテゴリ' onChange={(event) => setInstructionEditForm((current) => ({ ...current, category: event.target.value }))} value={instructionEditForm.category} />
                          <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem]'>
                            <Input aria-label='指示内容' onChange={(event) => setInstructionEditForm((current) => ({ ...current, title: event.target.value }))} value={instructionEditForm.title} />
                            <Input aria-label='期限' onChange={(event) => setInstructionEditForm((current) => ({ ...current, dueAt: event.target.value }))} type='datetime-local' value={instructionEditForm.dueAt} />
                          </div>
                        </>
                      ) : (
                        <>
                          <span className='text-[13px] font-bold text-text-secondary'>{instruction.category}</span>
                          <div>
                            <p className='text-[14px] font-bold text-text-primary'>{instruction.title}</p>
                            <p className='mt-1 text-[12px] text-text-tertiary'>{instruction.dueAt ?? instruction.createdAt}</p>
                          </div>
                        </>
                      )}
                      <div className='flex flex-wrap gap-2'>
                        {editingInstructionId === instruction.id ? (
                          <>
                            <Button disabled={isSavingInstruction || !instructionEditForm.title.trim()} onClick={() => handleSaveInstruction(instruction)} size='xs' type='button' variant='outline'>保存</Button>
                            <Button onClick={() => setEditingInstructionId(null)} size='xs' type='button' variant='ghost'>閉じる</Button>
                          </>
                        ) : (
                          <Button disabled={instruction.status !== 'pending'} onClick={() => startEditingInstruction(instruction)} size='xs' type='button' variant='ghost'>編集</Button>
                        )}
                        <Button disabled={instruction.status === 'done'} onClick={() => handleInstructionStatus(instruction, 'done')} size='xs' type='button' variant='outline'>実施</Button>
                        <Button disabled={instruction.status === 'cancelled'} onClick={() => handleInstructionStatus(instruction, 'cancelled')} size='xs' type='button' variant='ghost'>中止</Button>
                      </div>
                    </div>
                  ))}
                  {pendingInstructions.length === 0 ? (
                    <div className='px-4 py-8 text-[13px] text-text-tertiary'>未実施指示はありません。</div>
                  ) : null}
                </div>
              </div>

              <div className='rounded-8 border border-border bg-card'>
                <div className='flex items-center gap-2 border-b border-border px-4 py-3'>
                  <Activity size={17} className='text-brand' />
                  <h2 className='text-[16px] font-bold text-text-primary'>直近イベント</h2>
                </div>
                <div className='max-h-80 divide-y divide-border overflow-auto'>
                  {events.slice(0, 5).map((event) => (
                    <article className='px-4 py-3' key={`${event.id}-${event.occurredAt}`}>
                      <div className='flex items-start justify-between gap-3'>
                        <h3 className='text-[13px] font-bold text-text-primary'>{event.title}</h3>
                        <span className='shrink-0 text-[11px] text-text-tertiary'>{event.occurredAt}</span>
                      </div>
                      {event.detail ? <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{event.detail}</p> : null}
                    </article>
                  ))}
                  {events.length === 0 ? <div className='px-4 py-8 text-[13px] text-text-tertiary'>イベント履歴はまだありません。</div> : null}
                </div>
              </div>
            </section>

            <section className='rounded-8 border border-border bg-card'>
              <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <ListChecks size={17} className='text-brand' />
                  <div>
                    <h2 className='text-[16px] font-bold text-text-primary'>クリティカルパス運用</h2>
                    <p className='mt-1 text-[12px] text-text-tertiary'>職種別フィルタと改訂履歴を確認できます。</p>
                  </div>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <select
                    className='h-8 rounded-md border border-border bg-white px-2 text-[12px] font-bold text-text-primary'
                    onChange={(event) => setPathwayRoleFilter(event.target.value)}
                    value={pathwayRoleFilter}
                  >
                    <option value='all'>全職種</option>
                    {pathwayRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <select
                    className='h-8 rounded-md border border-border bg-white px-2 text-[12px] font-bold text-text-primary'
                    onChange={(event) => setSelectedPathwayMasterId(event.target.value)}
                    value={selectedPathwayMasterId}
                  >
                    {pathwayMasters.map((master) => <option key={master.id} value={master.id}>{master.name}</option>)}
                  </select>
                  <Button disabled={!selectedAdmission || isStartingPathway} onClick={handleStartPathway} size='xs' type='button' variant='outline'>開始/改訂</Button>
                </div>
              </div>
              <div className='grid gap-3 border-b border-border p-4 sm:grid-cols-4'>
                {(['pending', 'done', 'variance', 'skipped'] as InpatientPathwayTask['status'][]).map((status) => (
                  <div className='rounded-md border border-border bg-surface-subtle p-3' key={status}>
                    <p className='text-[11px] font-bold text-text-tertiary'>{pathwayStatusLabels[status]}</p>
                    <p className='mt-2 text-[22px] font-bold text-text-primary'>{pathwayTaskCounts?.[status] ?? 0}</p>
                  </div>
                ))}
              </div>
              <div className='divide-y divide-border'>
                {filteredPathwayTasks.slice(0, 8).map((task) => (
                  <div className='grid gap-3 px-4 py-3 lg:grid-cols-[7rem_minmax(0,1fr)_8rem_12rem]' key={task.id}>
                    <span className='text-[12px] font-bold text-text-tertiary'>Day {task.dayOffset}</span>
                    <div>
                      <p className='text-[13px] font-bold text-text-primary'>{task.title}</p>
                      <p className='mt-1 text-[11px] text-text-tertiary'>{task.role ?? '職種未設定'} / {task.category}</p>
                    </div>
                    <span className={cn('h-fit rounded border px-2 py-1 text-[11px] font-bold', pathwayStatusClasses[task.status])}>{pathwayStatusLabels[task.status]}</span>
                    <div className='flex flex-wrap gap-2'>
                      <Button disabled={task.status === 'done'} onClick={() => handlePathwayTaskStatus(task, 'done')} size='xs' type='button' variant='outline'>完了</Button>
                      <Button disabled={task.status === 'variance'} onClick={() => handlePathwayTaskStatus(task, 'variance')} size='xs' type='button' variant='ghost'>逸脱</Button>
                    </div>
                  </div>
                ))}
                {filteredPathwayTasks.length === 0 ? (
                  <div className='px-4 py-6 text-[13px] text-text-tertiary'>表示できるパスタスクはありません。</div>
                ) : null}
              </div>
            </section>
          </TabsContent>

          <TabsContent className='grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,0.75fr)]' value='orders'>
            <section className='rounded-8 border border-border bg-card'>
                <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <ClipboardList size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>指示簿</h2>
                  </div>
                  <div className='flex items-center gap-2'>
                    <span className='text-[12px] text-text-tertiary'>未実施 {pendingInstructions.length}</span>
                    <Button onClick={() => setIsInstructionFormOpen((current) => !current)} size='xs' type='button' variant='outline'>
                      指示を追加
                    </Button>
                  </div>
                </div>
                <div className='divide-y divide-border'>
                  {isInstructionFormOpen ? (
                    <div className='grid gap-2 bg-blue-50/50 px-4 py-3 md:grid-cols-[8rem_minmax(0,1fr)_12rem_auto]'>
                      <Input
                        aria-label='指示カテゴリ'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, category: event.target.value }))}
                        placeholder='カテゴリ'
                        value={instructionForm.category}
                      />
                      <Input
                        aria-label='指示内容'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, title: event.target.value }))}
                        placeholder='指示内容'
                        value={instructionForm.title}
                      />
                      <Input
                        aria-label='期限'
                        onChange={(event) => setInstructionForm((current) => ({ ...current, dueAt: event.target.value }))}
                        type='datetime-local'
                        value={instructionForm.dueAt}
                      />
                      <Button disabled={isSavingInstruction || !instructionForm.title.trim()} onClick={handleCreateInstruction} size='sm' type='button'>
                        追加
                      </Button>
                    </div>
                  ) : null}
                  {instructions.map((instruction) => (
                  <div className='grid gap-3 px-4 py-3 lg:grid-cols-[7rem_minmax(0,1fr)_7rem_11rem]' key={instruction.id}>
                    {editingInstructionId === instruction.id ? (
                      <>
                        <Input aria-label='指示カテゴリ' onChange={(event) => setInstructionEditForm((current) => ({ ...current, category: event.target.value }))} value={instructionEditForm.category} />
                        <div className='grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem]'>
                          <Input aria-label='指示内容' onChange={(event) => setInstructionEditForm((current) => ({ ...current, title: event.target.value }))} value={instructionEditForm.title} />
                          <Input aria-label='期限' onChange={(event) => setInstructionEditForm((current) => ({ ...current, dueAt: event.target.value }))} type='datetime-local' value={instructionEditForm.dueAt} />
                        </div>
                      </>
                    ) : (
                      <>
                        <span className='text-[13px] font-bold text-text-secondary'>{instruction.category}</span>
                        <div>
                          <p className='text-[14px] font-bold text-text-primary'>{instruction.title}</p>
                          <p className='mt-1 text-[12px] text-text-tertiary'>{instruction.dueAt ?? instruction.createdAt}</p>
                        </div>
                      </>
                    )}
                    <span className={cn('inline-flex h-7 w-fit items-center rounded-md border px-2 text-[12px] font-bold', statusClasses[instruction.status])}>
                      {statusLabels[instruction.status]}
                    </span>
                    <div className='flex flex-wrap gap-2'>
                      {editingInstructionId === instruction.id ? (
                        <>
                          <Button disabled={isSavingInstruction || !instructionEditForm.title.trim()} onClick={() => handleSaveInstruction(instruction)} size='xs' type='button' variant='outline'>保存</Button>
                          <Button onClick={() => setEditingInstructionId(null)} size='xs' type='button' variant='ghost'>閉じる</Button>
                        </>
                      ) : (
                        <Button disabled={instruction.status !== 'pending'} onClick={() => startEditingInstruction(instruction)} size='xs' type='button' variant='ghost'>編集</Button>
                      )}
                      <Button disabled={instruction.status === 'done'} onClick={() => handleInstructionStatus(instruction, 'done')} size='xs' type='button' variant='outline'>実施</Button>
                      <Button disabled={instruction.status === 'cancelled'} onClick={() => handleInstructionStatus(instruction, 'cancelled')} size='xs' type='button' variant='ghost'>中止</Button>
                    </div>
                  </div>
                ))}
                {isLoadingDetail ? <div className='px-4 py-6 text-[14px] text-text-tertiary'>読み込み中</div> : null}
              </div>
            </section>

            <section className='rounded-8 border border-border bg-card'>
              <div className='flex items-center gap-2 border-b border-border px-4 py-3'>
                <NotebookPen size={17} className='text-brand' />
                <h2 className='text-[16px] font-bold text-text-primary'>看護記録</h2>
              </div>
              <div className='space-y-4 p-4'>
                <div className='max-h-72 space-y-3 overflow-auto'>
                  {nursingNotes.map((note) => (
                    <article className='rounded-md border border-border bg-surface-subtle p-3' key={note.id}>
                      <div className='flex items-start justify-between gap-3'>
                        <h3 className='text-[14px] font-bold text-text-primary'>{note.focus ?? note.noteType}</h3>
                        <span className='text-[11px] text-text-tertiary'>{note.recordedAt}</span>
                      </div>
                      <p className='mt-2 text-[13px] leading-normal text-text-secondary'>{note.assessment}</p>
                      <p className='mt-1 text-[12px] text-text-tertiary'>{note.recordedBy}</p>
                    </article>
                  ))}
                </div>
                <div className='space-y-2'>
                  <Input aria-label='フォーカス' onChange={(event) => setNoteForm((current) => ({ ...current, focus: event.target.value }))} placeholder='フォーカス' value={noteForm.focus} />
                  {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key) => (
                    <textarea
                      className='min-h-20 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                      key={key}
                      onChange={(event) => setNoteForm((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder={key.toUpperCase()}
                      value={noteForm[key]}
                    />
                  ))}
                  <Button disabled={isSavingNote} onClick={handleSaveNote} size='sm' type='button'>
                    <CheckCircle2 size={15} />
                    保存
                  </Button>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value='documents'>
            <section className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <FileSignature size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>入退院文書</h2>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {(Object.keys(documentTypeLabels) as InpatientDocumentType[]).map((documentType) => (
                      <Button
                        disabled={isCreatingDocument}
                        key={documentType}
                        onClick={() => handleCreateDocument(documentType)}
                        size='xs'
                        type='button'
                        variant='outline'
                      >
                        {documentTypeLabels[documentType]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className='divide-y divide-border'>
                  {documents.slice(0, 4).map((document) => (
                    <article className='px-4 py-3' key={document.id}>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <h3 className='text-[14px] font-bold text-text-primary'>{document.title}</h3>
                            <span className={cn('rounded-md border px-2 py-1 text-[11px] font-bold', documentStatusClasses[document.status])}>
                              {documentStatusLabels[document.status]}
                            </span>
                          </div>
                          <p className='mt-1 text-[12px] text-text-tertiary'>
                            {document.createdBy} · 更新 {document.updatedAt}
                          </p>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                          <Button
                            disabled={document.status !== 'draft'}
                            onClick={() => startEditingDocument(document)}
                            size='xs'
                            type='button'
                            variant='outline'
                          >
                            編集
                          </Button>
                          <Button
                            disabled={document.status !== 'draft' || isSavingDocument}
                            onClick={() => handleSignDocument(document)}
                            size='xs'
                            type='button'
                            variant='ghost'
                          >
                            承認/署名
                          </Button>
                          <Button
                            onClick={() => handlePrintDocument(document)}
                            size='xs'
                            type='button'
                            variant='ghost'
                          >
                            印刷HTML
                          </Button>
                          <Button
                            disabled={document.status === 'archived' || isSavingDocument}
                            onClick={() => handleArchiveDocument(document)}
                            size='xs'
                            type='button'
                            variant='ghost'
                          >
                            取消
                          </Button>
                        </div>
                      </div>
                      {editingDocumentId === document.id && document.status === 'draft' ? (
                        <div className='mt-3 space-y-2'>
                          <Input
                            aria-label='文書タイトル'
                            onChange={(event) => setDocumentForm((current) => ({ ...current, title: event.target.value }))}
                            value={documentForm.title}
                          />
                          <textarea
                            aria-label='文書本文'
                            className='min-h-64 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-relaxed text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                            onChange={(event) => setDocumentForm((current) => ({ ...current, body: event.target.value }))}
                            value={documentForm.body}
                          />
                          <div className='flex flex-wrap gap-2'>
                            <Button
                              disabled={isSavingDocument || !documentForm.title.trim()}
                              onClick={() => handleSaveDocument(document)}
                              size='xs'
                              type='button'
                              variant='outline'
                            >
                              下書き保存
                            </Button>
                            <Button
                              disabled={isSavingDocument}
                              onClick={() => {
                                setEditingDocumentId(null);
                                setDocumentForm({ title: '', body: '' });
                              }}
                              size='xs'
                              type='button'
                              variant='ghost'
                            >
                              閉じる
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className='mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle p-3 text-[12px] leading-relaxed text-text-secondary'>
                          {document.body}
                        </pre>
                      )}
                    </article>
                  ))}
                  {documents.length === 0 && !isLoadingDetail ? (
                    <div className='px-4 py-6 text-[13px] text-text-tertiary'>入退院文書はまだありません。</div>
                  ) : null}
                </div>
              </section>
          </TabsContent>

          <TabsContent value='progress'>
            <section className='space-y-4'>
              <div className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <BadgeCheck size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>病棟タスク負荷サマリ</h2>
                  </div>
                  <span className={cn('rounded-md border px-2 py-1 text-[12px] font-bold', nursingNecessityLevel === '高' ? 'border-red-200 bg-red-50 text-red-1000' : nursingNecessityLevel === '中' ? 'border-yellow-200 bg-yellow-50 text-yellow-1100' : 'border-green-200 bg-green-50 text-green-900')}>
                    {nursingNecessityLevel}
                  </span>
                </div>
                <div className='grid gap-3 p-4 sm:grid-cols-4'>
                  <div className='rounded-md border border-border bg-surface-subtle p-3'>
                    <p className='text-[11px] font-bold text-text-tertiary'>未実施指示</p>
                    <p className='mt-2 text-[22px] font-bold text-text-primary'>{nursingNecessity.pendingInstructions}</p>
                  </div>
                  <div className='rounded-md border border-border bg-surface-subtle p-3'>
                    <p className='text-[11px] font-bold text-text-tertiary'>本日看護記録</p>
                    <p className='mt-2 text-[22px] font-bold text-text-primary'>{nursingNecessity.recentNursingNotes}</p>
                  </div>
                  <div className='rounded-md border border-border bg-surface-subtle p-3'>
                    <p className='text-[11px] font-bold text-text-tertiary'>未署名文書</p>
                    <p className='mt-2 text-[22px] font-bold text-text-primary'>{nursingNecessity.unsignedDocuments}</p>
                  </div>
                  <div className='rounded-md border border-border bg-surface-subtle p-3'>
                    <p className='text-[11px] font-bold text-text-tertiary'>パス逸脱</p>
                    <p className='mt-2 text-[22px] font-bold text-text-primary'>{nursingNecessity.varianceTasks}</p>
                  </div>
                </div>
              </div>

              <div className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <Thermometer size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>体温・バイタル推移</h2>
                  </div>
                  <span className='text-[12px] text-text-tertiary'>直近{vitalTrendRows.length}日</span>
                </div>
                <div className='overflow-x-auto'>
                  <div className='min-w-[860px]'>
                    <div
                      className='grid border-b border-border bg-surface-subtle text-[12px] font-bold text-text-tertiary'
                      style={{ gridTemplateColumns: `9rem repeat(${Math.max(vitalTrendRows.length, 1)}, minmax(6.5rem, 1fr))` }}
                    >
                      <div className='px-4 py-2'>項目</div>
                      {vitalTrendRows.map((row) => (
                        <div className='border-l border-border px-3 py-2 text-center' key={row.date}>{row.date}</div>
                      ))}
                    </div>
                    <div className='divide-y divide-border'>
                      {vitalMetricLabels.map((metric) => (
                        <div
                          className='grid text-[13px] leading-normal text-text-secondary'
                          key={metric.key}
                          style={{ gridTemplateColumns: `9rem repeat(${Math.max(vitalTrendRows.length, 1)}, minmax(6.5rem, 1fr))` }}
                        >
                          <div className='flex items-center gap-2 px-4 py-3 font-bold text-text-primary'>
                            {metric.key === 'temperature' ? <Thermometer size={15} className='text-red-700' /> : <HeartPulse size={15} className='text-brand' />}
                            {metric.label}
                          </div>
                          {vitalTrendRows.length > 0 ? vitalTrendRows.map((row) => (
                            <div className='border-l border-border px-3 py-3 text-center font-bold text-text-primary' key={`${metric.key}-${row.date}`}>
                              {findVitalValue(row.vitals, metric.keywords)}
                            </div>
                          )) : (
                            <div className='border-l border-border px-3 py-3 text-text-tertiary'>記録なし</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <FlaskConical size={17} className='text-brand' />
                    <div>
                      <h2 className='text-[16px] font-bold text-text-primary'>検査タイムライン</h2>
                      <p className='mt-1 text-[12px] text-text-tertiary'>
                        ドラッグ、クリック、Shiftクリックで行を選択できます。
                      </p>
                    </div>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='text-[12px] font-bold text-text-secondary'>
                      {selectedLabRows.length > 0 ? `選択 ${selectedLabRows.length}件` : `全 ${labTimelineRows.length}件`}
                    </span>
                    <Button
                      disabled={labRowsForExport.length === 0}
                      onClick={handleCopyLabRows}
                      size='xs'
                      type='button'
                      variant='outline'
                    >
                      <Copy size={14} />
                      コピー
                    </Button>
                    <Button
                      disabled={labRowsForExport.length === 0}
                      onClick={handleDownloadLabCsv}
                      size='xs'
                      type='button'
                      variant='outline'
                    >
                      <Download size={14} />
                      CSV
                    </Button>
                  </div>
                </div>
                <div className='overflow-x-auto'>
                  <div className='min-w-[760px]'>
                    <div className='grid grid-cols-[8rem_6rem_minmax(20rem,1fr)] border-b border-border bg-surface-subtle px-4 py-2 text-[12px] font-bold text-text-tertiary'>
                      <span>日付</span>
                      <span>種別</span>
                      <span>内容</span>
                    </div>
                    <div className='divide-y divide-border'>
                      {labTimelineRows.map((row, index) => {
                        const isSelected = selectedLabRowKeys.has(row.key);

                        return (
                          <button
                            aria-pressed={isSelected}
                            className={cn(
                              'grid w-full cursor-pointer select-none grid-cols-[8rem_6rem_minmax(20rem,1fr)] items-center gap-0 px-4 py-3 text-left text-[13px] leading-normal transition-colors hover:bg-blue-50',
                              isSelected ? 'bg-blue-100 text-blue-950' : 'bg-card text-text-secondary',
                            )}
                            key={row.key}
                            onPointerDown={(event) => handleLabRowPointerDown(event, row, index)}
                            onPointerEnter={() => handleLabRowPointerEnter(row)}
                            type='button'
                          >
                            <span className='font-bold text-text-primary'>{row.date}</span>
                            <span
                              className={cn(
                                'w-fit rounded-md border px-2 py-1 text-[11px] font-bold',
                                row.type === 'result'
                                  ? 'border-purple-200 bg-purple-50 text-purple-900'
                                  : 'border-blue-200 bg-blue-50 text-blue-900',
                              )}
                            >
                              {row.type === 'result' ? '結果' : '依頼'}
                            </span>
                            <span>{row.item}</span>
                          </button>
                        );
                      })}
                      {labTimelineRows.length === 0 ? (
                        <div className='px-4 py-6 text-[13px] text-text-tertiary'>検査結果・検査依頼はまだありません。</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className='rounded-8 border border-border bg-card'>
              <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
                <div className='flex items-center gap-2'>
                  <Activity size={17} className='text-brand' />
                  <h2 className='text-[16px] font-bold text-text-primary'>経過表</h2>
                </div>
                <span className='text-[12px] text-text-tertiary'>{progressRows.length}日分</span>
              </div>
              <div className='overflow-auto'>
                <div className='min-w-[760px]'>
                  <div className='grid grid-cols-[7rem_repeat(5,minmax(8rem,1fr))] border-b border-border bg-surface-subtle px-4 py-2 text-[12px] font-bold text-text-tertiary'>
                    <span>日付</span>
                    <span>バイタル</span>
                    <span>検査</span>
                    <span>処方</span>
                    <span>指示</span>
                    <span>看護記録</span>
                  </div>
                  <div className='divide-y divide-border'>
                    {progressRows.slice(0, 12).map((row) => (
                      <div className='grid grid-cols-[7rem_repeat(5,minmax(8rem,1fr))] gap-2 px-4 py-3 text-[12px] leading-normal text-text-secondary' key={row.date}>
                        <span className='font-bold text-text-primary'>{row.date}</span>
                        <div className='space-y-1'>{row.vitals.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
                        <div className='space-y-1'>{[...row.labs.slice(0, 3), ...row.labOrders.slice(0, 1)].map((item) => <p key={item}>{item}</p>)}</div>
                        <div className='space-y-1'>{row.prescriptions.slice(0, 2).map((item) => <p key={item}>{item}</p>)}</div>
                        <div className='space-y-1'>{row.instructions.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
                        <div className='space-y-1'>{row.nursingNotes.slice(0, 2).map((item) => <p key={item}>{item}</p>)}</div>
                      </div>
                    ))}
                  </div>
                  {progressRows.length === 0 ? <div className='px-4 py-6 text-[13px] text-text-tertiary'>経過表に表示できる記録がありません。</div> : null}
                </div>
              </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent className='space-y-4' value='billing'>
            <section className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <ReceiptText size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>退院計画・会計候補</h2>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button disabled={!dischargePlan || isSavingDischargePlan} onClick={() => handleSaveDischargePlan('reviewed')} size='xs' type='button' variant='outline'>レビュー済</Button>
                    <Button disabled={!dischargePlan || isSavingDischargePlan} onClick={() => handleSaveDischargePlan('ready')} size='xs' type='button' variant='ghost'>退院準備完了</Button>
                  </div>
                </div>
                {dischargePlan ? (
                  <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(20rem,1fr)]'>
                    <div className='space-y-3'>
                      <textarea
                        className='min-h-32 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        onChange={(event) => setDischargePlan((current) => current ? { ...current, dischargeMedicationNote: event.target.value } : current)}
                        value={dischargePlan.dischargeMedicationNote}
                      />
                      <textarea
                        className='min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        onChange={(event) => setDischargePlan((current) => current ? { ...current, followUpNote: event.target.value } : current)}
                        value={dischargePlan.followUpNote}
                      />
                    </div>
                    <div className='space-y-2'>
                      <span className={cn('inline-flex rounded-md border px-2 py-1 text-[12px] font-bold', dischargePlan.status === 'ready' ? 'border-green-200 bg-green-50 text-green-900' : 'border-yellow-200 bg-yellow-50 text-yellow-1100')}>
                        {dischargePlan.status === 'ready' ? '退院準備完了' : dischargePlan.status === 'reviewed' ? 'レビュー済' : '下書き'}
                      </span>
                      {dischargePlan.billingCandidates.map((candidate) => (
                        <div className='rounded-md border border-border bg-surface-subtle p-2' key={`${candidate.category}-${candidate.label}`}>
                          <div className='flex items-start justify-between gap-2'>
                            <p className='text-[12px] font-bold text-text-primary'>{candidate.category}</p>
                            <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', candidate.status === 'needs_review' ? 'border-yellow-200 bg-yellow-50 text-yellow-1100' : 'border-green-200 bg-green-50 text-green-900')}>
                              {candidate.status === 'needs_review' ? '要確認' : '候補'}
                            </span>
                          </div>
                          <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{candidate.label}</p>
                          {candidate.receiptCode ? (
                            <p className='mt-2 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900'>
                              {candidate.receiptCode} {candidate.receiptName}
                              {candidate.receiptPoints ? ` / ${candidate.receiptPoints}点${candidate.receiptUnit ? `/${candidate.receiptUnit}` : ''}` : ''}
                            </p>
                          ) : null}
                          {candidate.evidence ? (
                            <p className='mt-2 border-t border-border pt-2 text-[11px] leading-normal text-text-tertiary'>
                              根拠: {candidate.evidence}
                            </p>
                          ) : null}
                          <p className='mt-1 text-[11px] text-text-tertiary'>
                            {candidate.source} · {candidate.confidence ?? 'medium'}
                          </p>
                        </div>
                      ))}
                      <div className='rounded-md border border-blue-100 bg-blue-50 p-3'>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                          <div>
                            <p className='text-[12px] font-bold text-blue-950'>請求ドラフト</p>
                            <p className='mt-1 text-[11px] leading-normal text-blue-900'>
                              {claimDraft
                                ? `${claimDraft.lines.length}明細 / ${claimDraft.totalPoints.toLocaleString()}点 / 未解決 ${claimDraft.issues.filter((issue) => issue.status === 'open').length}件`
                                : '退院計画の会計候補から作成'}
                            </p>
                          </div>
                          {claimDraft ? (
                            <div className='flex flex-wrap gap-2'>
                              <Button
                                disabled={isSavingClaimDraft || claimDraft.status === 'reviewed'}
                                onClick={() => handleUpdateClaimDraftStatus('reviewed')}
                                size='xs'
                                type='button'
                                variant='outline'
                              >
                                請求レビュー済
                              </Button>
                              <Button
                                disabled={isSavingClaimDraft || claimDraft.status === 'ready'}
                                onClick={() => handleUpdateClaimDraftStatus('ready')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                請求準備完了
                              </Button>
                              <Button
                                disabled={isSavingClaimDraft || claimDraft.status === 'submitted'}
                                onClick={handleSubmitClaimDraftToOrca}
                                size='xs'
                                type='button'
                                variant='outline'
                              >
                                ORCA送信
                              </Button>
                            </div>
                          ) : (
                            <Button
                              disabled={isSavingClaimDraft}
                              onClick={handleCreateClaimDraft}
                              size='xs'
                              type='button'
                              variant='outline'
                            >
                              作成
                            </Button>
                          )}
                        </div>
                        {claimDraft ? (
                          <div className='mt-3 space-y-2'>
                            <span className={cn('inline-flex rounded-md border px-2 py-1 text-[11px] font-bold', claimDraft.status === 'ready' ? 'border-green-200 bg-green-50 text-green-900' : 'border-yellow-200 bg-yellow-50 text-yellow-1100')}>
                              {claimDraft.status === 'submitted' ? '送信済' : claimDraft.status === 'error' ? '送信エラー' : claimDraft.status === 'ready' ? '請求準備完了' : claimDraft.status === 'reviewed' ? 'レビュー済' : '下書き'}
                            </span>
                            {claimDraft.transmissions[0] ? (
                              <div className='rounded border border-blue-100 bg-white px-2 py-1.5'>
                                <p className='text-[11px] font-bold text-blue-950'>
                                  {claimDraft.transmissions[0].adapter.toUpperCase()} {claimDraft.transmissions[0].status} · {claimDraft.transmissions[0].sentAt}
                                </p>
                                {claimDraft.transmissions[0].errorMessage ? (
                                  <p className='mt-1 text-[10px] leading-normal text-red-900'>{claimDraft.transmissions[0].errorMessage}</p>
                                ) : null}
                              </div>
                            ) : null}
                            {claimDraft.lines.slice(0, 5).map((line) => (
                              <div className='rounded border border-blue-100 bg-white px-2 py-1.5' key={line.id}>
                                <div className='flex flex-wrap items-center justify-between gap-2'>
                                  <p className='text-[11px] font-bold text-blue-950'>{line.lineType}</p>
                                  <span className='text-[10px] font-bold text-text-tertiary'>
                                    {line.points.toLocaleString()}点 x {line.quantity}{line.unit ?? ''}
                                  </span>
                                </div>
                                <p className='mt-1 text-[11px] leading-normal text-text-secondary'>{line.label}</p>
                                {line.receiptCode ? (
                                  <p className='mt-1 text-[10px] font-bold text-blue-900'>{line.receiptCode} {line.receiptName}</p>
                                ) : null}
                              </div>
                            ))}
                            {claimDraft.adjustments.slice(0, 4).map((adjustment) => (
                              <div className='rounded border border-purple-100 bg-white px-2 py-1.5' key={adjustment.id}>
                                <div className='flex flex-wrap items-center justify-between gap-2'>
                                  <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-[11px] font-bold text-purple-950'>{adjustment.adjustmentType}</p>
                                    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', claimAdjustmentStatusClasses[adjustment.status])}>
                                      {claimAdjustmentStatusLabels[adjustment.status]}
                                    </span>
                                  </div>
                                  <span className={cn('text-[10px] font-bold', adjustment.status === 'accepted' ? 'text-green-900' : 'text-purple-900')}>
                                    {adjustment.pointsDelta > 0 ? '+' : ''}{adjustment.pointsDelta}点
                                  </span>
                                </div>
                                <p className='mt-1 text-[11px] leading-normal text-text-secondary'>{adjustment.reason}</p>
                                {adjustment.comment ? (
                                  <p className='mt-1 text-[10px] text-text-tertiary'>
                                    摘要候補: {adjustment.commentCode ? `${adjustment.commentCode} ` : ''}{adjustment.comment}
                                    {adjustment.commentPattern ? ` / pattern ${adjustment.commentPattern}` : ''}
                                  </p>
                                ) : null}
                                <div className='mt-2 flex flex-wrap gap-2'>
                                  <Button
                                    disabled={isSavingClaimDraft || adjustment.status === 'accepted'}
                                    onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'accepted')}
                                    size='xs'
                                    type='button'
                                    variant='outline'
                                  >
                                    採用
                                  </Button>
                                  <Button
                                    disabled={isSavingClaimDraft || adjustment.status === 'ignored'}
                                    onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'ignored')}
                                    size='xs'
                                    type='button'
                                    variant='ghost'
                                  >
                                    無視
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {claimDraft.issues.slice(0, 4).map((issue) => (
                              <div className='rounded border border-blue-100 bg-white px-2 py-1.5' key={issue.id}>
                                <p className={cn('text-[11px] font-bold', issue.severity === 'error' ? 'text-red-900' : issue.severity === 'warning' ? 'text-yellow-1100' : 'text-blue-900')}>
                                  {issue.severity === 'error' ? '要修正' : issue.severity === 'warning' ? '要確認' : '情報'}: {issue.message}
                                </p>
                                {issue.evidence ? <p className='mt-1 text-[10px] leading-normal text-text-tertiary'>根拠: {issue.evidence}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='px-4 py-6 text-[13px] text-text-tertiary'>退院計画を読み込み中です。</div>
                )}
              </section>
          </TabsContent>

          <TabsContent value='beds'>
            <section className='rounded-8 border border-border bg-card'>
            <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
              <div className='flex items-center gap-2'>
                <Bed size={17} className='text-brand' />
                <h2 className='text-[16px] font-bold text-text-primary'>病床ボード</h2>
              </div>
              {selectedAdmission ? (
                <span className='text-[12px] text-text-tertiary'>{selectedAdmission.patientName} を選択中</span>
              ) : null}
            </div>
            <div className='max-h-[calc(100vh-13rem)] space-y-4 overflow-auto p-4'>
              {bedsByWard.map((group) => (
                <div className='space-y-2' key={group.key}>
                  <h3 className='text-[13px] font-bold text-text-secondary'>{group.wardName}</h3>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    {group.beds.map((bed) => {
                      const canTransfer = Boolean(selectedAdmission) && bed.status === 'available';
                      return (
                        <div
                          className={cn(
                            'rounded-md border p-3',
                            selectedAdmission?.bedId === bed.id ? 'border-brand bg-blue-50' : 'border-border bg-surface-subtle',
                          )}
                          key={bed.id}
                        >
                          <div className='flex items-start justify-between gap-2'>
                            <div>
                              <p className='text-[14px] font-bold text-text-primary'>{bed.bedLabel}</p>
                              <p className='mt-1 text-[12px] text-text-tertiary'>{bed.currentPatientName ?? bed.note ?? '利用可能'}</p>
                            </div>
                            <span className={cn('rounded-md border px-2 py-1 text-[11px] font-bold', bedStatusClasses[bed.status])}>
                              {bedStatusLabels[bed.status]}
                            </span>
                          </div>
                          <div className='mt-3 flex flex-wrap gap-2'>
                            <Button
                              disabled={!canTransfer || isTransferring}
                              onClick={() => handleTransfer(bed)}
                              size='xs'
                              type='button'
                              variant='outline'
                            >
                              <MoveRight size={13} />
                              転床
                            </Button>
                            {bed.status === 'cleaning' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'available')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                空床化
                              </Button>
                            ) : null}
                            {bed.status === 'available' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'blocked')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                停止
                              </Button>
                            ) : null}
                            {bed.status === 'blocked' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'available')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                再開
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
          </TabsContent>
        </Tabs>
      ) : null}

      <Drawer
        isOpen={drawerPanel !== null}
        onClose={() => setDrawerPanel(null)}
        title={drawerPanel === 'claim' ? '請求点検' : drawerPanel === 'events' ? '入院イベント' : 'AI要約案'}
        width='w-[34rem] max-w-[92vw]'
      >
        {drawerPanel === 'summary' ? (
          <div className='space-y-4'>
            <div className='flex flex-wrap gap-2'>
              <Button disabled={!summaryDraft || isCreatingDocument} onClick={handleCreateSummaryDocument} size='xs' type='button' variant='outline'>退院サマリ化</Button>
              <Button disabled={!summaryDraft || isReviewingSummary} onClick={() => handleSummaryReview('accepted')} size='xs' type='button' variant='ghost'>採用</Button>
              <Button disabled={!summaryDraft || isReviewingSummary} onClick={() => handleSummaryReview('rejected')} size='xs' type='button' variant='ghost'>差戻し</Button>
            </div>
            {summaryDraft ? (
              <>
                <pre className='max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle p-3 text-[12px] leading-relaxed text-text-secondary'>{summaryDraft.body}</pre>
                <div className='grid grid-cols-2 gap-2 text-[12px] text-text-secondary'>
                  <span>看護 {summaryDraft.sourceCounts.nursingNotes}</span>
                  <span>観察 {summaryDraft.sourceCounts.observations}</span>
                  <span>処方 {summaryDraft.sourceCounts.prescriptions}</span>
                  <span>指示 {summaryDraft.sourceCounts.instructions}</span>
                </div>
              </>
            ) : <p className='text-[13px] text-text-tertiary'>要約できる入院記録がありません。</p>}
          </div>
        ) : null}
        {drawerPanel === 'claim' ? (
          <div className='space-y-3'>
            {claimDraft ? (
              <>
                <div className='rounded-md border border-blue-100 bg-blue-50 p-3'>
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div>
                      <p className='text-[13px] font-bold text-blue-950'>{claimDraft.lines.length}明細 / {claimDraft.totalPoints.toLocaleString()}点</p>
                      <p className='mt-1 text-[12px] text-blue-900'>未解決 {openClaimIssueCount}件 · コード未解決 {unresolvedClaimLineCount}明細 · 提案 {reviewClaimAdjustmentCount}件</p>
                      {previewValidation ? (
                        <p className={cn('mt-1 text-[11px] font-bold', previewCanSubmit ? 'text-green-900' : 'text-red-900')}>
                          {previewCanSubmit ? '送信前チェック: 送信可能' : `送信前チェック: 停止 ${String(previewValidation.unresolved_count ?? 0)}明細 / error ${String(previewValidation.open_error_count ?? 0)}件`}
                        </p>
                      ) : null}
                    </div>
                    <div className='flex flex-wrap gap-2'>
                      <Button disabled={isSavingClaimDraft} onClick={handleRecheckClaimDraft} size='xs' type='button' variant='outline'>再点検</Button>
                      <Button disabled={isSavingClaimDraft} onClick={handlePreviewClaimDraft} size='xs' type='button' variant='ghost'>送信前preview</Button>
                      <Button disabled={isSavingClaimDraft || claimDraft.status === 'submitted'} onClick={handleSubmitClaimDraftToOrca} size='xs' type='button' variant='outline'>ORCA送信</Button>
                    </div>
                  </div>
                </div>
                <div className='space-y-2'>
                  <p className='text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary'>未解決 issue</p>
                  {Object.keys(claimIssuesByType).length > 0 ? (
                    Object.entries(claimIssuesByType).map(([issueType, issues]) => (
                      <div className='rounded-md border border-border bg-card p-3' key={issueType}>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <span className={cn('rounded border px-2 py-1 text-[11px] font-bold', claimIssueClasses[issueType] ?? 'border-blue-100 bg-blue-50 text-blue-900')}>
                            {claimIssueLabels[issueType] ?? issueType}
                          </span>
                          <span className='text-[11px] font-bold text-text-tertiary'>{issues.length}件</span>
                        </div>
                        <div className='mt-2 space-y-1.5'>
                          {issues.map((issue) => (
                            <div className='rounded border border-border bg-surface-subtle px-2 py-1.5' key={issue.id}>
                              <p className='text-[12px] font-bold text-text-primary'>{issue.message}</p>
                              {issue.evidence ? <p className='mt-1 text-[11px] leading-normal text-text-tertiary'>根拠: {issue.evidence}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className='rounded-md border border-green-100 bg-green-50 p-3 text-[12px] font-bold text-green-900'>
                      主要な未解決 issue はありません。
                    </div>
                  )}
                </div>
                <div className='space-y-2'>
                  <p className='text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary'>請求明細コード補正</p>
                  {claimDraft.lines.map((line) => (
                    <div className={cn('rounded-md border p-3', line.receiptCode ? 'border-border bg-card' : 'border-red-200 bg-red-50')} key={line.id}>
                      <div className='flex flex-wrap items-start justify-between gap-2'>
                        <div>
                          <p className='text-[13px] font-bold text-text-primary'>{line.lineType}</p>
                          <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{line.label}</p>
                        </div>
                        <span className='text-[11px] font-bold text-text-tertiary'>{line.points.toLocaleString()}点 x {line.quantity}{line.unit ?? ''}</span>
                      </div>
                      {line.receiptCode ? (
                        <p className='mt-2 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900'>{line.receiptCode} {line.receiptName}</p>
                      ) : (
                        <p className='mt-2 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-900'>レセ電コード未解決</p>
                      )}
                      {editingClaimLineId === line.id ? (
                        <div className='mt-3 space-y-2'>
                          <div className='grid gap-2 sm:grid-cols-2'>
                            <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, receiptCode: event.target.value }))} placeholder='レセ電コード' value={claimLineForm.receiptCode} />
                            <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, receiptName: event.target.value }))} placeholder='名称' value={claimLineForm.receiptName} />
                            <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, points: event.target.value }))} placeholder='点数' value={claimLineForm.points} />
                            <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, unit: event.target.value }))} placeholder='単位' value={claimLineForm.unit} />
                          </div>
                          <div className='space-y-1.5'>
                            <p className='text-[11px] font-bold text-text-tertiary'>候補</p>
                            {isLoadingReceiptCandidates ? (
                              <p className='text-[12px] text-text-tertiary'>候補検索中...</p>
                            ) : receiptCodeCandidates.length > 0 ? (
                              receiptCodeCandidates.map((candidate) => (
                                <button className='block w-full rounded border border-border bg-white px-2 py-1.5 text-left hover:bg-blue-50' key={candidate.receiptCode} onClick={() => applyReceiptCodeCandidate(candidate)} type='button'>
                                  <span className='text-[12px] font-bold text-blue-950'>{candidate.receiptCode} {candidate.receiptName}</span>
                                  <span className='mt-0.5 block text-[11px] text-text-tertiary'>{candidate.points ?? '-'}点 {candidate.unit ?? ''} {candidate.category ?? ''}</span>
                                </button>
                              ))
                            ) : (
                              <p className='text-[12px] text-text-tertiary'>候補なし。手入力で補正できます。</p>
                            )}
                          </div>
                          <div className='flex flex-wrap gap-2'>
                            <Button disabled={isSavingClaimDraft || !claimLineForm.receiptCode.trim()} onClick={() => handleUpdateClaimLineReceiptCode(line)} size='xs' type='button' variant='outline'>保存して issue 解決</Button>
                            <Button onClick={() => setEditingClaimLineId(null)} size='xs' type='button' variant='ghost'>閉じる</Button>
                          </div>
                        </div>
                      ) : (
                        <div className='mt-3 flex flex-wrap gap-2'>
                          <Button disabled={isSavingClaimDraft} onClick={() => startEditClaimLine(line)} size='xs' type='button' variant={line.receiptCode ? 'ghost' : 'outline'}>{line.receiptCode ? 'コード修正' : 'コード補正'}</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {claimDraft.adjustments.map((adjustment) => (
                  <div className='rounded-md border border-border bg-card p-3' key={adjustment.id}>
                    <div className='flex items-center justify-between gap-2'>
                      <p className='text-[13px] font-bold text-text-primary'>{adjustment.reason}</p>
                      <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', claimAdjustmentStatusClasses[adjustment.status])}>{claimAdjustmentStatusLabels[adjustment.status]}</span>
                    </div>
                    <p className='mt-1 text-[12px] text-text-secondary'>{adjustment.pointsDelta > 0 ? '+' : ''}{adjustment.pointsDelta}点</p>
                    {adjustment.comment ? <p className='mt-2 text-[11px] leading-normal text-text-tertiary'>摘要候補: {adjustment.commentCode ? `${adjustment.commentCode} ` : ''}{adjustment.comment}</p> : null}
                    <div className='mt-3 flex gap-2'>
                      <Button disabled={isSavingClaimDraft || adjustment.status === 'accepted'} onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'accepted')} size='xs' type='button' variant='outline'>採用</Button>
                      <Button disabled={isSavingClaimDraft || adjustment.status === 'ignored'} onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'ignored')} size='xs' type='button' variant='ghost'>無視</Button>
                    </div>
                  </div>
                ))}
                {claimDraft.issues.map((issue) => (
                  <div className='rounded-md border border-border bg-card p-3' key={issue.id}>
                    <p className={cn('text-[13px] font-bold', issue.severity === 'error' ? 'text-red-900' : issue.severity === 'warning' ? 'text-yellow-1100' : 'text-blue-900')}>{issue.message}</p>
                    {issue.evidence ? <p className='mt-1 text-[11px] leading-normal text-text-tertiary'>根拠: {issue.evidence}</p> : null}
                  </div>
                ))}
                {latestClaimTransmission ? (
                  <div className='rounded-md border border-blue-100 bg-blue-50 p-3'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <p className='text-[13px] font-bold text-blue-950'>{orcaPreviewPayload ? '送信前 payload preview' : '送信 payload preview'}</p>
                      <span className='rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-900'>{latestClaimTransmission.status}</span>
                    </div>
                    <p className='mt-1 text-[11px] text-blue-900'>
                      {hasLatestPayloadSummary
                        ? `summary: ${String(latestPayloadSummary?.line_count ?? 0)}明細 / 送信可能 ${String(latestPayloadSummary?.sendable_count ?? 0)} / 停止 ${String(latestPayloadSummary?.unresolved_count ?? 0)}`
                        : '旧形式の送信履歴です。次回送信から送信可能/停止明細を表示します。'}
                    </p>
                    {hasLatestPayloadSummary ? <div className='mt-3 grid gap-2 lg:grid-cols-2'>
                      <div className='rounded-md border border-green-100 bg-white p-2'>
                        <p className='text-[11px] font-bold text-green-900'>送れる明細: {latestSendableItems.length}</p>
                        <div className='mt-2 space-y-1'>
                          {latestSendableItems.slice(0, 6).map((item, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: 表示専用の固定順リストで line_id が欠けることがある
                            <p className='rounded bg-green-50 px-2 py-1 text-[11px] leading-normal text-green-950' key={`${payloadText(item, 'line_id')}-${index}`}>
                              {payloadText(item, 'receipt_code')} {payloadText(item, 'label')}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div className='rounded-md border border-red-100 bg-white p-2'>
                        <p className='text-[11px] font-bold text-red-900'>止まっている明細: {latestUnresolvedItems.length}</p>
                        <div className='mt-2 space-y-1'>
                          {latestUnresolvedItems.slice(0, 6).map((item, index) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: 表示専用の固定順リストで line_id が欠けることがある
                            <p className='rounded bg-red-50 px-2 py-1 text-[11px] leading-normal text-red-950' key={`${payloadText(item, 'line_id')}-${index}`}>
                              {payloadText(item, 'unresolved_reason')} · {payloadText(item, 'label')}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div> : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className='rounded-md border border-border bg-surface-subtle p-4 text-[13px] text-text-secondary'>
                請求ドラフトはまだありません。退院・会計タブから作成できます。
              </div>
            )}
          </div>
        ) : null}
        {drawerPanel === 'events' ? (
          <div className='space-y-2'>
            {events.map((event) => (
              <article className='rounded-md border border-border bg-card p-3' key={`${event.id}-${event.occurredAt}`}>
                <div className='flex items-start justify-between gap-3'>
                  <h3 className='text-[13px] font-bold text-text-primary'>{event.title}</h3>
                  <span className='shrink-0 text-[11px] text-text-tertiary'>{event.occurredAt}</span>
                </div>
                {event.detail ? <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{event.detail}</p> : null}
                <p className='mt-1 text-[11px] text-text-tertiary'>{event.actor}</p>
              </article>
            ))}
          </div>
        ) : null}
      </Drawer>
    </main>
  );
};
