import type {
  AlertColor,
  AlertItem,
  DetailItem,
  LabProgress,
  PatientRecord,
  ReceptionStatus,
} from '../data/chartMock';
import { readStorage } from './storage';
import type {
  AdminUserSummary,
  AuditLogEntry,
  ClaimDraft,
  ClaimLineAdjustment,
  FacilityClaimRule,
  OrcaAdapterSetting,
  OrcaConnectionTestResult,
  ChartOrderConfig,
  ChartTemplate,
  ChartHistoryEntry,
  ChartVersion,
  ChartWorkspaceData,
  DiagnosisSearchResult,
  DrugCategory,
  ImagingOrderEntry,
  InpatientAdmission,
  InpatientAiSummaryReview,
  InpatientBed,
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
  LabLongTrendItem,
  LabResultEntry,
  PatientProfileEntry,
  NursingNote,
  PrescriptionCopyPreview,
  PrescriptionCopyResult,
  PrescriptionHistoryGroup,
  PrescriptionTimelineGroup,
  PrescriptionSetMaster,
  ProblemListItem,
  ProcedureOrderEntry,
  ScheduledVisit,
  StandardUsageMaster,
  UserSession,
  VisitHistoryEntry,
  VitalEntry,
} from '../types/workflow';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';
const sessionStorageKey = 'manta-session';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type ApiUserSession = {
  user_id: string;
  display_name: string;
  department: string;
  role: '医師' | '管理者';
  logged_in_at: string;
  password_expires_at: string;
};

type ApiLoginResponse = {
  access_token: string;
  token_type: string;
  user: ApiUserSession;
};

type ApiAdminUser = {
  user_id: string;
  display_name: string;
  department: string;
  role: '医師' | '管理者';
  password_expires_at: string;
};

type ApiPatient = {
  id: string;
  name: string;
  kana: string;
  age: string;
  sex: '女性' | '男性';
  department: string;
  doctor: string;
  reception_number: string;
  reservation_time: string;
  reception_time: string;
  status: ReceptionStatus;
  elapsed: string;
  lab_progress: LabProgress;
  same_name_duplicate_count: number;
  comment: string;
  demographics: DetailItem[];
  alerts: AlertItem[];
};

type ApiChartNote = {
  version: number;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  saved_by: string;
  saved_at: string;
};

type ApiPrescription = {
  type: string;
  days: string;
  drug_name: string;
  dosage: string;
  created_at: string;
  warnings?: string[];
  warning_details?: Array<{
    message: string;
    source?: string | null;
    severity?: string | null;
    evidence?: string | null;
  }>;
};

type ApiPrescriptionTimelineItem = ApiPrescription & {
  is_current: boolean;
  catalog_id: string | null;
  pmda_info_url: string | null;
  warnings: string[];
};

type ApiPrescriptionTimelineGroup = {
  date: string;
  label: string;
  is_latest: boolean;
  is_today: boolean;
  copyable: boolean;
  item_count: number;
  warning_count: number;
  items: ApiPrescriptionTimelineItem[];
};

type ApiPrescriptionCopyResult = {
  source_date: string;
  copied_count: number;
  skipped_count: number;
  copied_items: ApiPrescription[];
  skipped_items: Array<{ drug_name: string; reason: string }>;
  timeline: ApiPrescriptionTimelineGroup[];
};

type ApiPrescriptionCopyPreview = {
  source_date: string;
  planned_count: number;
  skipped_count: number;
  planned_items: ApiPrescriptionTimelineItem[];
  skipped_items: Array<{ drug_name: string; reason: string }>;
  diff_items: Array<{
    drug_name: string;
    status: 'continued' | 'changed' | 'to_copy' | 'skipped' | 'added';
    label: string;
    source_dosage: string | null;
    current_dosage: string | null;
    reason: string | null;
  }>;
};

type ApiLabOrder = {
  category: string;
  status: 'done' | 'pending';
  urgency: '通常' | '至急' | null;
  items: string[];
  created_at: string;
};

type ApiLabLongTrendItem = {
  item: string;
  code: string | null;
  display: string | null;
  baseline: string | null;
  latest_value: string | null;
  previous_value: string | null;
  latest_date: string | null;
  delta: number | null;
  delta_label: string;
  abnormal_count: number;
  point_count: number;
  points: Array<{
    date: string;
    value: string;
    numeric_value: number | null;
    unit: string | null;
    flag: 'high' | 'normal';
    observation_id: string;
  }>;
};

type ApiReservation = {
  slot_id: string | null;
  scheduled_for: string;
  department: string;
  doctor: string;
  note: string;
  updated_at: string;
};

type ApiAuditLog = {
  actor: string;
  action: string;
  scope: AuditLogEntry['scope'];
  detail: string;
  patient_id: string | null;
  patient_name: string | null;
  created_at: string;
};

type ApiChartWorkspace = {
  patient: ApiPatient;
  latest_note: ApiChartNote | null;
  versions: ApiChartNote[];
  patient_profile: Array<{ label: string; value: string }>;
  problems: Array<{
    name: string;
    since: string;
    status: 'active' | 'resolved';
    management_number?: string;
    icd10_code?: string;
    diagnosis_type?: 'principal' | 'secondary';
  }>;
  visit_history: Array<{ date: string; department: string; summary: string; active?: boolean }>;
  vitals: Array<{ label: string; value: string; unit: string }>;
  lab_results: Array<{
    item: string;
    result: string;
    baseline: string;
    previous: string;
    flag: 'high' | 'normal';
    reported_at?: string | null;
    history?: Array<{
      date: string;
      value: string;
      flag: 'high' | 'normal';
    }>;
  }>;
  chart_history: Array<{ date: string; department: string; title: string; summary: string }>;
  imaging_orders: Array<{
    category: string;
    status: 'scheduled' | 'draft';
    scheduled_at: string;
    note: string;
  }>;
  procedure_orders: Array<{
    title: string;
    status: 'planned' | 'done';
    note: string;
  }>;
  prescriptions: ApiPrescription[];
  prescription_history: Array<{
    date: string;
    label: string;
    is_latest: boolean;
    item_count: number;
    items: ApiPrescription[];
  }>;
  lab_orders: ApiLabOrder[];
  reservation: ApiReservation | null;
  audit_logs: ApiAuditLog[];
};

type ApiChartOrderConfig = {
  prescription_catalog: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    drug_name: string;
    category: DrugCategory;
    dosage_options: string[];
    generic_name: string | null;
    name_kana: string | null;
    aliases: string[];
    yj_code: string | null;
    hot_code: string | null;
    dosage_form: string | null;
    strength: string | null;
    standard_usage_code: string | null;
    default_days: string | null;
    pmda_info_url: string | null;
    allergy_conflict_label: string | null;
    related_problem: string | null;
    manufacturer: string | null;
    drug_price: number | string | null;
    generic_reimbursement_flag: string | null;
    brand_flag: string | null;
    has_generic: boolean | null;
    transitional_expiry: string | null;
    source_note: string | null;
  }>;
  standard_usage_masters: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    label: string;
    category: DrugCategory;
    instruction: string;
    default_days: string;
    note: string | null;
  }>;
  prescription_sets: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    label: string;
    department: string;
    related_problem: string | null;
    note: string | null;
    items: Array<{
      drug_id: string;
      dosage: string;
      days: string;
      note: string | null;
    }>;
    included_set_ids: string[];
  }>;
  lab_set_options: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    label: string;
    items: string[];
    included_set_ids: string[];
  }>;
  reservation_slots: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    date: string;
    time: string;
    department: string;
    doctor: string;
    state: 'available' | 'few' | 'full';
    capacity: number;
    booked_count: number;
    remaining_count: number;
  }>;
  chart_templates: Array<{
    id: string;
    sort_order: number;
    is_active: boolean;
    label: string;
    department: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  }>;
};

type ApiInpatientAdmission = {
  id: number;
  patient: ApiPatient;
  status: 'planned' | 'active' | 'discharge_permitted' | 'discharged' | 'cancelled';
  requested_at: string;
  admitted_at: string | null;
  discharge_permitted_at: string | null;
  discharged_at: string | null;
  ward: {
    id: string;
    name: string;
    floor: string;
    department: string;
  } | null;
  bed: {
    id: string;
    bed_label: string;
    room_number: string;
    bed_number: string;
    status: 'available' | 'occupied' | 'cleaning' | 'blocked';
  } | null;
  attending_doctor: string;
  team: string | null;
  primary_diagnosis: string | null;
  care_level: string | null;
  note: string | null;
  stay_days: number;
  pending_instruction_count: number;
  latest_nursing_note: {
    focus: string | null;
    assessment: string;
    recorded_at: string;
  } | null;
  updated_at: string;
};

type ApiInpatientInstruction = {
  id: number;
  admission_id: number;
  category: string;
  title: string;
  status: 'pending' | 'done' | 'cancelled';
  due_at: string | null;
  created_by: string;
  created_at: string;
};

type ApiInpatientBed = {
  bed: {
    id: string;
    ward_id: string;
    room_number: string;
    bed_number: string;
    bed_label: string;
    status: 'available' | 'occupied' | 'cleaning' | 'blocked';
    note: string | null;
  };
  ward: {
    id: string;
    name: string;
    floor: string;
    department: string;
  };
  current_admission_id: number | null;
  current_patient: ApiPatient | null;
  stay_days: number | null;
};

