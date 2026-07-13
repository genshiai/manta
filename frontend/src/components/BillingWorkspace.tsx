import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Edit3,
  FileWarning,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from 'lucide-react';
import type { PatientRecord } from '../data/chartMock';
import {
  approveMonthlyClaimClose,
  assignClaimReturnEvent,
  cancelMonthlyClaimClose,
  closeMonthlyClaims,
  compareClaimReturnAnalytics,
  dryRunClaimDraftOrcaPayload,
  dryRunClaimSlaNotifications,
  escalateClaimReturnSla,
  exportClaimTransmissionsCsv,
  getClaimDraft,
  getClaimReturnAnalytics,
  getClaimReturnSlaSummary,
  getMonthlyCloseReport,
  getMonthlyCloseSummary,
  getClaimSlaSetting,
  isUnauthorizedError,
  listAuditLogs,
  listClaimDraftLineReceiptCodeCandidates,
  listClaimDrafts,
  listClaimReturnEvents,
  listClaimReturnSlaAlerts,
  listClaimReturnTrend,
  listClaimTransmissions,
  previewClaimDraftOrcaPayload,
  recheckClaimDraft,
  requestMonthlyClaimClose,
  submitClaimDraftToOrca,
  updateClaimSlaSetting,
  updateClaimDraftLineReceiptCode,
  updateClaimDraftStatus,
  updateClaimLineAdjustmentStatus,
  updateClaimReturnEvent,
} from '../lib/api';
import { cn } from '../lib/cn';
import type {
  AuditLogEntry,
  ClaimDraft,
  ClaimDraftLine,
  ClaimReturnAnalytics,
  ClaimReturnAnalyticsComparison,
  ClaimReturnSlaAlert,
  ClaimReturnSlaSummary,
  ClaimSlaNotificationDryRun,
  ClaimSlaSetting,
  ClaimReturnTrendPoint,
  ClaimDraftSummary,
  ClaimLineAdjustment,
  ClaimReturnEvent,
  ClaimReturnEventSummary,
  ClaimTransmissionSummary,
  MonthlyCloseSummary,
  ReceiptCodeCandidate,
  UserSession,
} from '../types/workflow';
import { Button } from './ui/button';
import { ConfirmModal } from './ui/confirm-modal';
import { Drawer } from './ui/drawer';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from './ui/toast';

type BillingWorkspaceProps = {
  currentUser: UserSession;
  patients: PatientRecord[];
  searchQuery: string;
  onAuthExpired: () => void;
  onOpenChart: (patientId: string) => void;
  onSearchChange: (value: string) => void;
};

type QueueFilter = 'all' | 'open_issues' | 'ready' | 'transmission_error' | 'submitted';
type StatusFilter = ClaimDraft['status'] | 'all';
type ReturnStatusFilter = ClaimReturnEvent['status'] | 'all';
type ReturnAssigneeFilter = 'all' | 'mine' | 'unassigned';

const queueLabels: Record<QueueFilter, string> = {
  all: 'すべて',
  open_issues: '未解決',
  ready: '送信待ち',
  transmission_error: '送信エラー',
  submitted: '送信済み',
};

const statusLabels: Record<StatusFilter, string> = {
  all: '状態すべて',
  draft: '下書き',
  reviewed: 'レビュー済',
  ready: '送信待ち',
  submitted: '送信済み',
  error: '要修正',
};