type ApiNursingNote = {
  id: number;
  admission_id: number;
  note_type: string;
  focus: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  recorded_by: string;
  recorded_at: string;
};

type ApiInpatientDocument = {
  id: number;
  admission_id: number;
  document_type: InpatientDocumentType;
  title: string;
  status: 'draft' | 'signed' | 'archived';
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type ApiInpatientProgress = {
  admission_id: number;
  patient_id: string;
  rows: Array<{
    date: string;
    vitals: string[];
    labs: string[];
    prescriptions: string[];
    lab_orders: string[];
    instructions: string[];
    nursing_notes: string[];
  }>;
};

type ApiInpatientSummaryDraft = {
  admission_id: number;
  patient_id: string;
  title: string;
  period_label: string;
  source_counts: {
    nursing_notes: number;
    observations: number;
    prescriptions: number;
    lab_orders: number;
    instructions: number;
  };
  key_events: string[];
  body: string;
  generated_at: string;
};

type ApiInpatientEvent = {
  id: number;
  admission_id: number;
  event_type: string;
  title: string;
  detail: string | null;
  actor: string;
  occurred_at: string;
};

type ApiInpatientPathwayTask = {
  id: number;
  pathway_assignment_id: number;
  day_offset: number;
  category: string;
  title: string;
  role: string | null;
  due_on: string | null;
  due_time: string | null;
  status: 'pending' | 'done' | 'variance' | 'skipped';
  variance_note: string | null;
  updated_by: string | null;
  updated_at: string;
};

type ApiInpatientPathway = {
  id: number;
  admission_id: number;
  pathway_master_id: string | null;
  pathway_name: string;
  status: string;
  started_on: string;
  assigned_by: string;
  created_at: string;
  updated_at: string;
  tasks: ApiInpatientPathwayTask[];
};

type ApiInpatientPathwayTaskMaster = {
  id: string;
  pathway_master_id: string;
  sort_order: number;
  day_offset: number;
  category: string;
  title: string;
  role: string | null;
  due_time: string | null;
};

type ApiInpatientPathwayMaster = {
  id: string;
  sort_order: number;
  is_active: boolean;
  name: string;
  department: string;
  primary_diagnosis: string | null;
  expected_days: number;
  note: string | null;
  tasks: ApiInpatientPathwayTaskMaster[];
};

type ApiInpatientAiSummaryReview = {
  id: number;
  admission_id: number;
  summary_title: string;
  summary_body: string;
  status: 'accepted' | 'rejected';
  source_counts: ApiInpatientSummaryDraft['source_counts'];
  reviewed_by: string;
  review_note: string | null;
  created_at: string;
};

type ApiInpatientDischargePlan = {
  id: number;
  admission_id: number;
  status: 'draft' | 'reviewed' | 'ready';
  discharge_medication_note: string;
  billing_candidates: Array<{
    id?: string;
    category: string;
    label: string;
    source: string;
    evidence?: string;
    status?: string;
    confidence?: string;
    receipt_code?: string;
    receipt_name?: string;
    receipt_points?: string;
    receipt_unit?: string;
  }>;
  follow_up_note: string;
  reviewed_by: string;
  reviewed_at: string;
  updated_at: string;
};

type ApiClaimReviewIssue = {
  id: number;
  claim_draft_id: number;
  issue_type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence: string | null;
  status: 'open' | 'resolved' | 'ignored';
  created_at: string;
};

type ApiClaimDraftLine = {
  id: number;
  claim_draft_id: number;
  line_type: string;
  source_type: string;
  source_id: string | null;
  label: string;
  receipt_code: string | null;
  receipt_name: string | null;
  points: number;
  quantity: number;
  unit: string | null;
  evidence: string | null;
  review_status: string;
  created_at: string;
};

type ApiClaimLineAdjustment = {
  id: number;
  claim_draft_id: number;
  claim_draft_line_id: number | null;
  rule_id: string | null;
  adjustment_type: string;
  points_delta: number;
  comment: string | null;
  comment_code: string | null;
  comment_pattern: string | null;
  reason: string;
  status: 'suggested' | 'accepted' | 'ignored';
  created_at: string;
};

type ApiClaimDraft = {
  id: number;
  patient_id: string;
  admission_id: number | null;
  status: 'draft' | 'reviewed' | 'ready' | 'submitted' | 'error';
  source_type: string;
  billing_candidates: ApiInpatientDischargePlan['billing_candidates'];
  total_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  lines: ApiClaimDraftLine[];
  adjustments: ApiClaimLineAdjustment[];
  issues: ApiClaimReviewIssue[];
  transmissions: ApiClaimTransmission[];
};

type ApiClaimTransmission = {
  id: number;
  claim_draft_id: number;
  adapter: string;
  status: 'accepted' | 'rejected' | 'error';
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  sent_by: string;
  sent_at: string;
  created_at: string;
};

type ApiFacilityClaimRule = {
  id: string;
  sort_order: number;
  is_active: boolean;
  category: string;
  target_category: string;
  rule_type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence_hint: string | null;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  updated_at: string;
};

type ApiOrcaAdapterSetting = {
  id: string;
  is_active: boolean;
  base_url: string | null;
  auth_type: 'none' | 'basic' | 'client';
  username: string | null;
  has_password: boolean;
  client_id: string | null;
  claim_endpoint: string;
  health_endpoint: string;
  mode: 'mock' | 'http';
  note: string | null;
  updated_by: string | null;
  updated_at: string;
};

type ApiOrcaConnectionTest = {
  ok: boolean;
  status_code: number | null;
  url: string | null;
  message: string;
  response_payload: Record<string, unknown>;
};

type ApiDiagnosisSearchResult = {
  management_number: string;
  disease_name: string;
  disease_name_kana: string;
  adoption_level: string;
  exchange_code: string | null;
  icd10_code: string | null;
  icd10_subcode: string | null;
  claim_code: string | null;
  is_deleted: boolean;
  updated_at_master: string | null;
  matched_alias: string | null;
  migration_source_management_number: string | null;
  migration_source_name: string | null;
};

const formatTimestamp = (value: string) =>
  new Date(value).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const getAccessToken = () => readStorage<UserSession | null>(sessionStorageKey, null)?.accessToken;

const mapSession = (session: ApiUserSession, accessToken: string): UserSession => ({
  userId: session.user_id,
  displayName: session.display_name,
  department: session.department,
  role: session.role,
  loggedInAt: formatTimestamp(session.logged_in_at),
  accessToken,
  passwordExpiresAt: session.password_expires_at,
});

const request = async <T>(
  path: string,
  init?: RequestInit,
  options?: { requiresAuth?: boolean; accessToken?: string },
): Promise<T> => {
  const requiresAuth = options?.requiresAuth ?? true;
  const token = requiresAuth ? (options?.accessToken ?? getAccessToken()) : null;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let detail = '';

    try {
      detail = (JSON.parse(errorText) as { detail?: string }).detail ?? '';
    } catch {
      detail = '';
    }

    throw new ApiError(response.status, detail || errorText || `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

export const isUnauthorizedError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 401;

export const isForbiddenError = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.status === 403;

const mapPatient = (patient: ApiPatient): PatientRecord => ({
  id: patient.id,
  name: patient.name,
  kana: patient.kana,
  age: patient.age,
  sex: patient.sex,
  department: patient.department,
  doctor: patient.doctor,
  receptionNumber: patient.reception_number,
  reservationTime: patient.reservation_time,
  receptionTime: patient.reception_time,
  status: patient.status,
  elapsed: patient.elapsed,
  labProgress: patient.lab_progress,
  sameNameDuplicateCount: patient.same_name_duplicate_count,
  comment: patient.comment,
  demographics: patient.demographics,
  alerts: patient.alerts.map((alert) => ({
    ...alert,
    color: alert.color as AlertColor,
  })),
});

const mapChartVersion = (note: ApiChartNote): ChartVersion => ({
  version: note.version,
  subjective: note.subjective,
  objective: note.objective,
  assessment: note.assessment,
  plan: note.plan,
  savedBy: note.saved_by,
  savedAt: formatTimestamp(note.saved_at),
});

const mapPrescription = (item: ApiPrescription): ChartWorkspaceData['prescriptions'][number] => ({
  type: item.type,
  days: item.days,
  drugName: item.drug_name,
  dosage: item.dosage,
  createdAt: formatTimestamp(item.created_at),
  warnings: item.warnings ?? [],
  warningDetails: (item.warning_details ?? []).map((detail) => ({
    message: detail.message,
    source: detail.source ?? undefined,
    severity: detail.severity ?? undefined,
    evidence: detail.evidence ?? undefined,
  })),
});

const mapPrescriptionHistory = (
  items: ApiChartWorkspace['prescription_history'],
): PrescriptionHistoryGroup[] =>
  items.map((item) => ({
    date: item.date,
    label: item.label,
    isLatest: item.is_latest,
    itemCount: item.item_count,
    items: item.items.map(mapPrescription),
  }));

const mapPrescriptionTimeline = (items: ApiPrescriptionTimelineGroup[]): PrescriptionTimelineGroup[] =>
  items.map((item) => ({
    date: item.date,
    label: item.label,
    isLatest: item.is_latest,
    isToday: item.is_today,
    copyable: item.copyable,
    itemCount: item.item_count,
    warningCount: item.warning_count,
    items: item.items.map((entry) => ({
      ...mapPrescription(entry),
      isCurrent: entry.is_current,
      catalogId: entry.catalog_id ?? undefined,
      pmdaInfoUrl: entry.pmda_info_url ?? undefined,
      warnings: entry.warnings,
    })),
  }));

const mapLabOrder = (item: ApiLabOrder): ChartWorkspaceData['labOrders'][number] => ({
  category: item.category,
  status: item.status,
  urgency: item.urgency ?? undefined,
  items: item.items,
  createdAt: formatTimestamp(item.created_at),
});

const mapLabLongTrends = (items: ApiLabLongTrendItem[]): LabLongTrendItem[] =>
  items.map((item) => ({
    item: item.item,
    code: item.code ?? undefined,
    display: item.display ?? undefined,
    baseline: item.baseline ?? undefined,
    latestValue: item.latest_value ?? undefined,
    previousValue: item.previous_value ?? undefined,
    latestDate: item.latest_date ?? undefined,
    delta: item.delta ?? undefined,
    deltaLabel: item.delta_label,
    abnormalCount: item.abnormal_count,
    pointCount: item.point_count,
    points: item.points.map((point) => ({
      date: point.date,
      value: point.value,
      numericValue: point.numeric_value ?? undefined,
      unit: point.unit ?? undefined,
      flag: point.flag,
      observationId: point.observation_id,
    })),
  }));

const mapReservation = (item: ApiReservation | null): ScheduledVisit | null =>
  item
    ? {
        slotId: item.slot_id ?? undefined,
        date: item.scheduled_for,
        department: `${item.department} - ${item.doctor}`,
        doctor: item.doctor,
        note: item.note,
      }
    : null;

const mapAuditLog = (item: ApiAuditLog): AuditLogEntry => ({
  id: `${item.created_at}-${item.action}-${item.actor}`,
  timestamp: formatTimestamp(item.created_at),
  actor: item.actor,
  action: item.action,
  scope: item.scope,
  detail: item.detail,
  patientId: item.patient_id ?? undefined,
  patientName: item.patient_name ?? undefined,
});

const mapPatientProfile = (items: Array<{ label: string; value: string }>): PatientProfileEntry[] =>
  items.map((item) => ({
    label: item.label,
    value: item.value,
  }));

const mapProblems = (
  items: Array<{
    name: string;
    since: string;
    status: 'active' | 'resolved';
    management_number?: string;
    icd10_code?: string;
    diagnosis_type?: 'principal' | 'secondary';
  }>,
): ProblemListItem[] =>
  items.map((item) => ({
    name: item.name,
    since: item.since,
    status: item.status,
    managementNumber: item.management_number ?? undefined,
    icd10Code: item.icd10_code ?? undefined,
    diagnosisType: item.diagnosis_type ?? undefined,
  }));

const mapVisitHistory = (
  items: Array<{ date: string; department: string; summary: string; active?: boolean }>,
): VisitHistoryEntry[] =>
  items.map((item) => ({
    date: item.date,
    department: item.department,
    summary: item.summary,
    active: item.active ?? false,
  }));

const mapVitals = (items: Array<{ label: string; value: string; unit: string }>): VitalEntry[] =>
  items.map((item) => ({
    label: item.label,
    value: item.value,
    unit: item.unit,
  }));

const mapLabResults = (
  items: Array<{
    item: string;
    result: string;
    baseline: string;
    previous: string;
    flag: 'high' | 'normal';
    reported_at?: string | null;
    history?: Array<{
      date: string;
      value: string;
      flag: 'high' | 'normal';
    }>;
  }>,
): LabResultEntry[] =>
  items.map((item) => ({
    item: item.item,
    result: item.result,
    baseline: item.baseline,
    previous: item.previous,
    flag: item.flag,
    reportedAt: item.reported_at ?? undefined,
    history: (item.history ?? []).map((point) => ({
      date: point.date,
      value: point.value,
      flag: point.flag,
    })),
  }));

const mapChartHistory = (
  items: Array<{ date: string; department: string; title: string; summary: string }>,
): ChartHistoryEntry[] =>
  items.map((item) => ({
    date: item.date,
    department: item.department,
    title: item.title,
    summary: item.summary,
  }));

const mapImagingOrders = (
  items: Array<{ category: string; status: 'scheduled' | 'draft'; scheduled_at: string; note: string }>,
): ImagingOrderEntry[] =>
  items.map((item) => ({
    category: item.category,
    status: item.status,
    scheduledAt: item.scheduled_at,
    note: item.note,
  }));

const mapProcedureOrders = (
  items: Array<{ title: string; status: 'planned' | 'done'; note: string }>,
): ProcedureOrderEntry[] =>
  items.map((item) => ({
    title: item.title,
    status: item.status,
    note: item.note,
  }));

const mapPrescriptionCatalog = (
  items: ApiChartOrderConfig['prescription_catalog'],
): ChartOrderConfig['prescriptionCatalog'] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    drugName: item.drug_name,
    category: item.category,
    dosageOptions: item.dosage_options,
    genericName: item.generic_name ?? undefined,
    nameKana: item.name_kana ?? undefined,
    aliases: item.aliases ?? [],
    yjCode: item.yj_code ?? undefined,
    hotCode: item.hot_code ?? undefined,
    dosageForm: item.dosage_form ?? undefined,
    strength: item.strength ?? undefined,
    standardUsageCode: item.standard_usage_code ?? undefined,
    defaultDays: item.default_days ?? undefined,
    pmdaInfoUrl: item.pmda_info_url ?? undefined,
    allergyConflictLabel: item.allergy_conflict_label ?? undefined,
    relatedProblem: item.related_problem ?? undefined,
    manufacturer: item.manufacturer ?? undefined,
    drugPrice: item.drug_price ?? undefined,
    genericReimbursementFlag: item.generic_reimbursement_flag ?? undefined,
    brandFlag: item.brand_flag ?? undefined,
    hasGeneric: item.has_generic ?? undefined,
    transitionalExpiry: item.transitional_expiry ?? undefined,
    sourceNote: item.source_note ?? undefined,
  }));

const mapStandardUsageMasters = (
  items: ApiChartOrderConfig['standard_usage_masters'],
): StandardUsageMaster[] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    label: item.label,
    category: item.category,
    instruction: item.instruction,
    defaultDays: item.default_days,
    note: item.note ?? undefined,
  }));

const mapPrescriptionSets = (items: ApiChartOrderConfig['prescription_sets']): PrescriptionSetMaster[] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    label: item.label,
    department: item.department,
    relatedProblem: item.related_problem ?? undefined,
    note: item.note ?? undefined,
    items: item.items.map((setItem) => ({
      drugId: setItem.drug_id,
      dosage: setItem.dosage,
      days: setItem.days,
      note: setItem.note ?? undefined,
    })),
    includedSetIds: item.included_set_ids ?? [],
  }));

const mapLabSetOptions = (items: ApiChartOrderConfig['lab_set_options']): ChartOrderConfig['labSetOptions'] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    label: item.label,
    items: item.items,
    includedSetIds: item.included_set_ids ?? [],
  }));

const mapReservationSlots = (
  items: ApiChartOrderConfig['reservation_slots'],
): ChartOrderConfig['reservationSlots'] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    date: item.date,
    time: item.time,
    department: item.department,
    doctor: item.doctor,
    state: item.state,
    capacity: item.capacity,
    bookedCount: item.booked_count,
    remainingCount: item.remaining_count,
  }));

const mapChartTemplates = (items: ApiChartOrderConfig['chart_templates']): ChartTemplate[] =>
  items.map((item) => ({
    id: item.id,
    sortOrder: item.sort_order,
    isActive: item.is_active,
    label: item.label,
    department: item.department,
    subjective: item.subjective,
    objective: item.objective,
    assessment: item.assessment,
    plan: item.plan,
  }));

const mapAdminUser = (user: ApiAdminUser): AdminUserSummary => ({
  userId: user.user_id,
  displayName: user.display_name,
  department: user.department,
  role: user.role,
  passwordExpiresAt: user.password_expires_at,
});

const mapDiagnosisSearchResult = (item: ApiDiagnosisSearchResult): DiagnosisSearchResult => ({
  managementNumber: item.management_number,
  diseaseName: item.disease_name,
  diseaseNameKana: item.disease_name_kana,
  adoptionLevel: item.adoption_level,
  exchangeCode: item.exchange_code ?? undefined,
  icd10Code: item.icd10_code ?? undefined,
  icd10Subcode: item.icd10_subcode ?? undefined,
  claimCode: item.claim_code ?? undefined,
  isDeleted: item.is_deleted,
  updatedAtMaster: item.updated_at_master ?? undefined,
  matchedAlias: item.matched_alias ?? undefined,
  migrationSourceManagementNumber: item.migration_source_management_number ?? undefined,
  migrationSourceName: item.migration_source_name ?? undefined,
});

const mapInpatientAdmission = (item: ApiInpatientAdmission): InpatientAdmission => ({
  id: item.id,
  patientId: item.patient.id,
  patientName: item.patient.name,
  patientKana: item.patient.kana,
  age: item.patient.age,
  sex: item.patient.sex,
  status: item.status,
  wardId: item.ward?.id,
  wardName: item.ward?.name,
  floor: item.ward?.floor,
  bedId: item.bed?.id,
  bedLabel: item.bed?.bed_label,
  attendingDoctor: item.attending_doctor,
  team: item.team ?? undefined,
  primaryDiagnosis: item.primary_diagnosis ?? undefined,
  careLevel: item.care_level ?? undefined,
  note: item.note ?? undefined,
  stayDays: item.stay_days,
  pendingInstructionCount: item.pending_instruction_count,
  latestNursingFocus: item.latest_nursing_note?.focus ?? undefined,
  latestNursingAssessment: item.latest_nursing_note?.assessment ?? undefined,
  admittedAt: item.admitted_at ? formatTimestamp(item.admitted_at) : undefined,
});

const mapInpatientInstruction = (item: ApiInpatientInstruction): InpatientInstruction => ({
  id: item.id,
  admissionId: item.admission_id,
  category: item.category,
  title: item.title,
  status: item.status,
  dueAt: item.due_at ? formatTimestamp(item.due_at) : undefined,
  createdBy: item.created_by,
  createdAt: formatTimestamp(item.created_at),
});

const mapInpatientBed = (item: ApiInpatientBed): InpatientBed => ({
  id: item.bed.id,
  wardId: item.ward.id,
  wardName: item.ward.name,
  floor: item.ward.floor,
  roomNumber: item.bed.room_number,
  bedNumber: item.bed.bed_number,
  bedLabel: item.bed.bed_label,
  status: item.bed.status,
  note: item.bed.note ?? undefined,
  currentAdmissionId: item.current_admission_id ?? undefined,
  currentPatientId: item.current_patient?.id,
  currentPatientName: item.current_patient?.name,
  stayDays: item.stay_days ?? undefined,
});

const mapNursingNote = (item: ApiNursingNote): NursingNote => ({
  id: item.id,
  admissionId: item.admission_id,
  noteType: item.note_type,
  focus: item.focus ?? undefined,
  subjective: item.subjective,
  objective: item.objective,
  assessment: item.assessment,
  plan: item.plan,
  recordedBy: item.recorded_by,
  recordedAt: formatTimestamp(item.recorded_at),
});

const mapInpatientDocument = (item: ApiInpatientDocument): InpatientDocument => ({
  id: item.id,
  admissionId: item.admission_id,
  documentType: item.document_type,
  title: item.title,
  status: item.status,
  body: item.body,
  createdBy: item.created_by,
  createdAt: formatTimestamp(item.created_at),
  updatedAt: formatTimestamp(item.updated_at),
});

const mapInpatientProgress = (item: ApiInpatientProgress): InpatientProgress => ({
  admissionId: item.admission_id,
  patientId: item.patient_id,
  rows: item.rows.map((row) => ({
    date: row.date,
    vitals: row.vitals,
    labs: row.labs,
    prescriptions: row.prescriptions,
    labOrders: row.lab_orders,
    instructions: row.instructions,
    nursingNotes: row.nursing_notes,
  })),
});

const mapInpatientSummaryDraft = (item: ApiInpatientSummaryDraft): InpatientSummaryDraft => ({
  admissionId: item.admission_id,
  patientId: item.patient_id,
  title: item.title,
  periodLabel: item.period_label,
  sourceCounts: {
    nursingNotes: item.source_counts.nursing_notes,
    observations: item.source_counts.observations,
    prescriptions: item.source_counts.prescriptions,
    labOrders: item.source_counts.lab_orders,
    instructions: item.source_counts.instructions,
  },
  keyEvents: item.key_events,
  body: item.body,
  generatedAt: formatTimestamp(item.generated_at),
});

const mapInpatientEvent = (item: ApiInpatientEvent): InpatientEvent => ({
  id: item.id,
  admissionId: item.admission_id,
  eventType: item.event_type,
  title: item.title,
  detail: item.detail ?? undefined,
  actor: item.actor,
  occurredAt: formatTimestamp(item.occurred_at),
});

const mapInpatientPathwayTask = (item: ApiInpatientPathwayTask): InpatientPathwayTask => ({
  id: item.id,
  pathwayAssignmentId: item.pathway_assignment_id,
  dayOffset: item.day_offset,
  category: item.category,
  title: item.title,
  role: item.role ?? undefined,
  dueOn: item.due_on ?? undefined,
  dueTime: item.due_time ?? undefined,
  status: item.status,
  varianceNote: item.variance_note ?? undefined,
  updatedBy: item.updated_by ?? undefined,
  updatedAt: formatTimestamp(item.updated_at),
});

const mapInpatientPathway = (item: ApiInpatientPathway): InpatientPathway => ({
  id: item.id,
  admissionId: item.admission_id,
  pathwayMasterId: item.pathway_master_id ?? undefined,
  pathwayName: item.pathway_name,
  status: item.status,
  startedOn: item.started_on,
  assignedBy: item.assigned_by,
  createdAt: formatTimestamp(item.created_at),
  updatedAt: formatTimestamp(item.updated_at),
  tasks: item.tasks.map(mapInpatientPathwayTask),
});

const mapInpatientPathwayMaster = (item: ApiInpatientPathwayMaster): InpatientPathwayMaster => ({
  id: item.id,
  sortOrder: item.sort_order,
  isActive: item.is_active,
  name: item.name,
  department: item.department,
  primaryDiagnosis: item.primary_diagnosis ?? undefined,
  expectedDays: item.expected_days,
  note: item.note ?? undefined,
  tasks: item.tasks.map((task) => ({
    id: task.id,
    pathwayMasterId: task.pathway_master_id,
    sortOrder: task.sort_order,
    dayOffset: task.day_offset,
    category: task.category,
    title: task.title,
    role: task.role ?? undefined,
    dueTime: task.due_time ?? undefined,
  })),
});

const mapInpatientAiSummaryReview = (item: ApiInpatientAiSummaryReview): InpatientAiSummaryReview => ({
  id: item.id,
  admissionId: item.admission_id,
  summaryTitle: item.summary_title,
  summaryBody: item.summary_body,
  status: item.status,
  sourceCounts: {
    nursingNotes: item.source_counts.nursing_notes,
    observations: item.source_counts.observations,
    prescriptions: item.source_counts.prescriptions,
    labOrders: item.source_counts.lab_orders,
    instructions: item.source_counts.instructions,
  },
  reviewedBy: item.reviewed_by,
  reviewNote: item.review_note ?? undefined,
  createdAt: formatTimestamp(item.created_at),
});

const mapBillingCandidate = (candidate: ApiInpatientDischargePlan['billing_candidates'][number]) => ({
  ...candidate,
  receiptCode: candidate.receipt_code,
  receiptName: candidate.receipt_name,
  receiptPoints: candidate.receipt_points,
  receiptUnit: candidate.receipt_unit,
});

const mapInpatientDischargePlan = (item: ApiInpatientDischargePlan): InpatientDischargePlan => ({
  id: item.id,
  admissionId: item.admission_id,
  status: item.status,
  dischargeMedicationNote: item.discharge_medication_note,
  billingCandidates: item.billing_candidates.map(mapBillingCandidate),
  followUpNote: item.follow_up_note,
  reviewedBy: item.reviewed_by,
  reviewedAt: formatTimestamp(item.reviewed_at),
  updatedAt: formatTimestamp(item.updated_at),
});

const mapClaimTransmission = (item: ApiClaimTransmission) => ({
  id: item.id,
  claimDraftId: item.claim_draft_id,
  adapter: item.adapter,
  status: item.status,
  requestPayload: item.request_payload,
  responsePayload: item.response_payload,
  errorMessage: item.error_message ?? undefined,
  sentBy: item.sent_by,
  sentAt: formatTimestamp(item.sent_at),
  createdAt: formatTimestamp(item.created_at),
});

const mapClaimDraftLine = (item: ApiClaimDraftLine) => ({
  id: item.id,
  claimDraftId: item.claim_draft_id,
  lineType: item.line_type,
  sourceType: item.source_type,
  sourceId: item.source_id ?? undefined,
  label: item.label,
  receiptCode: item.receipt_code ?? undefined,
  receiptName: item.receipt_name ?? undefined,
  points: item.points,
  quantity: item.quantity,
  unit: item.unit ?? undefined,
  evidence: item.evidence ?? undefined,
  reviewStatus: item.review_status,
  createdAt: formatTimestamp(item.created_at),
});

const mapClaimLineAdjustment = (item: ApiClaimLineAdjustment) => ({
  id: item.id,
  claimDraftId: item.claim_draft_id,
  claimDraftLineId: item.claim_draft_line_id ?? undefined,
  ruleId: item.rule_id ?? undefined,
  adjustmentType: item.adjustment_type,
  pointsDelta: item.points_delta,
  comment: item.comment ?? undefined,
  commentCode: item.comment_code ?? undefined,
  commentPattern: item.comment_pattern ?? undefined,
  reason: item.reason,
  status: item.status,
  createdAt: formatTimestamp(item.created_at),
});

const mapClaimDraft = (item: ApiClaimDraft): ClaimDraft => ({
  id: item.id,
  patientId: item.patient_id,
  admissionId: item.admission_id ?? undefined,
  status: item.status,
  sourceType: item.source_type,
  billingCandidates: item.billing_candidates.map(mapBillingCandidate),
  totalPoints: item.total_points,
  createdBy: item.created_by,
  createdAt: formatTimestamp(item.created_at),
  updatedAt: formatTimestamp(item.updated_at),
  lines: item.lines.map(mapClaimDraftLine),
  adjustments: item.adjustments.map(mapClaimLineAdjustment),
  issues: item.issues.map((issue) => ({
    id: issue.id,
    claimDraftId: issue.claim_draft_id,
    issueType: issue.issue_type,
    severity: issue.severity,
    message: issue.message,
    evidence: issue.evidence ?? undefined,
    status: issue.status,
    createdAt: formatTimestamp(issue.created_at),
  })),
  transmissions: item.transmissions.map(mapClaimTransmission),
});

const mapFacilityClaimRule = (item: ApiFacilityClaimRule): FacilityClaimRule => ({
  id: item.id,
  sortOrder: item.sort_order,
  isActive: item.is_active,
  category: item.category,
  targetCategory: item.target_category,
  ruleType: item.rule_type,
  severity: item.severity,
  message: item.message,
  evidenceHint: item.evidence_hint ?? undefined,
  conditions: item.conditions,
  actions: item.actions,
  updatedAt: formatTimestamp(item.updated_at),
});

const mapOrcaAdapterSetting = (item: ApiOrcaAdapterSetting): OrcaAdapterSetting => ({
  id: item.id,
  isActive: item.is_active,
  baseUrl: item.base_url ?? undefined,
  authType: item.auth_type,
  username: item.username ?? undefined,
  hasPassword: item.has_password,
  clientId: item.client_id ?? undefined,
  claimEndpoint: item.claim_endpoint,
  healthEndpoint: item.health_endpoint,
  mode: item.mode,
  note: item.note ?? undefined,
  updatedBy: item.updated_by ?? undefined,
  updatedAt: formatTimestamp(item.updated_at),
});

const mapOrcaConnectionTest = (item: ApiOrcaConnectionTest): OrcaConnectionTestResult => ({
  ok: item.ok,
  statusCode: item.status_code ?? undefined,
  url: item.url ?? undefined,
  message: item.message,
  responsePayload: item.response_payload,
});

export const login = async (userId: string, password: string): Promise<UserSession> => {
  const response = await request<ApiLoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      password,
    }),
  }, { requiresAuth: false });

  return mapSession(response.user, response.access_token);
};

export const getCurrentSession = async (accessToken?: string): Promise<UserSession> => {
  const response = await request<ApiUserSession>('/api/auth/me', undefined, {
    accessToken,
  });

  return mapSession(response, accessToken ?? getAccessToken() ?? '');
};

export const listUsers = async (): Promise<AdminUserSummary[]> => {
  const users = await request<ApiAdminUser[]>('/api/admin/users');
  return users.map(mapAdminUser);
};

export const createUser = async (payload: {
  userId: string;
  password: string;
  displayName: string;
  department: string;
  role: '医師' | '管理者';
  passwordExpiresAt: string;
}): Promise<AdminUserSummary> => {
  const user = await request<ApiAdminUser>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      user_id: payload.userId,
      password: payload.password,
      display_name: payload.displayName,
      department: payload.department,
      role: payload.role,
      password_expires_at: payload.passwordExpiresAt,
    }),
  });

  return mapAdminUser(user);
};

export const updateUser = async (
  userId: string,
  payload: {
    displayName: string;
    department: string;
    role: '医師' | '管理者';
    passwordExpiresAt: string;
  },
): Promise<AdminUserSummary> => {
  const user = await request<ApiAdminUser>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      display_name: payload.displayName,
      department: payload.department,
      role: payload.role,
      password_expires_at: payload.passwordExpiresAt,
    }),
  });

  return mapAdminUser(user);
};

export const resetUserPassword = async (userId: string, password: string): Promise<void> => {
  await request<{ user_id: string; status: string }>(
    `/api/admin/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
  );
};

export const listPatients = async (params: {
  searchQuery?: string;
  statusFilter?: ReceptionStatus | 'all';
  departmentFilter?: string | 'all';
  sortKey?: 'receptionNumber' | 'reservationTime' | 'elapsed';
}): Promise<PatientRecord[]> => {
  const searchParams = new URLSearchParams();

  if (params.searchQuery?.trim()) {
    searchParams.set('search', params.searchQuery.trim());
  }
  if (params.statusFilter && params.statusFilter !== 'all') {
    searchParams.set('status', params.statusFilter);
  }
  if (params.departmentFilter && params.departmentFilter !== 'all') {
    searchParams.set('department', params.departmentFilter);
  }
  if (params.sortKey) {
    searchParams.set('sort', params.sortKey);
  }

  const patients = await request<ApiPatient[]>(
    `/api/patients${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
  );

  return patients.map(mapPatient);
};

export const listInpatientAdmissions = async (params?: {
  status?: 'active' | 'planned' | 'discharge_permitted' | 'discharged' | 'all';
  searchQuery?: string;
}): Promise<InpatientAdmission[]> => {
  const searchParams = new URLSearchParams();
  searchParams.set('status', params?.status ?? 'active');
  if (params?.searchQuery?.trim()) {
    searchParams.set('search', params.searchQuery.trim());
  }

  const admissions = await request<ApiInpatientAdmission[]>(
    `/api/inpatient/admissions?${searchParams.toString()}`,
  );

  return admissions.map(mapInpatientAdmission);
};

export const listInpatientBeds = async (params?: {
  wardId?: string;
  includeInactive?: boolean;
}): Promise<InpatientBed[]> => {
  const searchParams = new URLSearchParams();
  if (params?.wardId) {
    searchParams.set('ward_id', params.wardId);
  }
  if (params?.includeInactive) {
    searchParams.set('include_inactive', 'true');
  }
  const beds = await request<ApiInpatientBed[]>(
    `/api/inpatient/beds${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
  );
  return beds.map(mapInpatientBed);
};

export const updateInpatientBedStatus = async (
  bedId: string,
  status: InpatientBed['status'],
  note?: string,
): Promise<InpatientBed> => {
  const bed = await request<ApiInpatientBed>(
    `/api/inpatient/beds/${encodeURIComponent(bedId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, note: note ?? null }),
    },
  );
  return mapInpatientBed(bed);
};

export const transferInpatientAdmission = async (
  admissionId: number,
  payload: { wardId: string; bedId: string; note?: string },
): Promise<InpatientAdmission> => {
  const admission = await request<ApiInpatientAdmission>(
    `/api/inpatient/admissions/${admissionId}/transfer`,
    {
      method: 'POST',
      body: JSON.stringify({
        ward_id: payload.wardId,
        bed_id: payload.bedId,
        note: payload.note ?? null,
      }),
    },
  );
  return mapInpatientAdmission(admission);
};

export const listInpatientInstructions = async (admissionId: number): Promise<InpatientInstruction[]> => {
  const instructions = await request<ApiInpatientInstruction[]>(
    `/api/inpatient/admissions/${admissionId}/instructions`,
  );
  return instructions.map(mapInpatientInstruction);
};

export const getInpatientProgress = async (admissionId: number): Promise<InpatientProgress> => {
  const progress = await request<ApiInpatientProgress>(
    `/api/inpatient/admissions/${admissionId}/progress`,
  );
  return mapInpatientProgress(progress);
};

export const getInpatientSummaryDraft = async (admissionId: number, days = 14): Promise<InpatientSummaryDraft> => {
  const draft = await request<ApiInpatientSummaryDraft>(
    `/api/inpatient/admissions/${admissionId}/summary-draft?days=${days}`,
  );
  return mapInpatientSummaryDraft(draft);
};

export const listInpatientEvents = async (admissionId: number): Promise<InpatientEvent[]> => {
  const events = await request<ApiInpatientEvent[]>(
    `/api/inpatient/admissions/${admissionId}/events`,
  );
  return events.map(mapInpatientEvent);
};

export const getInpatientPathway = async (admissionId: number): Promise<InpatientPathway | null> => {
  const pathway = await request<ApiInpatientPathway | null>(
    `/api/inpatient/admissions/${admissionId}/pathway`,
  );
  return pathway ? mapInpatientPathway(pathway) : null;
};

export const listInpatientPathwayMasters = async (department?: string): Promise<InpatientPathwayMaster[]> => {
  const searchParams = new URLSearchParams();
  if (department) {
    searchParams.set('department', department);
  }
  const masters = await request<ApiInpatientPathwayMaster[]>(
    `/api/inpatient/pathway-masters${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
  );
  return masters.map(mapInpatientPathwayMaster);
};

export const createInpatientPathway = async (
  admissionId: number,
  payload?: { pathwayName?: string; pathwayMasterId?: string },
): Promise<InpatientPathway> => {
  const pathway = await request<ApiInpatientPathway>(
    `/api/inpatient/admissions/${admissionId}/pathway`,
    {
      method: 'POST',
      body: JSON.stringify({
        pathway_master_id: payload?.pathwayMasterId ?? null,
        pathway_name: payload?.pathwayName ?? '標準入院パス',
      }),
    },
  );
  return mapInpatientPathway(pathway);
};

export const updateInpatientPathwayTask = async (
  taskId: number,
  payload: { status: InpatientPathwayTask['status']; varianceNote?: string },
): Promise<InpatientPathwayTask> => {
  const task = await request<ApiInpatientPathwayTask>(
    `/api/inpatient/pathway-tasks/${taskId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: payload.status,
        variance_note: payload.varianceNote ?? null,
      }),
    },
  );
  return mapInpatientPathwayTask(task);
};

export const updateInpatientInstructionStatus = async (
  instructionId: number,
  status: 'pending' | 'done' | 'cancelled',
): Promise<InpatientInstruction> => {
  const instruction = await request<ApiInpatientInstruction>(
    `/api/inpatient/instructions/${instructionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
  return mapInpatientInstruction(instruction);
};

export const listNursingNotes = async (admissionId: number): Promise<NursingNote[]> => {
  const notes = await request<ApiNursingNote[]>(
    `/api/inpatient/admissions/${admissionId}/nursing-notes`,
  );
  return notes.map(mapNursingNote);
};

export const createNursingNote = async (
  admissionId: number,
  payload: {
    noteType?: string;
    focus?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  },
): Promise<NursingNote> => {
  const note = await request<ApiNursingNote>(
    `/api/inpatient/admissions/${admissionId}/nursing-notes`,
    {
      method: 'POST',
      body: JSON.stringify({
        note_type: payload.noteType ?? 'SOAP',
        focus: payload.focus ?? null,
        subjective: payload.subjective ?? '',
        objective: payload.objective ?? '',
        assessment: payload.assessment ?? '',
        plan: payload.plan ?? '',
      }),
    },
  );
  return mapNursingNote(note);
};

export const listInpatientDocuments = async (admissionId: number): Promise<InpatientDocument[]> => {
  const documents = await request<ApiInpatientDocument[]>(
    `/api/inpatient/admissions/${admissionId}/documents`,
  );
  return documents.map(mapInpatientDocument);
};

export const createInpatientDocument = async (
  admissionId: number,
  payload: {
    documentType: InpatientDocumentType;
    title?: string;
    body?: string;
  },
): Promise<InpatientDocument> => {
  const document = await request<ApiInpatientDocument>(
    `/api/inpatient/admissions/${admissionId}/documents`,
    {
      method: 'POST',
      body: JSON.stringify({
        document_type: payload.documentType,
        title: payload.title ?? null,
        body: payload.body ?? null,
      }),
    },
  );
  return mapInpatientDocument(document);
};

export const updateInpatientDocument = async (
  documentId: number,
  payload: {
    title?: string;
    body?: string;
    status?: InpatientDocument['status'];
  },
): Promise<InpatientDocument> => {
  const document = await request<ApiInpatientDocument>(
    `/api/inpatient/documents/${documentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        title: payload.title ?? null,
        body: payload.body ?? null,
        status: payload.status ?? null,
      }),
    },
  );
  return mapInpatientDocument(document);
};

export const listInpatientSummaryReviews = async (admissionId: number): Promise<InpatientAiSummaryReview[]> => {
  const reviews = await request<ApiInpatientAiSummaryReview[]>(
    `/api/inpatient/admissions/${admissionId}/summary-reviews`,
  );
  return reviews.map(mapInpatientAiSummaryReview);
};

export const createInpatientSummaryReview = async (
  admissionId: number,
  payload: {
    summaryTitle: string;
    summaryBody: string;
    status: InpatientAiSummaryReview['status'];
    sourceCounts: InpatientSummaryDraft['sourceCounts'];
    reviewNote?: string;
  },
): Promise<InpatientAiSummaryReview> => {
  const review = await request<ApiInpatientAiSummaryReview>(
    `/api/inpatient/admissions/${admissionId}/summary-reviews`,
    {
      method: 'POST',
      body: JSON.stringify({
        summary_title: payload.summaryTitle,
        summary_body: payload.summaryBody,
        status: payload.status,
        source_counts: {
          nursing_notes: payload.sourceCounts.nursingNotes,
          observations: payload.sourceCounts.observations,
          prescriptions: payload.sourceCounts.prescriptions,
          lab_orders: payload.sourceCounts.labOrders,
          instructions: payload.sourceCounts.instructions,
        },
        review_note: payload.reviewNote ?? null,
      }),
    },
  );
  return mapInpatientAiSummaryReview(review);
};

export const getInpatientDischargePlan = async (admissionId: number): Promise<InpatientDischargePlan> => {
  const plan = await request<ApiInpatientDischargePlan>(
    `/api/inpatient/admissions/${admissionId}/discharge-plan`,
  );
  return mapInpatientDischargePlan(plan);
};

export const updateInpatientDischargePlan = async (
  admissionId: number,
  payload: {
    status: InpatientDischargePlan['status'];
    dischargeMedicationNote: string;
    billingCandidates: InpatientDischargePlan['billingCandidates'];
    followUpNote: string;
  },
): Promise<InpatientDischargePlan> => {
  const plan = await request<ApiInpatientDischargePlan>(
    `/api/inpatient/admissions/${admissionId}/discharge-plan`,
    {
      method: 'PUT',
      body: JSON.stringify({
        status: payload.status,
        discharge_medication_note: payload.dischargeMedicationNote,
        billing_candidates: payload.billingCandidates,
        follow_up_note: payload.followUpNote,
      }),
    },
  );
  return mapInpatientDischargePlan(plan);
};

export const getInpatientClaimDraft = async (admissionId: number): Promise<ClaimDraft | null> => {
  const draft = await request<ApiClaimDraft | null>(`/api/inpatient/admissions/${admissionId}/claim-draft`);
  return draft ? mapClaimDraft(draft) : null;
};

export const createInpatientClaimDraft = async (admissionId: number): Promise<ClaimDraft> => {
  const draft = await request<ApiClaimDraft>(`/api/inpatient/admissions/${admissionId}/claim-draft`, {
    method: 'POST',
  });
  return mapClaimDraft(draft);
};

export const updateClaimDraftStatus = async (
  claimDraftId: number,
  status: ClaimDraft['status'],
): Promise<ClaimDraft> => {
  const draft = await request<ApiClaimDraft>(`/api/claim-drafts/${claimDraftId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return mapClaimDraft(draft);
};

export const updateClaimLineAdjustmentStatus = async (
  adjustmentId: number,
  status: ClaimLineAdjustment['status'],
): Promise<ClaimDraft> => {
  const draft = await request<ApiClaimDraft>(`/api/claim-line-adjustments/${adjustmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return mapClaimDraft(draft);
};

export const submitClaimDraftToOrca = async (claimDraftId: number): Promise<ClaimDraft['transmissions'][number]> => {
  const transmission = await request<ApiClaimTransmission>(`/api/claim-drafts/${claimDraftId}/transmissions/orca`, {
    method: 'POST',
  });
  return mapClaimTransmission(transmission);
};

export const listFacilityClaimRules = async (): Promise<FacilityClaimRule[]> => {
  const rules = await request<ApiFacilityClaimRule[]>('/api/admin/claim-rules');
  return rules.map(mapFacilityClaimRule);
};

type FacilityClaimRulePayload = {
  id?: string;
  sortOrder: number;
  isActive?: boolean;
  category: string;
  targetCategory: string;
  ruleType: string;
  severity: FacilityClaimRule['severity'];
  message: string;
  evidenceHint?: string;
  conditions?: Record<string, unknown>;
  actions?: Record<string, unknown>;
};

const facilityClaimRuleBody = (payload: FacilityClaimRulePayload) => ({
  ...(payload.id ? { id: payload.id } : {}),
  sort_order: payload.sortOrder,
  is_active: payload.isActive ?? true,
  category: payload.category,
  target_category: payload.targetCategory,
  rule_type: payload.ruleType,
  severity: payload.severity,
  message: payload.message,
  evidence_hint: payload.evidenceHint ?? null,
  conditions: payload.conditions ?? {},
  actions: payload.actions ?? {},
});

export const createFacilityClaimRule = async (payload: FacilityClaimRulePayload & { id: string }): Promise<FacilityClaimRule> => {
  const rule = await request<ApiFacilityClaimRule>('/api/admin/claim-rules', {
    method: 'POST',
    body: JSON.stringify(facilityClaimRuleBody(payload)),
  });
  return mapFacilityClaimRule(rule);
};

export const updateFacilityClaimRule = async (
  ruleId: string,
  payload: FacilityClaimRulePayload,
): Promise<FacilityClaimRule> => {
  const rule = await request<ApiFacilityClaimRule>(`/api/admin/claim-rules/${encodeURIComponent(ruleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(facilityClaimRuleBody(payload)),
  });
  return mapFacilityClaimRule(rule);
};

export const getOrcaAdapterSetting = async (): Promise<OrcaAdapterSetting> => {
  const setting = await request<ApiOrcaAdapterSetting>('/api/admin/orca/settings');
  return mapOrcaAdapterSetting(setting);
};

export const updateOrcaAdapterSetting = async (payload: {
  isActive?: boolean;
  baseUrl?: string;
  authType: OrcaAdapterSetting['authType'];
  username?: string;
  password?: string;
  clientId?: string;
  claimEndpoint: string;
  healthEndpoint: string;
  mode: OrcaAdapterSetting['mode'];
  note?: string;
}): Promise<OrcaAdapterSetting> => {
  const setting = await request<ApiOrcaAdapterSetting>('/api/admin/orca/settings', {
    method: 'PUT',
    body: JSON.stringify({
      is_active: payload.isActive ?? false,
      base_url: payload.baseUrl ?? null,
      auth_type: payload.authType,
      username: payload.username ?? null,
      password: payload.password ?? null,
      client_id: payload.clientId ?? null,
      claim_endpoint: payload.claimEndpoint,
      health_endpoint: payload.healthEndpoint,
      mode: payload.mode,
      note: payload.note ?? null,
    }),
  });
  return mapOrcaAdapterSetting(setting);
};

export const testOrcaConnection = async (): Promise<OrcaConnectionTestResult> => {
  const result = await request<ApiOrcaConnectionTest>('/api/admin/orca/test-connection', {
    method: 'POST',
  });
  return mapOrcaConnectionTest(result);
};

export const getChartWorkspace = async (patientId: string): Promise<ChartWorkspaceData> => {
  const workspace = await request<ApiChartWorkspace>(`/api/patients/${patientId}/chart`);

  return {
    latestNote: workspace.latest_note ? mapChartVersion(workspace.latest_note) : null,
    versions: workspace.versions.map(mapChartVersion),
    patientProfile: mapPatientProfile(workspace.patient_profile),
    problems: mapProblems(workspace.problems),
    visitHistory: mapVisitHistory(workspace.visit_history),
    vitals: mapVitals(workspace.vitals),
    labResults: mapLabResults(workspace.lab_results),
    chartHistory: mapChartHistory(workspace.chart_history),
    imagingOrders: mapImagingOrders(workspace.imaging_orders),
    procedureOrders: mapProcedureOrders(workspace.procedure_orders),
    prescriptions: workspace.prescriptions.map(mapPrescription),
    prescriptionHistory: mapPrescriptionHistory(workspace.prescription_history),
    labOrders: workspace.lab_orders.map(mapLabOrder),
    reservation: mapReservation(workspace.reservation),
    auditLogs: workspace.audit_logs.map(mapAuditLog),
  };
};

export const getLabLongTrends = async (patientId: string): Promise<LabLongTrendItem[]> => {
  const trends = await request<ApiLabLongTrendItem[]>(`/api/patients/${patientId}/lab-trends`);
  return mapLabLongTrends(trends);
};

export const getChartOrderConfig = async (options?: {
  includeInactive?: boolean;
  department?: string;
}): Promise<ChartOrderConfig> => {
  const searchParams = new URLSearchParams();
  if (options?.includeInactive) {
    searchParams.set('include_inactive', 'true');
  }
  if (options?.department) {
    searchParams.set('department', options.department);
  }
  const response = await request<ApiChartOrderConfig>(
    `/api/masters/chart-order-config${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`,
  );

  return {
    prescriptionCatalog: mapPrescriptionCatalog(response.prescription_catalog),
    standardUsageMasters: mapStandardUsageMasters(response.standard_usage_masters),
    prescriptionSets: mapPrescriptionSets(response.prescription_sets),
    labSetOptions: mapLabSetOptions(response.lab_set_options),
    reservationSlots: mapReservationSlots(response.reservation_slots),
    chartTemplates: mapChartTemplates(response.chart_templates),
  };
};

export const searchDiagnoses = async (query: string, limit = 10): Promise<DiagnosisSearchResult[]> => {
  const searchParams = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
  });
  const response = await request<ApiDiagnosisSearchResult[]>(
    `/api/masters/diagnoses/search?${searchParams.toString()}`,
  );
  return response.map(mapDiagnosisSearchResult);
};

export const createPrescriptionCatalogItem = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  drugName: string;
  category: DrugCategory;
  dosageOptions: string[];
  genericName?: string;
  nameKana?: string;
  aliases?: string[];
  yjCode?: string;
  hotCode?: string;
  dosageForm?: string;
  strength?: string;
  standardUsageCode?: string;
  defaultDays?: string;
  pmdaInfoUrl?: string;
  allergyConflictLabel?: string;
  relatedProblem?: string;
  manufacturer?: string;
  drugPrice?: number | string;
  genericReimbursementFlag?: string;
  brandFlag?: string;
  hasGeneric?: boolean;
  transitionalExpiry?: string;
  sourceNote?: string;
}) =>
  request<ApiChartOrderConfig['prescription_catalog'][number]>('/api/admin/masters/prescription-catalog', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      drug_name: payload.drugName,
      category: payload.category,
      dosage_options: payload.dosageOptions,
      generic_name: payload.genericName ?? null,
      name_kana: payload.nameKana ?? null,
      aliases: payload.aliases ?? [],
      yj_code: payload.yjCode ?? null,
      hot_code: payload.hotCode ?? null,
      dosage_form: payload.dosageForm ?? null,
      strength: payload.strength ?? null,
      standard_usage_code: payload.standardUsageCode ?? null,
      default_days: payload.defaultDays ?? null,
      pmda_info_url: payload.pmdaInfoUrl ?? null,
      allergy_conflict_label: payload.allergyConflictLabel ?? null,
      related_problem: payload.relatedProblem ?? null,
      manufacturer: payload.manufacturer ?? null,
      drug_price: payload.drugPrice ?? null,
      generic_reimbursement_flag: payload.genericReimbursementFlag ?? null,
      brand_flag: payload.brandFlag ?? null,
      has_generic: payload.hasGeneric ?? null,
      transitional_expiry: payload.transitionalExpiry ?? null,
      source_note: payload.sourceNote ?? null,
    }),
  });

export const updatePrescriptionCatalogItem = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    drugName: string;
    category: DrugCategory;
    dosageOptions: string[];
    genericName?: string;
    nameKana?: string;
    aliases?: string[];
    yjCode?: string;
    hotCode?: string;
    dosageForm?: string;
    strength?: string;
    standardUsageCode?: string;
    defaultDays?: string;
    pmdaInfoUrl?: string;
    allergyConflictLabel?: string;
    relatedProblem?: string;
    manufacturer?: string;
    drugPrice?: number | string;
    genericReimbursementFlag?: string;
    brandFlag?: string;
    hasGeneric?: boolean;
    transitionalExpiry?: string;
    sourceNote?: string;
  },
) =>
  request<ApiChartOrderConfig['prescription_catalog'][number]>(
    `/api/admin/masters/prescription-catalog/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        drug_name: payload.drugName,
        category: payload.category,
        dosage_options: payload.dosageOptions,
        generic_name: payload.genericName ?? null,
        name_kana: payload.nameKana ?? null,
        aliases: payload.aliases ?? [],
        yj_code: payload.yjCode ?? null,
        hot_code: payload.hotCode ?? null,
        dosage_form: payload.dosageForm ?? null,
        strength: payload.strength ?? null,
        standard_usage_code: payload.standardUsageCode ?? null,
        default_days: payload.defaultDays ?? null,
        pmda_info_url: payload.pmdaInfoUrl ?? null,
        allergy_conflict_label: payload.allergyConflictLabel ?? null,
        related_problem: payload.relatedProblem ?? null,
        manufacturer: payload.manufacturer ?? null,
        drug_price: payload.drugPrice ?? null,
        generic_reimbursement_flag: payload.genericReimbursementFlag ?? null,
        brand_flag: payload.brandFlag ?? null,
        has_generic: payload.hasGeneric ?? null,
        transitional_expiry: payload.transitionalExpiry ?? null,
        source_note: payload.sourceNote ?? null,
      }),
    },
  );

export const createStandardUsageMaster = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  label: string;
  category: DrugCategory;
  instruction: string;
  defaultDays: string;
  note?: string;
}) =>
  request<ApiChartOrderConfig['standard_usage_masters'][number]>('/api/admin/masters/standard-usages', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      label: payload.label,
      category: payload.category,
      instruction: payload.instruction,
      default_days: payload.defaultDays,
      note: payload.note ?? null,
    }),
  });

export const updateStandardUsageMaster = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    label: string;
    category: DrugCategory;
    instruction: string;
    defaultDays: string;
    note?: string;
  },
) =>
  request<ApiChartOrderConfig['standard_usage_masters'][number]>(
    `/api/admin/masters/standard-usages/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        label: payload.label,
        category: payload.category,
        instruction: payload.instruction,
        default_days: payload.defaultDays,
        note: payload.note ?? null,
      }),
    },
  );

export const createPrescriptionSetMaster = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  label: string;
  department: string;
  relatedProblem?: string;
  note?: string;
  items: Array<{ drugId: string; dosage: string; days: string; note?: string }>;
  includedSetIds?: string[];
}) =>
  request<ApiChartOrderConfig['prescription_sets'][number]>('/api/admin/masters/prescription-sets', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      label: payload.label,
      department: payload.department,
      related_problem: payload.relatedProblem ?? null,
      note: payload.note ?? null,
      items: payload.items.map((item) => ({
        drug_id: item.drugId,
        dosage: item.dosage,
        days: item.days,
        note: item.note ?? null,
      })),
      included_set_ids: payload.includedSetIds ?? [],
    }),
  });

export const updatePrescriptionSetMaster = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    label: string;
    department: string;
    relatedProblem?: string;
    note?: string;
    items: Array<{ drugId: string; dosage: string; days: string; note?: string }>;
    includedSetIds?: string[];
  },
) =>
  request<ApiChartOrderConfig['prescription_sets'][number]>(
    `/api/admin/masters/prescription-sets/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        label: payload.label,
        department: payload.department,
        related_problem: payload.relatedProblem ?? null,
        note: payload.note ?? null,
        items: payload.items.map((item) => ({
          drug_id: item.drugId,
          dosage: item.dosage,
          days: item.days,
          note: item.note ?? null,
        })),
        included_set_ids: payload.includedSetIds ?? [],
      }),
    },
  );

export const createLabSetMaster = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  label: string;
  items: string[];
  includedSetIds?: string[];
}) =>
  request<ApiChartOrderConfig['lab_set_options'][number]>('/api/admin/masters/lab-sets', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      label: payload.label,
      items: payload.items,
      included_set_ids: payload.includedSetIds ?? [],
    }),
  });

export const updateLabSetMaster = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    label: string;
    items: string[];
    includedSetIds?: string[];
  },
) =>
  request<ApiChartOrderConfig['lab_set_options'][number]>(
    `/api/admin/masters/lab-sets/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        label: payload.label,
        items: payload.items,
        included_set_ids: payload.includedSetIds ?? [],
      }),
    },
  );