const statusClassNames: Record<ClaimDraft['status'], string> = {
  draft: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-800',
  reviewed: 'border-blue-200 bg-blue-50 text-blue-900',
  ready: 'border-green-200 bg-green-50 text-green-900',
  submitted: 'border-solid-gray-300 bg-white text-solid-gray-900',
  error: 'border-red-200 bg-red-50 text-red-1000',
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

const transmissionLabels = {
  accepted: '受理',
  rejected: '差戻し',
  error: 'エラー',
} as const;

const returnEventTypeLabels: Record<ClaimReturnEvent['eventType'], string> = {
  return: '返戻',
  assessment: '査定',
  notice: '通知',
};

const returnStatusLabels: Record<ClaimReturnEvent['status'], string> = {
  open: '未対応',
  in_progress: '対応中',
  resolved: '解決',
  ignored: '対象外',
};

const returnStatusClassNames: Record<ClaimReturnEvent['status'], string> = {
  open: 'border-red-200 bg-red-50 text-red-1000',
  in_progress: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  resolved: 'border-green-200 bg-green-50 text-green-900',
  ignored: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const monthlyCloseStatusLabels: Record<NonNullable<MonthlyCloseSummary['close']>['status'], string> = {
  pending_approval: '承認待ち',
  closed: '締め確定済み',
  cancelled: '締め取消済み',
};

const queueIcon = (queue: QueueFilter) => {
  if (queue === 'open_issues') return FileWarning;
  if (queue === 'ready') return Send;
  if (queue === 'transmission_error') return XCircle;
  if (queue === 'submitted') return CheckCircle2;
  return CircleDollarSign;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const getOrcaPayloadClaim = (payload: Record<string, unknown> | null) => asRecord(payload?.claim);

const getPayloadArray = (claim: Record<string, unknown> | null, key: string): Record<string, unknown>[] => {
  const value = claim?.[key];
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
};

const getPayloadSummary = (claim: Record<string, unknown> | null) => asRecord(claim?.summary);

const payloadText = (item: Record<string, unknown>, key: string) => {
  const value = item[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
};

const payloadNumber = (item: Record<string, unknown>, key: string) => {
  const value = item[key];
  return typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : null;
};

const payloadBool = (item: Record<string, unknown>, key: string) => {
  const value = item[key];
  return typeof value === 'boolean' ? value : null;
};

const payloadLineKey = (item: Record<string, unknown>) =>
  payloadText(item, 'claim_draft_line_id') ||
  payloadText(item, 'line_id') ||
  `${payloadText(item, 'receipt_code')}:${payloadText(item, 'label')}`;

const lineToPayloadComparable = (line: ClaimDraftLine): Record<string, unknown> => ({
  line_id: line.id,
  claim_draft_line_id: line.id,
  label: line.label,
  receipt_code: line.receiptCode ?? '',
  receipt_name: line.receiptName ?? '',
  points: line.points,
  quantity: line.quantity,
  sendable: Boolean(line.receiptCode),
  unresolved_reason: line.receiptCode ? '' : 'missing_receipt_code',
});

const compareLinePayloads = (
  currentItems: Record<string, unknown>[],
  previousItems: Record<string, unknown>[],
) => {
  const previousByKey = new Map(previousItems.map((item) => [payloadLineKey(item), item]));
  const currentByKey = new Map(currentItems.map((item) => [payloadLineKey(item), item]));
  const added = currentItems.filter((item) => !previousByKey.has(payloadLineKey(item)));
  const removed = previousItems.filter((item) => !currentByKey.has(payloadLineKey(item)));
  const changed = currentItems.flatMap((item) => {
    const previous = previousByKey.get(payloadLineKey(item));
    if (!previous) {
      return [];
    }
    const fields = ['receipt_code', 'receipt_name', 'unresolved_reason'] as const;
    const numericFields = ['points', 'quantity'] as const;
    const boolFields = ['sendable'] as const;
    const diffs = [
      ...fields.flatMap((field) => {
        const before = payloadText(previous, field);
        const after = payloadText(item, field);
        return before === after ? [] : [{ field, before, after }];
      }),
      ...numericFields.flatMap((field) => {
        const before = payloadNumber(previous, field);
        const after = payloadNumber(item, field);
        return before === after ? [] : [{ field, before: before ?? '', after: after ?? '' }];
      }),
      ...boolFields.flatMap((field) => {
        const before = payloadBool(previous, field);
        const after = payloadBool(item, field);
        return before === after ? [] : [{ field, before: before === null ? '' : String(before), after: after === null ? '' : String(after) }];
      }),
    ];
    return diffs.length > 0 ? [{ item, previous, diffs }] : [];
  });
  return { added, removed, changed };
};

const getTransmissionItems = (payload: Record<string, unknown>) =>
  getPayloadArray(getOrcaPayloadClaim(payload), 'items');

const getTransmissionSummaryText = (payload: Record<string, unknown>) => {
  const summary = getPayloadSummary(getOrcaPayloadClaim(payload));
  if (!summary) {
    return 'summary なし';
  }
  return `${String(summary.line_count ?? 0)}明細 / 送信可能 ${String(summary.sendable_count ?? 0)} / 停止 ${String(summary.unresolved_count ?? 0)}`;
};

const StatCard = ({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'danger' | 'ready' }) => (
  <div
    className={cn(
      'rounded-8 border p-4',
      tone === 'danger'
        ? 'border-red-200 bg-red-50'
        : tone === 'ready'
          ? 'border-green-200 bg-green-50'
          : 'border-solid-gray-200 bg-white',
    )}
  >
    <p className="text-[12px] font-bold text-text-tertiary">{label}</p>
    <p className="mt-2 text-[28px] font-bold leading-none text-solid-gray-900">{value}</p>
  </div>
);

const defaultSlaDestinationsText = JSON.stringify([
  { type: 'in_app', label: '医事管理者', target: 'billing-admin' },
  { type: 'audit', label: '監査ログ', target: 'billing' },
], null, 2);

const defaultSlaRulesText = JSON.stringify([
  { severity: 'overdue', assignee: '管理者', include_due_soon: false },
  { severity: 'due_soon', assignee: '管理者', include_due_soon: true },
], null, 2);

const parseJsonArray = (value: string): Array<Record<string, unknown>> => {
  const parsed = JSON.parse(value || '[]') as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('JSON array expected');
  }
  return parsed as Array<Record<string, unknown>>;
};

export const BillingWorkspace = ({
  currentUser,
  patients,
  searchQuery,
  onAuthExpired,
  onOpenChart,
  onSearchChange,
}: BillingWorkspaceProps) => {
  const [drafts, setDrafts] = useState<ClaimDraftSummary[]>([]);
  const [returnEvents, setReturnEvents] = useState<ClaimReturnEventSummary[]>([]);
  const [monthlyCloseSummary, setMonthlyCloseSummary] = useState<MonthlyCloseSummary | null>(null);
  const [returnAnalytics, setReturnAnalytics] = useState<ClaimReturnAnalytics | null>(null);
  const [returnAnalyticsComparison, setReturnAnalyticsComparison] = useState<ClaimReturnAnalyticsComparison | null>(null);
  const [returnTrend, setReturnTrend] = useState<ClaimReturnTrendPoint[]>([]);
  const [returnSlaSummary, setReturnSlaSummary] = useState<ClaimReturnSlaSummary | null>(null);
  const [returnSlaAlerts, setReturnSlaAlerts] = useState<ClaimReturnSlaAlert[]>([]);
  const [claimSlaSetting, setClaimSlaSetting] = useState<ClaimSlaSetting | null>(null);
  const [claimSlaDryRun, setClaimSlaDryRun] = useState<ClaimSlaNotificationDryRun | null>(null);
  const [claimTransmissions, setClaimTransmissions] = useState<ClaimTransmissionSummary[]>([]);
  const [monthlyCloseReport, setMonthlyCloseReport] = useState<Record<string, unknown> | null>(null);
  const [cancelCloseConfirmOpen, setCancelCloseConfirmOpen] = useState(false);
  const [billingAuditLogs, setBillingAuditLogs] = useState<AuditLogEntry[]>([]);
  const [closeMonth, setCloseMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [closeCancelReason, setCloseCancelReason] = useState('');
  const [closeApprovalNote, setCloseApprovalNote] = useState('');
  const [queue, setQueue] = useState<QueueFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [returnStatus, setReturnStatus] = useState<ReturnStatusFilter>('open');
  const [returnAssignee, setReturnAssignee] = useState<ReturnAssigneeFilter>('all');
  const [transmissionStatus, setTransmissionStatus] = useState<ClaimTransmissionSummary['status'] | 'all'>('all');
  const [transmissionReclaimOnly, setTransmissionReclaimOnly] = useState(false);
  const [slaDueSoonHours, setSlaDueSoonHours] = useState('48');
  const [slaIncludeNoDue, setSlaIncludeNoDue] = useState(true);
  const [slaEscalationAssignee, setSlaEscalationAssignee] = useState('管理者');
  const [slaDestinationsText, setSlaDestinationsText] = useState(defaultSlaDestinationsText);
  const [slaRulesText, setSlaRulesText] = useState(defaultSlaRulesText);
  const [slaNote, setSlaNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingClaimDraft, setIsSavingClaimDraft] = useState(false);
  const [isClosingMonth, setIsClosingMonth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedSummary, setSelectedSummary] = useState<ClaimDraftSummary | null>(null);
  const [claimDraft, setClaimDraft] = useState<ClaimDraft | null>(null);
  const [orcaPreviewPayload, setOrcaPreviewPayload] = useState<Record<string, unknown> | null>(null);
  const [editingClaimLineId, setEditingClaimLineId] = useState<number | null>(null);
  const [claimLineForm, setClaimLineForm] = useState({ receiptCode: '', receiptName: '', points: '', unit: '' });
  const [receiptCodeCandidates, setReceiptCodeCandidates] = useState<ReceiptCodeCandidate[]>([]);
  const [isLoadingReceiptCandidates, setIsLoadingReceiptCandidates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void refreshToken;

    const loadDrafts = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextDrafts = await listClaimDrafts({
          queue,
          status,
          search: searchQuery,
          limit: 120,
        });

        if (!cancelled) {
          setDrafts(nextDrafts);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '請求ドラフト一覧の取得に失敗しました。');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadDrafts();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired, queue, refreshToken, searchQuery, status]);

  useEffect(() => {
    let cancelled = false;
    void refreshToken;

    const loadReturnEvents = async () => {
      try {
        const nextEvents = await listClaimReturnEvents({
          status: returnStatus,
          eventType: 'all',
          assignee: returnAssignee,
          search: searchQuery,
          limit: 80,
        });
        if (!cancelled) {
          setReturnEvents(nextEvents);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '返戻・査定キューの取得に失敗しました。');
      }
    };

    loadReturnEvents();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired, refreshToken, returnAssignee, returnStatus, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    void refreshToken;
    const loadMonthlyClose = async () => {
      try {
        const [summary, analytics, comparison, trend, slaSummary, slaAlerts, slaSetting, transmissions, auditLogs] = await Promise.all([
          getMonthlyCloseSummary(closeMonth),
          getClaimReturnAnalytics(closeMonth),
          compareClaimReturnAnalytics(closeMonth),
          listClaimReturnTrend(closeMonth, 6),
          getClaimReturnSlaSummary(),
          listClaimReturnSlaAlerts(),
          getClaimSlaSetting(),
          listClaimTransmissions({
            month: closeMonth,
            status: transmissionStatus,
            search: searchQuery,
            reclaimOnly: transmissionReclaimOnly,
            limit: 40,
          }),
          listAuditLogs(20, { scope: 'billing' }),
        ]);
        if (!cancelled) {
          setMonthlyCloseSummary(summary);
          setReturnAnalytics(analytics);
          setReturnAnalyticsComparison(comparison);
          setReturnTrend(trend);
          setReturnSlaSummary(slaSummary);
          setReturnSlaAlerts(slaAlerts);
          setClaimSlaSetting(slaSetting);
          setSlaDueSoonHours(String(slaSetting.dueSoonHours));
          setSlaIncludeNoDue(slaSetting.includeNoDue);
          setSlaEscalationAssignee(slaSetting.escalationAssignee);
          setSlaDestinationsText(JSON.stringify(slaSetting.notifyDestinations, null, 2));
          setSlaRulesText(JSON.stringify(slaSetting.escalationRules, null, 2));
          setSlaNote(slaSetting.note ?? '');
          setClaimTransmissions(transmissions);
          setBillingAuditLogs(auditLogs);
        }
      } catch (error) {
        if (cancelled) return;
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '月次締めサマリの取得に失敗しました。');
      }
    };
    loadMonthlyClose();
    return () => {
      cancelled = true;
    };
  }, [closeMonth, onAuthExpired, refreshToken, searchQuery, transmissionReclaimOnly, transmissionStatus]);

  const stats = useMemo(() => {
    const openIssueCount = drafts.filter((draft) => draft.openIssueCount > 0 || draft.unresolvedLineCount > 0).length;
    return {
      total: drafts.length,
      openIssueCount,
      readyCount: drafts.filter((draft) => draft.status === 'ready' && draft.openErrorCount === 0 && draft.unresolvedLineCount === 0).length,
      transmissionErrorCount: drafts.filter((draft) => draft.latestTransmissionStatus === 'rejected' || draft.latestTransmissionStatus === 'error').length,
      returnEventCount: returnEvents.filter((event) => event.status === 'open' || event.status === 'in_progress').length,
    };
  }, [drafts, returnEvents]);

  const patientIds = useMemo(() => new Set(patients.map((patient) => patient.id)), [patients]);
  const selectedPatient = selectedSummary
    ? patients.find((patient) => patient.id === selectedSummary.patientId) ?? null
    : null;
  const openClaimIssues = useMemo(
    () => claimDraft?.issues.filter((issue) => issue.status === 'open') ?? [],
    [claimDraft],
  );
  const claimIssuesByType = useMemo(
    () =>
      openClaimIssues.reduce<Record<string, typeof openClaimIssues>>((grouped, issue) => {
        grouped[issue.issueType] = [...(grouped[issue.issueType] ?? []), issue];
        return grouped;
      }, {}),
    [openClaimIssues],
  );
  const unresolvedClaimLineCount = claimDraft?.lines.filter((line) => !line.receiptCode).length ?? 0;
  const reviewClaimAdjustmentCount = claimDraft?.adjustments.filter((item) => item.status === 'suggested').length ?? 0;
  const previewPayloadSource = orcaPreviewPayload ?? claimDraft?.transmissions[0]?.requestPayload ?? null;
  const previewClaim = getOrcaPayloadClaim(previewPayloadSource);
  const previewSummary = getPayloadSummary(previewClaim);
  const previewValidation = asRecord(previewPayloadSource?.validation);
  const previewDryRun = asRecord(previewPayloadSource?.dry_run);
  const previewCanSubmit = previewValidation?.can_submit === true;
  const latestSendableItems = getPayloadArray(previewClaim, 'orca_receipt_items');
  const latestUnresolvedItems = getPayloadArray(previewClaim, 'unresolved_items');
  const selectedDraftReturnEvents = useMemo(
    () => claimDraft ? returnEvents.filter((event) => event.claimDraftId === claimDraft.id) : [],
    [claimDraft, returnEvents],
  );
  const currentComparableLines = useMemo(
    () => claimDraft?.lines.map(lineToPayloadComparable) ?? [],
    [claimDraft],
  );
  const transmissionComparisons = useMemo(
    () =>
      claimDraft?.transmissions.map((transmission, index) => {
        const previous = claimDraft.transmissions[index + 1];
        const comparison = previous
          ? compareLinePayloads(getTransmissionItems(transmission.requestPayload), getTransmissionItems(previous.requestPayload))
          : null;
        return { transmission, previous, comparison };
      }) ?? [],
    [claimDraft],
  );
  const returnEventDiffs = useMemo(
    () =>
      selectedDraftReturnEvents.map((event) => {
        const transmission = claimDraft?.transmissions.find((item) => item.id === event.transmissionId);
        const previousItems = transmission ? getTransmissionItems(transmission.requestPayload) : [];
        return {
          event,
          transmission,
          comparison: compareLinePayloads(currentComparableLines, previousItems),
        };
      }),
    [claimDraft, currentComparableLines, selectedDraftReturnEvents],
  );

  const refreshDrafts = () => setRefreshToken((current) => current + 1);

  const handleAuthAwareError = (error: unknown, fallbackMessage: string) => {
    if (isUnauthorizedError(error)) {
      onAuthExpired();
      return;
    }
    setErrorMessage(error instanceof Error ? error.message : fallbackMessage);
  };

  const openClaimDetail = async (summary: ClaimDraftSummary) => {
    setSelectedSummary(summary);
    setClaimDraft(null);
    setOrcaPreviewPayload(null);
    setEditingClaimLineId(null);
    setReceiptCodeCandidates([]);
    setIsLoadingDetail(true);
    setErrorMessage(null);
    try {
      const draft = await getClaimDraft(summary.id);
      setClaimDraft(draft);
    } catch (error) {
      handleAuthAwareError(error, '請求ドラフト詳細の取得に失敗しました。');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const closeClaimDetail = () => {
    setSelectedSummary(null);
    setClaimDraft(null);
    setOrcaPreviewPayload(null);
    setEditingClaimLineId(null);
    setReceiptCodeCandidates([]);
  };

  const syncDraft = (draft: ClaimDraft) => {
    setClaimDraft(draft);
    refreshDrafts();
  };

  const handleUpdateClaimDraftStatus = async (status: ClaimDraft['status']) => {
    if (!claimDraft || isSavingClaimDraft) {
      return;
    }
    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await updateClaimDraftStatus(claimDraft.id, status);
      syncDraft(draft);
    } catch (error) {
      handleAuthAwareError(error, '請求ドラフトの状態更新に失敗しました。');
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
      syncDraft(draft);
      setOrcaPreviewPayload(preview);
    } catch (error) {
      handleAuthAwareError(error, '請求ドラフトの再点検に失敗しました。');
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
      const preview = await dryRunClaimDraftOrcaPayload(claimDraft.id);
      setOrcaPreviewPayload(preview);
    } catch (error) {
      handleAuthAwareError(error, '送信前 preview の取得に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleExportTransmissionsCsv = async () => {
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      const csv = await exportClaimTransmissionsCsv({
        month: closeMonth,
        status: transmissionStatus,
        search: searchQuery,
        reclaimOnly: transmissionReclaimOnly,
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `claim-transmissions-${closeMonth}.csv`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      handleAuthAwareError(error, '送信・再請求監査CSVの出力に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleLoadMonthlyCloseReport = async () => {
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      const report = await getMonthlyCloseReport(closeMonth);
      setMonthlyCloseReport(report);
    } catch (error) {
      handleAuthAwareError(error, '月次締めレポートの取得に失敗しました。');
    } finally {
      setIsClosingMonth(false);
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
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, 'ORCA送信に失敗しました。');
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
      syncDraft(draft);
    } catch (error) {
      handleAuthAwareError(error, '請求点数調整の更新に失敗しました。');
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
      handleAuthAwareError(error, 'レセ電コード候補の取得に失敗しました。');
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
      syncDraft(draft);
      setEditingClaimLineId(null);
      setReceiptCodeCandidates([]);
      setOrcaPreviewPayload(null);
    } catch (error) {
      handleAuthAwareError(error, '請求明細コードの補正に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  const handleUpdateReturnEvent = async (
    event: ClaimReturnEventSummary,
    nextStatus: ClaimReturnEvent['status'],
  ) => {
    setErrorMessage(null);
    try {
      await updateClaimReturnEvent(event.id, {
        status: nextStatus,
        assignee: nextStatus === 'ignored' ? event.assignee : event.assignee ?? currentUser.displayName,
        resolutionNote: nextStatus === 'resolved' ? '医事ワークスペースで対応済みに更新' : event.resolutionNote,
      });
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, '返戻・査定イベントの更新に失敗しました。');
    }
  };

  const handleAssignReturnEvent = async (event: ClaimReturnEventSummary, assignee?: string) => {
    setErrorMessage(null);
    try {
      await assignClaimReturnEvent(event.id, assignee);
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, '返戻・査定イベントの担当更新に失敗しました。');
    }
  };

  const handleEscalateSla = async () => {
    if (currentUser.role !== '管理者' || isClosingMonth) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      await escalateClaimReturnSla({
        assignee: claimSlaSetting?.escalationAssignee || currentUser.displayName,
        includeDueSoon: false,
        note: '医事ワークスペースから期限超過をエスカレーション',
      });
      await refreshMonthlyCloseSummary();
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, 'SLAエスカレーションに失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleUpdateClaimSlaSetting = async () => {
    if (currentUser.role !== '管理者' || isClosingMonth) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      const updated = await updateClaimSlaSetting({
        dueSoonHours: Number(slaDueSoonHours),
        includeNoDue: slaIncludeNoDue,
        escalationAssignee: slaEscalationAssignee.trim() || '管理者',
        notifyDestinations: parseJsonArray(slaDestinationsText),
        escalationRules: parseJsonArray(slaRulesText),
        note: slaNote.trim() || undefined,
      });
      setClaimSlaSetting(updated);
      await refreshMonthlyCloseSummary();
    } catch (error) {
      handleAuthAwareError(error, 'SLA通知・エスカレーション設定の更新に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleDryRunClaimSlaNotifications = async () => {
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      const result = await dryRunClaimSlaNotifications();
      setClaimSlaDryRun(result);
    } catch (error) {
      handleAuthAwareError(error, 'SLA通知dry-runに失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const refreshMonthlyCloseSummary = async () => {
    const [summary, analytics, comparison, trend, slaSummary, slaAlerts, slaSetting, transmissions, auditLogs] = await Promise.all([
      getMonthlyCloseSummary(closeMonth),
      getClaimReturnAnalytics(closeMonth),
      compareClaimReturnAnalytics(closeMonth),
      listClaimReturnTrend(closeMonth, 6),
      getClaimReturnSlaSummary(),
      listClaimReturnSlaAlerts(),
      getClaimSlaSetting(),
      listClaimTransmissions({
        month: closeMonth,
        status: transmissionStatus,
        search: searchQuery,
        reclaimOnly: transmissionReclaimOnly,
        limit: 40,
      }),
      listAuditLogs(20, { scope: 'billing' }),
    ]);
    setMonthlyCloseSummary(summary);
    setReturnAnalytics(analytics);
    setReturnAnalyticsComparison(comparison);
    setReturnTrend(trend);
    setReturnSlaSummary(slaSummary);
    setReturnSlaAlerts(slaAlerts);
    setClaimSlaSetting(slaSetting);
    setClaimTransmissions(transmissions);
    setBillingAuditLogs(auditLogs);
  };

  const handleRequestMonthClose = async (force: boolean) => {
    if (isClosingMonth) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      await requestMonthlyClaimClose(closeMonth, {
        force,
        note: closeApprovalNote.trim() || undefined,
      });
      setCloseApprovalNote('');
      await refreshMonthlyCloseSummary();
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, force ? '月次締めの強制承認依頼に失敗しました。' : '月次締めの承認依頼に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleApproveMonthClose = async () => {
    if (isClosingMonth) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      await approveMonthlyClaimClose(closeMonth, closeApprovalNote.trim() || undefined);
      setCloseApprovalNote('');
      await refreshMonthlyCloseSummary();
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, '月次締め承認に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleCloseMonth = async (force: boolean) => {
    if (isClosingMonth) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      await closeMonthlyClaims(closeMonth, force);
      await refreshMonthlyCloseSummary();
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, force ? '月次締めの強制確定に失敗しました。' : '月次締めの確定に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleCancelMonthClose = async () => {
    if (isClosingMonth || !closeCancelReason.trim()) {
      return;
    }
    setIsClosingMonth(true);
    setErrorMessage(null);
    try {
      await cancelMonthlyClaimClose(closeMonth, closeCancelReason.trim());
      setCloseCancelReason('');
      await refreshMonthlyCloseSummary();
      refreshDrafts();
      toast(`${closeMonth} の月次締めを取り消しました。`, 'success');
    } catch (error) {
      handleAuthAwareError(error, '月次締めの取消に失敗しました。');
    } finally {
      setIsClosingMonth(false);
    }
  };

  const handleReclaimReturnEvent = async (event: ClaimReturnEventSummary) => {
    if (isSavingClaimDraft) {
      return;
    }
    setIsSavingClaimDraft(true);
    setErrorMessage(null);
    try {
      const draft = await getClaimDraft(event.claimDraftId);
      setSelectedSummary({
        id: event.claimDraftId,
        patientId: event.patientId,
        patientName: event.patientName,
        patientKana: event.patientKana,
        department: event.department,
        doctor: '',
        admissionId: event.admissionId,
        status: event.claimStatus,
        sourceType: 'inpatient_discharge',
        totalPoints: event.totalPoints,
        createdBy: event.createdBy,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        lineCount: draft.lines.length,
        openIssueCount: draft.issues.filter((issue) => issue.status === 'open').length,
        openErrorCount: draft.issues.filter((issue) => issue.status === 'open' && issue.severity === 'error').length,
        openWarningCount: draft.issues.filter((issue) => issue.status === 'open' && issue.severity === 'warning').length,
        unresolvedLineCount: draft.lines.filter((line) => !line.receiptCode).length,
        suggestedAdjustmentCount: draft.adjustments.filter((adjustment) => adjustment.status === 'suggested').length,
        openReturnEventCount: 1,
      });
      const rechecked = await recheckClaimDraft(draft.id);
      const preview = await previewClaimDraftOrcaPayload(rechecked.id);
      const transmission = await submitClaimDraftToOrca(rechecked.id);
      const nextDraft = await getClaimDraft(rechecked.id);
      setClaimDraft(nextDraft);
      setOrcaPreviewPayload(preview);
      await updateClaimReturnEvent(event.id, {
        status: transmission.status === 'accepted' ? 'resolved' : 'in_progress',
        assignee: event.assignee ?? '医事担当',
        resolutionNote: transmission.status === 'accepted'
          ? `再請求を送信し、${transmission.sentAt} に受理されました。`
          : `再請求を送信しましたが、status=${transmission.status} です。`,
      });
      refreshDrafts();
    } catch (error) {
      handleAuthAwareError(error, '再請求に失敗しました。');
    } finally {
      setIsSavingClaimDraft(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-5 lg:px-6">
      <section className="grid gap-3 lg:grid-cols-[1fr_18rem] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-bold text-text-tertiary">
            <CircleDollarSign size={16} />
            医事・レセプト
          </div>
          <h1 className="mt-2 text-[26px] font-bold leading-tight text-solid-gray-900">請求ドラフト横断点検</h1>
        </div>
        <Button
          className="justify-self-start lg:justify-self-end"
          disabled={isLoading}
          onClick={refreshDrafts}
          type="button"
          variant="outline"
        >
          <RefreshCw size={16} className={cn(isLoading && 'animate-spin')} />
          更新
        </Button>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="表示中ドラフト" value={stats.total} />
        <StatCard label="未解決あり" tone="danger" value={stats.openIssueCount} />
        <StatCard label="送信待ち" tone="ready" value={stats.readyCount} />
        <StatCard label="返戻・査定" tone="danger" value={stats.returnEventCount + stats.transmissionErrorCount} />
      </section>

      <section className="mt-5 rounded-8 border border-solid-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-solid-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-solid-gray-900">月次締めワークスペース</h2>
            <p className="mt-1 text-[12px] text-text-tertiary">未送信、返戻・査定、再請求待ち、担当者別キューを月単位で確認します。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {monthlyCloseSummary?.close ? (
              <span
                className={cn(
                  'rounded border px-3 py-2 text-[12px] font-bold',
                  monthlyCloseSummary.close.status === 'closed'
                    ? 'border-green-100 bg-green-50 text-green-900'
                    : 'border-amber-100 bg-amber-50 text-amber-900',
                )}
              >
                {monthlyCloseStatusLabels[monthlyCloseSummary.close.status]} / {monthlyCloseSummary.close.requestedBy ?? monthlyCloseSummary.close.closedBy} / {monthlyCloseSummary.close.updatedAt}
              </span>
            ) : null}
            <Input
              aria-label="締め対象月"
              className="h-9 max-w-[12rem]"
              onChange={(event) => setCloseMonth(event.target.value)}
              type="month"
              value={closeMonth}
            />
          </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <StatCard label="請求件数" value={monthlyCloseSummary?.claimCount ?? 0} />
          <StatCard label="未送信/未完了" tone="danger" value={monthlyCloseSummary?.unsubmittedCount ?? 0} />
          <StatCard label="返戻・査定" tone="danger" value={(monthlyCloseSummary?.openReturnCount ?? 0) + (monthlyCloseSummary?.assessmentCount ?? 0)} />
          <StatCard label="再請求待ち" tone="ready" value={monthlyCloseSummary?.reclaimWaitingCount ?? 0} />
        </div>
        <div className="grid gap-3 border-t border-solid-gray-200 p-4 md:grid-cols-4">
          <StatCard label="返戻/査定 総数" value={returnAnalytics?.totalCount ?? 0} />
          <StatCard label="未対応" tone="danger" value={returnAnalytics?.openCount ?? 0} />
          <StatCard label="対応中" tone="ready" value={returnAnalytics?.inProgressCount ?? 0} />
          <StatCard label="解決済み" value={returnAnalytics?.resolvedCount ?? 0} />
        </div>
        <div className="grid gap-3 border-t border-solid-gray-200 p-4 md:grid-cols-4">
          <StatCard label="SLA対象" value={returnSlaSummary?.openCount ?? 0} />
          <StatCard label="期限超過" tone="danger" value={returnSlaSummary?.overdueCount ?? 0} />
          <StatCard label="48h以内" tone="ready" value={returnSlaSummary?.dueSoonCount ?? 0} />
          <StatCard label="期限未設定" value={returnSlaSummary?.noDueCount ?? 0} />
        </div>
        <div className="grid gap-4 border-t border-solid-gray-200 p-4 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-bold text-text-tertiary">状態別</p>
            <div className="mt-2 space-y-2">
              {(monthlyCloseSummary?.statusBuckets ?? []).map((bucket) => (
                <div className="flex items-center justify-between rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={bucket.key}>
                  <span className="text-[13px] font-bold text-text-primary">{statusLabels[bucket.key as StatusFilter] ?? bucket.label}</span>
                  <span className="text-[12px] text-text-secondary">{bucket.count}件 / {bucket.totalPoints.toLocaleString()}点</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-bold text-text-tertiary">担当者別キュー</p>
            <div className="mt-2 space-y-2">
              {(monthlyCloseSummary?.assigneeBuckets ?? []).length > 0 ? monthlyCloseSummary?.assigneeBuckets.map((bucket) => (
                <div className="flex items-center justify-between rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={bucket.key}>
                  <span className="text-[13px] font-bold text-text-primary">{bucket.label}</span>
                  <span className="text-[12px] text-text-secondary">{bucket.count}件</span>
                </div>
              )) : (
                <div className="rounded border border-green-100 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-900">
                  未対応キューはありません。
                </div>
              )}
              {monthlyCloseSummary && monthlyCloseSummary.unresolvedIssueCount > 0 ? (
                <div className="rounded border border-red-100 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-1000">
                  締め前に未解決 issue {monthlyCloseSummary.unresolvedIssueCount}件の確認が必要です。
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-4 border-t border-solid-gray-200 p-4 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-bold text-text-tertiary">返戻・査定理由</p>
            <div className="mt-2 space-y-2">
	              {(returnAnalytics?.reasonBuckets ?? []).slice(0, 6).map((bucket) => (
	                <div className="flex items-center justify-between rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={bucket.key}>
	                  <div>
	                    <p className="text-[13px] font-bold text-text-primary">{bucket.label}</p>
	                    <p className="mt-1 text-[11px] text-text-tertiary">
	                      {bucket.eventType ? returnEventTypeLabels[bucket.eventType] : '分類なし'} / 未対応 {bucket.openCount}件 / 解決 {bucket.resolvedCount}件
	                    </p>
	                  </div>
	                  <div className="text-right">
	                    <span className="text-[13px] font-bold text-solid-gray-900">{bucket.count}件</span>
	                    <p className={cn('mt-1 text-[11px] font-bold', (returnAnalyticsComparison?.reasonDeltas.find((item) => item.key === bucket.key)?.delta ?? 0) > 0 ? 'text-red-900' : 'text-green-900')}>
	                      前月比 {returnAnalyticsComparison?.reasonDeltas.find((item) => item.key === bucket.key)?.delta ?? 0}
	                    </p>
	                  </div>
	                </div>
	              ))}
              {(returnAnalytics?.reasonBuckets ?? []).length === 0 ? (
                <div className="rounded border border-green-100 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-900">
                  対象月の返戻・査定理由はありません。
                </div>
              ) : null}
            </div>
          </div>
	          <div>
	            <div className="flex items-center justify-between gap-2">
	              <p className="text-[12px] font-bold text-text-tertiary">請求監査ログ</p>
	              <span className={cn('rounded px-2 py-1 text-[11px] font-bold', (returnAnalyticsComparison?.openDelta ?? 0) > 0 ? 'bg-red-50 text-red-900' : 'bg-green-50 text-green-900')}>
	                未対応前月比 {returnAnalyticsComparison?.openDelta ?? 0}
	              </span>
	            </div>
            <div className="mt-2 space-y-2">
              {billingAuditLogs.slice(0, 6).map((log) => (
                <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={log.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-text-primary">{log.action}</span>
                    <span className="text-[11px] text-text-tertiary">{log.timestamp}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-text-secondary">{log.actor} / {log.detail}</p>
                </div>
              ))}
              {billingAuditLogs.length === 0 ? (
                <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2 text-[12px] font-bold text-text-tertiary">
                  請求監査ログはまだありません。
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="grid gap-4 border-t border-solid-gray-200 p-4 lg:grid-cols-2">
          <div>
            <p className="text-[12px] font-bold text-text-tertiary">返戻・査定の期間推移</p>
            <div className="mt-2 space-y-2">
              {returnTrend.map((point) => {
                const maxCount = Math.max(...returnTrend.map((item) => item.totalCount), 1);
                return (
                  <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={point.month}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[13px] font-bold text-text-primary">{point.month}</span>
                      <span className="text-[12px] text-text-secondary">
                        {point.totalCount}件 / 未対応 {point.openCount}件
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-solid-gray-200">
                      <div className="h-full bg-blue-600" style={{ width: `${Math.max(4, (point.totalCount / maxCount) * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      主理由: {point.topReasonCode ?? '-'} {point.topReasonCount > 0 ? `${point.topReasonCount}件` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-bold text-text-tertiary">担当者別SLA</p>
              <Button
                disabled={currentUser.role !== '管理者' || isClosingMonth || (returnSlaSummary?.overdueCount ?? 0) === 0}
                onClick={handleEscalateSla}
                size="xs"
                type="button"
                variant="outline"
              >
                期限超過をエスカレーション
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {(returnSlaSummary?.assigneeBuckets ?? []).slice(0, 6).map((bucket) => (
                <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={bucket.assignee}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold text-text-primary">{bucket.assignee}</span>
                    <span className="text-[12px] text-text-secondary">{bucket.openCount}件</span>
                  </div>
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    期限超過 {bucket.overdueCount} / {claimSlaSetting?.dueSoonHours ?? 48}h以内 {bucket.dueSoonCount} / 期限未設定 {bucket.noDueCount}
                  </p>
                </div>
              ))}
              {(returnSlaSummary?.assigneeBuckets ?? []).length === 0 ? (
                <div className="rounded border border-green-100 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-900">
                  SLA対象の返戻・査定はありません。
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-t border-solid-gray-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-text-tertiary">SLA通知</p>
            <span className="text-[11px] font-bold text-text-tertiary">{returnSlaAlerts.length}件</span>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {returnSlaAlerts.slice(0, 8).map((alert) => (
              <div
                className={cn(
                  'rounded border px-3 py-2',
                  alert.severity === 'overdue'
                    ? 'border-red-200 bg-red-50'
                    : alert.severity === 'due_soon'
                      ? 'border-yellow-200 bg-yellow-50'
                      : 'border-solid-gray-200 bg-surface-subtle',
                )}
                key={alert.eventId}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-text-primary">{alert.patientName}</span>
                  <span className="text-[11px] font-bold text-text-tertiary">
                    {alert.severity === 'overdue' ? '期限超過' : alert.severity === 'due_soon' ? '期限接近' : '期限未設定'}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-text-secondary">{alert.title}</p>
                <p className="mt-1 text-[11px] text-text-tertiary">
                  担当 {alert.assignee} / 期限 {alert.dueAt ?? '-'} / {alert.reasonCode ?? '-'}
                </p>
              </div>
            ))}
            {returnSlaAlerts.length === 0 ? (
              <div className="rounded border border-green-100 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-900">
                通知対象の返戻・査定はありません。
              </div>
            ) : null}
          </div>
        </div>
        <div className="border-t border-solid-gray-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[12px] font-bold text-text-tertiary">SLA通知配信先・エスカレーション設定</p>
              <p className="mt-1 text-[11px] text-text-tertiary">
                更新 {claimSlaSetting?.updatedAt ?? '-'} / {claimSlaSetting?.updatedBy ?? '-'} / 配信先 {claimSlaSetting?.notifyDestinations.length ?? 0}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={isClosingMonth} onClick={handleDryRunClaimSlaNotifications} size="sm" type="button" variant="outline">
                通知dry-run
              </Button>
              <Button disabled={isClosingMonth || currentUser.role !== '管理者'} onClick={handleUpdateClaimSlaSetting} size="sm" type="button" variant="outline">
                SLA設定保存
              </Button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-4">
            <Input
              aria-label="期限接近時間"
              className="h-9"
              onChange={(event) => setSlaDueSoonHours(event.target.value)}
              type="number"
              value={slaDueSoonHours}
            />
            <Input
              aria-label="エスカレーション担当"
              className="h-9"
              onChange={(event) => setSlaEscalationAssignee(event.target.value)}
              value={slaEscalationAssignee}
            />
            <label className="flex h-9 items-center gap-2 rounded border border-border bg-white px-3 text-[13px] font-bold text-text-primary">
              <input checked={slaIncludeNoDue} onChange={(event) => setSlaIncludeNoDue(event.target.checked)} type="checkbox" />
              期限未設定も通知
            </label>
            <Input
              aria-label="SLAメモ"
              className="h-9"
              onChange={(event) => setSlaNote(event.target.value)}
              placeholder="運用メモ"
              value={slaNote}
            />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-bold text-text-tertiary">配信先 JSON</p>
              <textarea
                className="min-h-36 w-full rounded border border-border bg-white p-3 font-mono text-[11px] leading-normal text-text-primary"
                onChange={(event) => setSlaDestinationsText(event.target.value)}
                value={slaDestinationsText}
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold text-text-tertiary">エスカレーションルール JSON</p>
              <textarea
                className="min-h-36 w-full rounded border border-border bg-white p-3 font-mono text-[11px] leading-normal text-text-primary"
                onChange={(event) => setSlaRulesText(event.target.value)}
                value={slaRulesText}
              />
            </div>
          </div>
          {claimSlaDryRun ? (
            <div className="mt-3 rounded border border-blue-100 bg-blue-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] font-bold text-blue-950">通知dry-run結果</p>
                <span className="text-[11px] font-bold text-blue-900">
                  alerts {claimSlaDryRun.alertCount} / destinations {claimSlaDryRun.destinationCount} / {claimSlaDryRun.generatedAt}
                </span>
              </div>
              <pre className="mt-2 max-h-48 overflow-auto rounded border border-blue-100 bg-white p-3 text-[11px] leading-normal text-blue-950">
                {JSON.stringify({ destinations: claimSlaDryRun.destinations, alerts: claimSlaDryRun.alerts.slice(0, 10) }, null, 2)}
              </pre>
            </div>
          ) : null}
        </div>
        <div className="border-t border-solid-gray-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[12px] font-bold text-text-tertiary">送信・再請求監査</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="送信状態"
                className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-text-primary"
                onChange={(event) => setTransmissionStatus(event.target.value as ClaimTransmissionSummary['status'] | 'all')}
                value={transmissionStatus}
              >
                <option value="all">送信状態すべて</option>
                <option value="accepted">受理</option>
                <option value="rejected">差戻し</option>
                <option value="error">エラー</option>
              </select>
              <label className="flex h-9 items-center gap-2 rounded border border-border bg-white px-3 text-[13px] font-bold text-text-primary">
                <input
                  checked={transmissionReclaimOnly}
                  onChange={(event) => setTransmissionReclaimOnly(event.target.checked)}
                  type="checkbox"
                />
                再請求のみ
              </label>
              <Button disabled={isClosingMonth} onClick={handleExportTransmissionsCsv} size="sm" type="button" variant="outline">
                CSV export
              </Button>
              <span className="text-[11px] font-bold text-text-tertiary">{claimTransmissions.length}件</span>
            </div>
          </div>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {claimTransmissions.slice(0, 8).map((transmission) => (
              <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2" key={transmission.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-text-primary">{transmission.patientName}</span>
                  <span className={cn('rounded px-2 py-1 text-[11px] font-bold', transmission.status === 'accepted' ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-900')}>
                    {transmissionLabels[transmission.status]}
                  </span>
                </div>
                <p className="mt-1 text-[12px] text-text-secondary">
                  {transmission.sentAt} / {transmission.sentBy} / {transmission.totalPoints.toLocaleString()}点
                </p>
                <p className="mt-1 text-[11px] font-bold text-text-tertiary">
                  {transmission.isReclaim ? `再請求 ${transmission.transmissionCount}回目` : '初回送信'} / draft {transmission.claimDraftId}
                </p>
              </div>
            ))}
            {claimTransmissions.length === 0 ? (
              <div className="rounded border border-solid-gray-200 bg-surface-subtle px-3 py-2 text-[12px] font-bold text-text-tertiary">
                対象月の送信履歴はありません。
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-solid-gray-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="text-[12px] text-text-secondary">
            {monthlyCloseSummary?.close?.status === 'pending_approval'
              ? `承認依頼: ${monthlyCloseSummary.close.requestedAt ?? '-'} に ${monthlyCloseSummary.close.requestedBy ?? '-'} が依頼`
              : monthlyCloseSummary?.close?.status === 'closed'
              ? `監査記録: ${monthlyCloseSummary.close.approvedAt ?? monthlyCloseSummary.close.closedAt} に ${monthlyCloseSummary.close.approvedBy ?? monthlyCloseSummary.close.closedBy} が確定`
              : '締め確定後は監査記録に確定者、取消者、取消理由が残ります。'}
            {monthlyCloseSummary?.close?.approvalNote ? ` / 承認メモ: ${monthlyCloseSummary.close.approvalNote}` : ''}
            {monthlyCloseSummary?.close?.cancelReason ? ` / 取消理由: ${monthlyCloseSummary.close.cancelReason}` : ''}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="締め承認メモ"
              className="h-9 w-[14rem]"
              onChange={(event) => setCloseApprovalNote(event.target.value)}
              placeholder="承認メモ"
              value={closeApprovalNote}
            />
            <Button
              disabled={isClosingMonth || monthlyCloseSummary?.close?.status === 'closed'}
              onClick={() => handleRequestMonthClose(false)}
              size="sm"
            >
              <CheckCircle2 size={15} />
              承認依頼
            </Button>
            <Button
              disabled={isClosingMonth}
              onClick={handleLoadMonthlyCloseReport}
              size="sm"
              variant="ghost"
            >
              月次レポート
            </Button>
            <Button
              disabled={isClosingMonth || monthlyCloseSummary?.close?.status === 'closed'}
              onClick={() => handleRequestMonthClose(true)}
              size="sm"
              variant="outline"
            >
              <AlertTriangle size={15} />
              強制依頼
            </Button>
            <Button
              disabled={isClosingMonth || currentUser.role !== '管理者' || monthlyCloseSummary?.close?.status !== 'pending_approval'}
              onClick={handleApproveMonthClose}
              size="sm"
              variant="outline"
            >
              <CheckCircle2 size={15} />
              承認
            </Button>
            <Button
              disabled={isClosingMonth || currentUser.role !== '管理者' || monthlyCloseSummary?.close?.status === 'closed'}
              onClick={() => handleCloseMonth(true)}
              size="sm"
              variant="outline"
            >
              <AlertTriangle size={15} />
              管理者強制締め
            </Button>
            <Input
              aria-label="締め取消理由"
              className="h-9 w-[14rem]"
              onChange={(event) => setCloseCancelReason(event.target.value)}
              placeholder="取消理由"
              value={closeCancelReason}
            />
            <Button
              disabled={isClosingMonth || currentUser.role !== '管理者' || monthlyCloseSummary?.close?.status !== 'closed' || !closeCancelReason.trim()}
              onClick={() => setCancelCloseConfirmOpen(true)}
              size="sm"
              variant="outline"
            >
              <XCircle size={15} />
              締め取消
            </Button>
          </div>
        </div>
        {monthlyCloseReport ? (
          <div className="border-t border-solid-gray-200 bg-surface-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-bold text-text-primary">月次締めレポート preview</p>
              <span className="text-[11px] font-bold text-text-tertiary">{closeMonth}</span>
            </div>
            <pre className="mt-2 max-h-56 overflow-auto rounded border border-solid-gray-200 bg-white p-3 text-[11px] leading-normal text-text-secondary">
              {JSON.stringify(monthlyCloseReport, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="mt-5 rounded-8 border border-solid-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-solid-gray-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(queueLabels) as QueueFilter[]).map((item) => {
              const Icon = queueIcon(item);
              return (
                <Button
                  key={item}
                  onClick={() => setQueue(item)}
                  size="sm"
                  type="button"
                  variant={queue === item ? 'default' : 'secondary'}
                >
                  <Icon size={15} />
                  {queueLabels[item]}
                </Button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,22rem)_12rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                aria-label="請求ドラフト検索"
                className="h-9 pl-9 text-[13px]"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="患者名、ID、病名で検索"
                value={searchQuery}
              />
            </div>
            <select
              aria-label="請求状態"
              className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-text-primary"
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              value={status}
            >
              {(Object.keys(statusLabels) as StatusFilter[]).map((item) => (
                <option key={item} value={item}>
                  {statusLabels[item]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMessage ? (
          <div className="m-4 flex items-center gap-2 rounded-8 border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-bold text-red-1000">
            <AlertTriangle size={16} />
            {errorMessage}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="bg-solid-gray-50">
              <TableHead className="px-4">患者</TableHead>
              <TableHead>入院・診療</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">点数</TableHead>
              <TableHead>点検</TableHead>
              <TableHead>送信</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => (
              <TableRow key={draft.id} className="align-top">
                <TableCell className="px-4">
                  <div className="min-w-[13rem]">
                    <p className="text-[14px] font-bold text-solid-gray-900">{draft.patientName}</p>
                    <p className="mt-1 text-[12px] text-text-tertiary">
                      {draft.patientKana} / ID {draft.patientId}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-[13rem] text-[12px] text-text-secondary">
                    <p className="font-bold text-text-primary">{draft.primaryDiagnosis ?? '主病名未設定'}</p>
                    <p className="mt-1">{draft.department} / {draft.doctor}</p>
                    <p className="mt-1">入院ID {draft.admissionId ?? '-'} / {draft.wardId ?? '-'} {draft.bedId ?? ''}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex rounded-full border px-2 py-1 text-[12px] font-bold', statusClassNames[draft.status])}>
                    {statusLabels[draft.status]}
                  </span>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-text-tertiary">
                    <Clock3 size={12} />
                    {draft.updatedAt}
                  </p>
                </TableCell>
                <TableCell className="text-right">
                  <p className="text-[15px] font-bold text-solid-gray-900">{draft.totalPoints.toLocaleString()} 点</p>
                  <p className="mt-1 text-[11px] text-text-tertiary">明細 {draft.lineCount}件</p>
                </TableCell>
                <TableCell>
                  <div className="flex min-w-[13rem] flex-wrap gap-1.5">
                    <span className={cn('rounded-full px-2 py-1 text-[11px] font-bold', draft.openErrorCount > 0 ? 'bg-red-50 text-red-1000' : 'bg-solid-gray-50 text-text-tertiary')}>
                      error {draft.openErrorCount}
                    </span>
                    <span className={cn('rounded-full px-2 py-1 text-[11px] font-bold', draft.openWarningCount > 0 ? 'bg-yellow-50 text-yellow-1100' : 'bg-solid-gray-50 text-text-tertiary')}>
                      warning {draft.openWarningCount}
                    </span>
                    <span className={cn('rounded-full px-2 py-1 text-[11px] font-bold', draft.unresolvedLineCount > 0 ? 'bg-red-50 text-red-1000' : 'bg-solid-gray-50 text-text-tertiary')}>
                      コード未解決 {draft.unresolvedLineCount}
                    </span>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">
                      提案 {draft.suggestedAdjustmentCount}
                    </span>
                    {draft.openReturnEventCount > 0 ? (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-[11px] font-bold text-red-1000">
                        返戻/査定 {draft.openReturnEventCount}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="min-w-[8rem] text-[12px] text-text-secondary">
                    <p className="font-bold text-text-primary">
                      {draft.latestTransmissionStatus ? transmissionLabels[draft.latestTransmissionStatus] : '未送信'}
                    </p>
                    <p className="mt-1 text-[11px] text-text-tertiary">{draft.latestTransmissionAt ?? '-'}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => openClaimDetail(draft)}
                      size="sm"
                      type="button"
                      variant="default"
                    >
                      詳細
                    </Button>
                    <Button
                      disabled={!patientIds.has(draft.patientId)}
                      onClick={() => onOpenChart(draft.patientId)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      カルテ
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && drafts.length === 0 ? (
              <TableRow>
                <TableCell className="px-4 py-10 text-center text-[13px] font-bold text-text-tertiary" colSpan={7}>
                  対象の請求ドラフトはありません。
                </TableCell>
              </TableRow>
            ) : null}
            {isLoading ? (
              <TableRow>
                <TableCell className="px-4 py-10 text-center text-[13px] font-bold text-text-tertiary" colSpan={7}>
                  請求ドラフトを読み込んでいます。
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </section>

      <section className="mt-5 rounded-8 border border-solid-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-solid-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-solid-gray-900">返戻・査定キュー</h2>
            <p className="mt-1 text-[12px] text-text-tertiary">ORCA送信差戻しと手動登録された返戻・査定を患者横断で処理します。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="返戻査定担当"
              className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-text-primary"
              onChange={(event) => setReturnAssignee(event.target.value as ReturnAssigneeFilter)}
              value={returnAssignee}
            >
              <option value="all">担当すべて</option>
              <option value="mine">自分担当</option>
              <option value="unassigned">未割当</option>
            </select>
            <select
              aria-label="返戻査定状態"
              className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] font-bold text-text-primary"
              onChange={(event) => setReturnStatus(event.target.value as ReturnStatusFilter)}
              value={returnStatus}
            >
              <option value="open">未対応</option>
              <option value="in_progress">対応中</option>
              <option value="resolved">解決</option>
              <option value="ignored">対象外</option>
              <option value="all">すべて</option>
            </select>
          </div>
        </div>
        <div className="divide-y divide-solid-gray-200">
          {returnEvents.map((event) => (
            <article className="grid gap-3 p-4 xl:grid-cols-[1fr_18rem]" key={event.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded border px-2 py-1 text-[11px] font-bold', returnStatusClassNames[event.status])}>
                    {returnStatusLabels[event.status]}
                  </span>
                  <span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">
                    {returnEventTypeLabels[event.eventType]}
                  </span>
                  {event.reasonCode ? (
                    <span className="rounded border border-solid-gray-200 bg-solid-gray-50 px-2 py-1 text-[11px] font-bold text-text-secondary">
                      {event.reasonCode}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-[14px] font-bold text-solid-gray-900">{event.title}</h3>
                <p className="mt-1 text-[12px] leading-normal text-text-secondary">{event.message}</p>
                <p className="mt-2 text-[11px] text-text-tertiary">
                  {event.patientName} / ID {event.patientId} / 請求ドラフト {event.claimDraftId} / {event.receivedAt}
                </p>
                <p className="mt-1 text-[11px] font-bold text-text-tertiary">
                  担当: {event.assignee ?? '未割当'}
                </p>
              </div>
              <div className="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
                <Button disabled={Boolean(event.assignee)} onClick={() => handleAssignReturnEvent(event, currentUser.displayName)} size="sm" type="button" variant="secondary">
                  自分に割当
                </Button>
                {currentUser.role === '管理者' && event.assignee ? (
                  <Button onClick={() => handleAssignReturnEvent(event)} size="sm" type="button" variant="ghost">
                    未割当に戻す
                  </Button>
                ) : null}
                <Button onClick={() => openClaimDetail({
                  id: event.claimDraftId,
                  patientId: event.patientId,
                  patientName: event.patientName,
                  patientKana: event.patientKana,
                  department: event.department,
                  doctor: '',
                  admissionId: event.admissionId,
                  status: event.claimStatus,
                  sourceType: 'inpatient_discharge',
                  totalPoints: event.totalPoints,
                  createdBy: event.createdBy,
                  createdAt: event.createdAt,
                  updatedAt: event.updatedAt,
                  lineCount: 0,
                  openIssueCount: 0,
                  openErrorCount: 0,
                  openWarningCount: 0,
                  unresolvedLineCount: 0,
                  suggestedAdjustmentCount: 0,
                  openReturnEventCount: 1,
                })} size="sm" type="button" variant="outline">
                  請求詳細
                </Button>
                <Button disabled={event.status === 'in_progress'} onClick={() => handleUpdateReturnEvent(event, 'in_progress')} size="sm" type="button" variant="secondary">
                  対応中
                </Button>
                <Button disabled={isSavingClaimDraft || event.status === 'resolved'} onClick={() => handleReclaimReturnEvent(event)} size="sm" type="button" variant="outline">
                  再請求
                </Button>
                <Button disabled={event.status === 'resolved'} onClick={() => handleUpdateReturnEvent(event, 'resolved')} size="sm" type="button" variant="default">
                  解決
                </Button>
                <Button disabled={event.status === 'ignored'} onClick={() => handleUpdateReturnEvent(event, 'ignored')} size="sm" type="button" variant="ghost">
                  対象外
                </Button>
              </div>
            </article>
          ))}
          {returnEvents.length === 0 ? (
            <div className="p-8 text-center text-[13px] font-bold text-text-tertiary">
              対象の返戻・査定イベントはありません。
            </div>
          ) : null}
        </div>
      </section>

      <Drawer
        isOpen={Boolean(selectedSummary)}
        onClose={closeClaimDetail}
        title="請求ドラフト詳細"
        width="w-[42rem] max-w-[94vw]"
      >
        <div className="space-y-4">
          {selectedSummary ? (
            <section className="rounded-8 border border-solid-gray-200 bg-surface-subtle p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-bold text-solid-gray-900">{selectedSummary.patientName}</p>
                  <p className="mt-1 text-[12px] text-text-tertiary">
                    ID {selectedSummary.patientId} / {selectedSummary.department} / 入院ID {selectedSummary.admissionId ?? '-'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedPatient ? (
                    <Button onClick={() => onOpenChart(selectedPatient.id)} size="xs" type="button" variant="outline">
                      カルテ
                    </Button>
                  ) : null}
                  <Button
                    disabled={!claimDraft || isSavingClaimDraft}
                    onClick={() => handleUpdateClaimDraftStatus('reviewed')}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    レビュー済
                  </Button>
                  <Button
                    disabled={!claimDraft || isSavingClaimDraft}
                    onClick={() => handleUpdateClaimDraftStatus('ready')}
                    size="xs"
                    type="button"
                    variant="outline"
                  >
                    送信待ちへ
                  </Button>
                </div>
              </div>
            </section>
          ) : null}

          {isLoadingDetail ? (
            <div className="rounded-8 border border-solid-gray-200 bg-white p-6 text-center text-[13px] font-bold text-text-tertiary">
              請求ドラフト詳細を読み込んでいます。
            </div>
          ) : null}

          {claimDraft ? (
            <>
              <section className="rounded-8 border border-blue-100 bg-blue-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-bold text-blue-950">
                      {claimDraft.lines.length}明細 / {claimDraft.totalPoints.toLocaleString()}点
                    </p>
                    <p className="mt-1 text-[12px] text-blue-900">
                      未解決 {openClaimIssues.length}件 · コード未解決 {unresolvedClaimLineCount}明細 · 提案 {reviewClaimAdjustmentCount}件
                    </p>
                    {previewValidation ? (
                      <p className={cn('mt-1 text-[11px] font-bold', previewCanSubmit ? 'text-green-900' : 'text-red-900')}>
                        {previewCanSubmit
                          ? '送信前チェック: 送信可能'
                          : `送信前チェック: 停止 ${String(previewValidation.unresolved_count ?? 0)}明細 / error ${String(previewValidation.open_error_count ?? 0)}件`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={isSavingClaimDraft} onClick={handleRecheckClaimDraft} size="xs" type="button" variant="outline">
                      <RefreshCw size={14} />
                      再点検
                    </Button>
                    <Button disabled={isSavingClaimDraft} onClick={handlePreviewClaimDraft} size="xs" type="button" variant="ghost">
                      送信前 preview
                    </Button>
                    <Button disabled={isSavingClaimDraft || claimDraft.status === 'submitted'} onClick={handleSubmitClaimDraftToOrca} size="xs" type="button" variant="outline">
                      <Send size={14} />
                      ORCA送信
                    </Button>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">未解決 issue</p>
                {Object.keys(claimIssuesByType).length > 0 ? (
                  Object.entries(claimIssuesByType).map(([issueType, issues]) => (
                    <div className="rounded-8 border border-border bg-card p-3" key={issueType}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn('rounded border px-2 py-1 text-[11px] font-bold', claimIssueClasses[issueType] ?? 'border-blue-100 bg-blue-50 text-blue-900')}>
                          {claimIssueLabels[issueType] ?? issueType}
                        </span>
                        <span className="text-[11px] font-bold text-text-tertiary">{issues.length}件</span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {issues.map((issue) => (
                          <div className="rounded border border-border bg-surface-subtle px-2 py-1.5" key={issue.id}>
                            <p className="text-[12px] font-bold text-text-primary">{issue.message}</p>
                            {issue.evidence ? <p className="mt-1 text-[11px] leading-normal text-text-tertiary">根拠: {issue.evidence}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-8 border border-green-100 bg-green-50 p-3 text-[12px] font-bold text-green-900">
                    主要な未解決 issue はありません。
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">請求明細コード補正</p>
                {claimDraft.lines.map((line) => (
                  <div className={cn('rounded-8 border p-3', line.receiptCode ? 'border-border bg-card' : 'border-red-200 bg-red-50')} key={line.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-bold text-text-primary">{line.lineType}</p>
                        <p className="mt-1 text-[12px] leading-normal text-text-secondary">{line.label}</p>
                      </div>
                      <span className="text-[11px] font-bold text-text-tertiary">
                        {line.points.toLocaleString()}点 x {line.quantity}{line.unit ?? ''}
                      </span>
                    </div>
                    {line.receiptCode ? (
                      <p className="mt-2 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">
                        {line.receiptCode} {line.receiptName}
                      </p>
                    ) : (
                      <p className="mt-2 rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-900">
                        レセ電コード未解決
                      </p>
                    )}

                    {editingClaimLineId === line.id ? (
                      <div className="mt-3 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, receiptCode: event.target.value }))} placeholder="レセ電コード" value={claimLineForm.receiptCode} />
                          <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, receiptName: event.target.value }))} placeholder="名称" value={claimLineForm.receiptName} />
                          <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, points: event.target.value }))} placeholder="点数" value={claimLineForm.points} />
                          <Input onChange={(event) => setClaimLineForm((current) => ({ ...current, unit: event.target.value }))} placeholder="単位" value={claimLineForm.unit} />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-bold text-text-tertiary">候補</p>
                          {isLoadingReceiptCandidates ? (
                            <p className="text-[12px] text-text-tertiary">候補検索中...</p>
                          ) : receiptCodeCandidates.length > 0 ? (
                            receiptCodeCandidates.map((candidate) => (
                              <button
                                className="block w-full rounded border border-border bg-white px-2 py-1.5 text-left hover:bg-blue-50"
                                key={candidate.receiptCode}
                                onClick={() => applyReceiptCodeCandidate(candidate)}
                                type="button"
                              >
                                <span className="text-[12px] font-bold text-blue-950">{candidate.receiptCode} {candidate.receiptName}</span>
                                <span className="mt-0.5 block text-[11px] text-text-tertiary">
                                  {candidate.points ?? '-'}点 {candidate.unit ?? ''} {candidate.category ?? ''}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="text-[12px] text-text-tertiary">候補なし。手入力で補正できます。</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button disabled={isSavingClaimDraft || !claimLineForm.receiptCode.trim()} onClick={() => handleUpdateClaimLineReceiptCode(line)} size="xs" type="button" variant="outline">
                            保存して issue 解決
                          </Button>
                          <Button onClick={() => setEditingClaimLineId(null)} size="xs" type="button" variant="ghost">
                            閉じる
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button disabled={isSavingClaimDraft} onClick={() => startEditClaimLine(line)} size="xs" type="button" variant={line.receiptCode ? 'ghost' : 'outline'}>
                          <Edit3 size={14} />
                          {line.receiptCode ? 'コード修正' : 'コード補正'}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              {claimDraft.adjustments.length > 0 ? (
                <section className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">点検提案</p>
                  {claimDraft.adjustments.map((adjustment) => (
                    <div className="rounded-8 border border-border bg-card p-3" key={adjustment.id}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-bold text-text-primary">{adjustment.reason}</p>
                        <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', claimAdjustmentStatusClasses[adjustment.status])}>
                          {claimAdjustmentStatusLabels[adjustment.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-text-secondary">
                        {adjustment.pointsDelta > 0 ? '+' : ''}{adjustment.pointsDelta}点
                      </p>
                      {adjustment.comment ? (
                        <p className="mt-2 text-[11px] leading-normal text-text-tertiary">
                          摘要候補: {adjustment.commentCode ? `${adjustment.commentCode} ` : ''}{adjustment.comment}
                        </p>
                      ) : null}
                      <div className="mt-3 flex gap-2">
                        <Button disabled={isSavingClaimDraft || adjustment.status === 'accepted'} onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'accepted')} size="xs" type="button" variant="outline">
                          採用
                        </Button>
                        <Button disabled={isSavingClaimDraft || adjustment.status === 'ignored'} onClick={() => handleUpdateClaimLineAdjustmentStatus(adjustment, 'ignored')} size="xs" type="button" variant="ghost">
                          無視
                        </Button>
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">返戻・査定の明細差分</p>
                  <span className="text-[11px] font-bold text-text-tertiary">{returnEventDiffs.length}件</span>
                </div>
                {returnEventDiffs.length > 0 ? (
                  returnEventDiffs.map(({ event, transmission, comparison }) => (
                    <div className="rounded-8 border border-border bg-card p-3" key={event.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn('rounded border px-2 py-1 text-[11px] font-bold', returnStatusClassNames[event.status])}>
                              {returnStatusLabels[event.status]}
                            </span>
                            <span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900">
                              {returnEventTypeLabels[event.eventType]}
                            </span>
                          </div>
                          <p className="mt-2 text-[13px] font-bold text-text-primary">{event.title}</p>
                          <p className="mt-1 text-[12px] leading-normal text-text-secondary">{event.message}</p>
                          <p className="mt-1 text-[11px] text-text-tertiary">
                            比較元: {transmission ? `${transmission.sentAt} / ${transmissionLabels[transmission.status]}` : '送信履歴なし'}
                          </p>
                        </div>
                        <Button disabled={isSavingClaimDraft || event.status === 'resolved'} onClick={() => handleReclaimReturnEvent(event)} size="xs" type="button" variant="outline">
                          再請求
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <div className="rounded border border-green-100 bg-green-50 p-2">
                          <p className="text-[11px] font-bold text-green-900">追加 {comparison.added.length}</p>
                          {comparison.added.slice(0, 4).map((item) => (
                            <p className="mt-1 truncate text-[11px] text-green-950" key={payloadLineKey(item)}>{payloadText(item, 'label')}</p>
                          ))}
                        </div>
                        <div className="rounded border border-red-100 bg-red-50 p-2">
                          <p className="text-[11px] font-bold text-red-900">削除 {comparison.removed.length}</p>
                          {comparison.removed.slice(0, 4).map((item) => (
                            <p className="mt-1 truncate text-[11px] text-red-950" key={payloadLineKey(item)}>{payloadText(item, 'label')}</p>
                          ))}
                        </div>
                        <div className="rounded border border-yellow-100 bg-yellow-50 p-2">
                          <p className="text-[11px] font-bold text-yellow-1100">変更 {comparison.changed.length}</p>
                          {comparison.changed.slice(0, 4).map(({ item, diffs }) => (
                            <p className="mt-1 text-[11px] leading-normal text-yellow-1100" key={payloadLineKey(item)}>
                              {payloadText(item, 'label')} · {diffs.map((diff) => diff.field).join(', ')}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-8 border border-solid-gray-200 bg-surface-subtle p-3 text-[12px] font-bold text-text-tertiary">
                    この請求ドラフトに紐づく未対応の返戻・査定はありません。
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">送信履歴の詳細比較</p>
                {transmissionComparisons.length > 0 ? (
                  transmissionComparisons.map(({ transmission, previous, comparison }) => (
                    <div className="rounded-8 border border-border bg-card p-3" key={transmission.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-bold text-text-primary">
                            {transmission.sentAt} / {transmissionLabels[transmission.status]}
                          </p>
                          <p className="mt-1 text-[11px] text-text-tertiary">
                            {getTransmissionSummaryText(transmission.requestPayload)}
                          </p>
                          {previous ? (
                            <p className="mt-1 text-[11px] text-text-tertiary">
                              比較元: {previous.sentAt} / {transmissionLabels[previous.status]}
                            </p>
                          ) : null}
                        </div>
                        {transmission.errorMessage ? (
                          <span className="rounded border border-red-100 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-1000">
                            {transmission.errorMessage}
                          </span>
                        ) : null}
                      </div>
                      {comparison ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="rounded border border-green-100 bg-green-50 p-2 text-[11px] font-bold text-green-900">
                            追加 {comparison.added.length}
                          </div>
                          <div className="rounded border border-red-100 bg-red-50 p-2 text-[11px] font-bold text-red-900">
                            削除 {comparison.removed.length}
                          </div>
                          <div className="rounded border border-yellow-100 bg-yellow-50 p-2 text-[11px] font-bold text-yellow-1100">
                            変更 {comparison.changed.length}
                          </div>
                          {comparison.changed.slice(0, 5).map(({ item, diffs }) => (
                            <div className="rounded border border-solid-gray-200 bg-white p-2 sm:col-span-3" key={payloadLineKey(item)}>
                              <p className="text-[12px] font-bold text-text-primary">{payloadText(item, 'label')}</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {diffs.map((diff) => (
                                  <span className="rounded bg-solid-gray-50 px-2 py-1 text-[11px] text-text-secondary" key={`${payloadLineKey(item)}-${diff.field}`}>
                                    {diff.field}: {String(diff.before || '-')} → {String(diff.after || '-')}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[12px] text-text-tertiary">比較元の送信履歴はありません。</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-8 border border-solid-gray-200 bg-surface-subtle p-3 text-[12px] font-bold text-text-tertiary">
                    送信履歴はまだありません。
                  </div>
                )}
              </section>

              {previewPayloadSource ? (
                <section className="rounded-8 border border-blue-100 bg-blue-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-blue-950">
                      {orcaPreviewPayload ? '送信前 payload preview' : '最新送信 payload'}
                    </p>
                    <span className="rounded border border-blue-200 bg-white px-2 py-1 text-[11px] font-bold text-blue-900">
                      {claimDraft.transmissions[0]?.status ?? 'preview'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-blue-900">
                    summary: {String(previewSummary?.line_count ?? 0)}明細 / 送信可能 {String(previewSummary?.sendable_count ?? 0)} / 停止 {String(previewSummary?.unresolved_count ?? 0)}
                  </p>
                  {previewDryRun ? (
                    <p className={cn('mt-1 text-[11px] font-bold', previewDryRun.blocking ? 'text-red-900' : 'text-green-900')}>
                      dry-run: {previewDryRun.blocking ? '送信停止' : '送信可能'} / mapping {String(previewDryRun.mapping_count ?? 0)}件 / 明細 {String(previewDryRun.line_count ?? 0)}件 / checked by {String(previewDryRun.checked_by ?? '-')}
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    <div className="rounded-8 border border-green-100 bg-white p-2">
                      <p className="text-[11px] font-bold text-green-900">送れる明細: {latestSendableItems.length}</p>
                      <div className="mt-2 space-y-1">
                        {latestSendableItems.slice(0, 8).map((item) => (
                          <p className="rounded bg-green-50 px-2 py-1 text-[11px] leading-normal text-green-950" key={`${payloadText(item, 'line_id')}-${payloadText(item, 'receipt_code')}`}>
                            {payloadText(item, 'receipt_code')} {payloadText(item, 'label')}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-8 border border-red-100 bg-white p-2">
                      <p className="text-[11px] font-bold text-red-900">止まっている明細: {latestUnresolvedItems.length}</p>
                      <div className="mt-2 space-y-1">
                        {latestUnresolvedItems.slice(0, 8).map((item) => (
                          <p className="rounded bg-red-50 px-2 py-1 text-[11px] leading-normal text-red-950" key={`${payloadText(item, 'line_id')}-${payloadText(item, 'label')}`}>
                            {payloadText(item, 'unresolved_reason')} · {payloadText(item, 'label')}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          ) : !isLoadingDetail ? (
            <div className="rounded-8 border border-solid-gray-200 bg-white p-6 text-[13px] text-text-secondary">
              請求ドラフトを選択してください。
            </div>
          ) : null}
        </div>
      </Drawer>
      <ConfirmModal
        cancelText="やめる"
        confirmText="締め取消"
        isOpen={cancelCloseConfirmOpen}
        message={[
          `${closeMonth} の確定済み月次締めを取り消します。`,
          '取消者・取消理由は監査記録に残ります。よろしいですか？',
        ]}
        onCancel={() => setCancelCloseConfirmOpen(false)}
        onConfirm={() => {
          setCancelCloseConfirmOpen(false);
          void handleCancelMonthClose();
        }}
        title="月次締めを取り消しますか？"
        variant="destructive"
      />
    </main>
  );
};