export const createReservationSlotMaster = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  date: string;
  time: string;
  department: string;
  doctor: string;
  state: 'available' | 'few' | 'full';
  capacity?: number;
}) =>
  request<ApiChartOrderConfig['reservation_slots'][number]>('/api/admin/masters/reservation-slots', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      date: payload.date,
      time: payload.time,
      department: payload.department,
      doctor: payload.doctor,
      state: payload.state,
      capacity: payload.capacity ?? 1,
    }),
  });

export const updateReservationSlotMaster = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    date: string;
    time: string;
    department: string;
    doctor: string;
    state: 'available' | 'few' | 'full';
    capacity?: number;
  },
) =>
  request<ApiChartOrderConfig['reservation_slots'][number]>(
    `/api/admin/masters/reservation-slots/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        date: payload.date,
        time: payload.time,
        department: payload.department,
        doctor: payload.doctor,
        state: payload.state,
        capacity: payload.capacity ?? 1,
      }),
    },
  );

export const createChartTemplateMaster = async (payload: {
  id: string;
  sortOrder: number;
  isActive?: boolean;
  label: string;
  department: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}) =>
  request<ApiChartOrderConfig['chart_templates'][number]>('/api/admin/masters/chart-templates', {
    method: 'POST',
    body: JSON.stringify({
      id: payload.id,
      sort_order: payload.sortOrder,
      is_active: payload.isActive ?? true,
      label: payload.label,
      department: payload.department,
      subjective: payload.subjective,
      objective: payload.objective,
      assessment: payload.assessment,
      plan: payload.plan,
    }),
  });

export const updateChartTemplateMaster = async (
  masterId: string,
  payload: {
    sortOrder: number;
    isActive?: boolean;
    label: string;
    department: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  },
) =>
  request<ApiChartOrderConfig['chart_templates'][number]>(
    `/api/admin/masters/chart-templates/${encodeURIComponent(masterId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sort_order: payload.sortOrder,
        is_active: payload.isActive ?? true,
        label: payload.label,
        department: payload.department,
        subjective: payload.subjective,
        objective: payload.objective,
        assessment: payload.assessment,
        plan: payload.plan,
      }),
    },
  );

export const savePatientContext = async (
  patientId: string,
  payload: {
    patientProfile: PatientProfileEntry[];
    problems: ProblemListItem[];
  },
) =>
  request<{
    patient_profile: Array<{ label: string; value: string }>;
    problems: Array<{
      name: string;
      since: string;
      status: 'active' | 'resolved';
      management_number?: string;
      icd10_code?: string;
      diagnosis_type?: 'principal' | 'secondary';
    }>;
  }>(`/api/patients/${patientId}/context`, {
    method: 'PUT',
    body: JSON.stringify({
      patient_profile: payload.patientProfile.map((item) => ({
        label: item.label,
        value: item.value,
      })),
      problems: payload.problems.map((item) => ({
        name: item.name,
        since: item.since,
        status: item.status,
        management_number: item.managementNumber ?? null,
        icd10_code: item.icd10Code ?? null,
        diagnosis_type: item.diagnosisType ?? null,
      })),
    }),
  });

export const saveChart = async (
  patientId: string,
  payload: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
    savedBy: string;
  },
) =>
  request<{ version: number; saved_at: string }>(`/api/patients/${patientId}/chart/save`, {
    method: 'POST',
    body: JSON.stringify({
      subjective: payload.subjective,
      objective: payload.objective,
      assessment: payload.assessment,
      plan: payload.plan,
      saved_by: payload.savedBy,
    }),
  });

export const addPrescription = async (
  patientId: string,
  payload: {
    type: string;
    days: string;
    drugName: string;
    dosage: string;
    actor: string;
  },
) => {
  const response = await request<ApiPrescription>(`/api/patients/${patientId}/prescriptions`, {
    method: 'POST',
    body: JSON.stringify({
      type: payload.type,
      days: payload.days,
      drug_name: payload.drugName,
      dosage: payload.dosage,
      actor: payload.actor,
    }),
  });
  return mapPrescription(response);
};

export const getPrescriptionTimeline = async (patientId: string): Promise<PrescriptionTimelineGroup[]> => {
  const timeline = await request<ApiPrescriptionTimelineGroup[]>(
    `/api/patients/${patientId}/prescription-timeline`,
  );
  return mapPrescriptionTimeline(timeline);
};

export const copyLastPrescriptions = async (
  patientId: string,
  payload: {
    actor: string;
    sourceDate?: string;
  },
): Promise<PrescriptionCopyResult> => {
  const response = await request<ApiPrescriptionCopyResult>(
    `/api/patients/${patientId}/prescriptions/copy-last`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: payload.actor,
        source_date: payload.sourceDate ?? null,
      }),
    },
  );

  return {
    sourceDate: response.source_date,
    copiedCount: response.copied_count,
    skippedCount: response.skipped_count,
    copiedItems: response.copied_items.map(mapPrescription),
    skippedItems: response.skipped_items.map((item) => ({
      drugName: item.drug_name,
      reason: item.reason,
    })),
    timeline: mapPrescriptionTimeline(response.timeline),
  };
};

export const previewCopyLastPrescriptions = async (
  patientId: string,
  payload: {
    actor: string;
    sourceDate?: string;
  },
): Promise<PrescriptionCopyPreview> => {
  const response = await request<ApiPrescriptionCopyPreview>(
    `/api/patients/${patientId}/prescriptions/copy-preview`,
    {
      method: 'POST',
      body: JSON.stringify({
        actor: payload.actor,
        source_date: payload.sourceDate ?? null,
      }),
    },
  );

  return {
    sourceDate: response.source_date,
    plannedCount: response.planned_count,
    skippedCount: response.skipped_count,
    plannedItems: mapPrescriptionTimeline([
      {
        date: response.source_date,
        label: response.source_date,
        is_latest: false,
        is_today: false,
        copyable: true,
        item_count: response.planned_items.length,
        warning_count: response.planned_items.reduce((sum, item) => sum + item.warnings.length, 0),
        items: response.planned_items,
      },
    ])[0]?.items ?? [],
    skippedItems: response.skipped_items.map((item) => ({
      drugName: item.drug_name,
      reason: item.reason,
    })),
    diffItems: response.diff_items.map((item) => ({
      drugName: item.drug_name,
      status: item.status,
      label: item.label,
      sourceDosage: item.source_dosage ?? undefined,
      currentDosage: item.current_dosage ?? undefined,
      reason: item.reason ?? undefined,
    })),
  };
};

export const addLabOrder = async (
  patientId: string,
  payload: {
    category: string;
    urgency?: '通常' | '至急';
    items: string[];
    actor: string;
  },
) =>
  request<ApiLabOrder>(`/api/patients/${patientId}/lab-orders`, {
    method: 'POST',
    body: JSON.stringify({
      category: payload.category,
      urgency: payload.urgency,
      items: payload.items,
      actor: payload.actor,
    }),
  });

export const addImagingOrder = async (
  patientId: string,
  payload: {
    category: string;
    status: 'scheduled' | 'draft';
    scheduledAt: string;
    note: string;
    actor: string;
  },
) =>
  request<{
    category: string;
    status: 'scheduled' | 'draft';
    scheduled_at: string;
    note: string;
  }>(`/api/patients/${patientId}/imaging-orders`, {
    method: 'POST',
    body: JSON.stringify({
      category: payload.category,
      status: payload.status,
      scheduled_at: payload.scheduledAt,
      note: payload.note,
      actor: payload.actor,
    }),
  });

export const addProcedureOrder = async (
  patientId: string,
  payload: {
    title: string;
    status: 'planned' | 'done';
    note: string;
    actor: string;
  },
) =>
  request<{
    title: string;
    status: 'planned' | 'done';
    note: string;
  }>(`/api/patients/${patientId}/procedure-orders`, {
    method: 'POST',
    body: JSON.stringify({
      title: payload.title,
      status: payload.status,
      note: payload.note,
      actor: payload.actor,
    }),
  });

export const saveReservation = async (
  patientId: string,
  payload: {
    slotId?: string;
    scheduledFor: string;
    department: string;
    doctor: string;
    note: string;
    actor: string;
  },
) =>
  request<ApiReservation>(`/api/patients/${patientId}/reservation`, {
    method: 'POST',
    body: JSON.stringify({
      slot_id: payload.slotId ?? null,
      scheduled_for: payload.scheduledFor,
      department: payload.department,
      doctor: payload.doctor,
      note: payload.note,
      actor: payload.actor,
    }),
  });

export const updatePatientStatus = async (
  patientId: string,
  payload: {
    status: ReceptionStatus;
    actor: string;
    detail: string;
  },
): Promise<PatientRecord> => {
  const patient = await request<ApiPatient>(`/api/patients/${patientId}/status`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return mapPatient(patient);
};

export const listAuditLogs = async (
  limit = 20,
  options?: { scope?: AuditLogEntry['scope'] },
): Promise<AuditLogEntry[]> => {
  const searchParams = new URLSearchParams({ limit: String(limit) });
  if (options?.scope) {
    searchParams.set('scope', options.scope);
  }
  const logs = await request<ApiAuditLog[]>(`/api/audit-logs?${searchParams.toString()}`);

  return logs.map(mapAuditLog);
};
