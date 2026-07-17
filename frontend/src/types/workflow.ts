export type UserRole = '医師' | '管理者';
export type DrugCategory = '内服' | '外用' | '頓服' | '注射' | '歯科';

export type UserAccount = {
  id: string;
  password: string;
  displayName: string;
  department: string;
  role: UserRole;
  passwordExpiresAt: string;
};

export type UserSession = {
  userId: string;
  displayName: string;
  department: string;
  role: UserRole;
  loggedInAt: string;
  accessToken: string;
  passwordExpiresAt?: string;
};

export type CommunicationThread = {
  id: string;
  kind: 'patient' | 'channel' | string;
  title: string;
  patientId?: string;
  patientName?: string;
  department?: string;
  participantLabels: string[];
  unreadCount: number;
  lastMessage?: string;
  lastMessageAt?: string;
};

export type CommunicationMessage = {
  id: number;
  threadId: string;
  authorUserId?: string;
  authorName: string;
  authorRole: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
};

export type AdminUserSummary = {
  userId: string;
  displayName: string;
  department: string;
  role: UserRole;
  passwordExpiresAt: string;
};

export type AuditScope = 'auth' | 'patient' | 'chart' | 'order' | 'reservation' | 'system' | 'billing';
export type AdmissionStatus = 'planned' | 'active' | 'discharge_permitted' | 'discharged' | 'cancelled';
export type BedStatus = 'available' | 'occupied' | 'cleaning' | 'blocked';

export type ProblemListItem = {
  name: string;
  since: string;
  status: 'active' | 'resolved';
  managementNumber?: string;
  icd10Code?: string;
  diagnosisType?: 'principal' | 'secondary';
};

export type PatientProfileEntry = {
  label: string;
  value: string;
};

export type VisitHistoryEntry = {
  date: string;
  department: string;
  summary: string;
  active?: boolean;
};

export type VitalEntry = {
  label: string;
  value: string;
  unit: string;
};

export type LabResultEntry = {
  item: string;
  result: string;
  baseline: string;
  previous: string;
  flag: 'high' | 'low' | 'normal';
  reportedAt?: string;
  history: LabResultTrendPoint[];
};

export type LabResultTrendPoint = {
  date: string;
  value: string;
  flag: 'high' | 'low' | 'normal';
};

export type LabLongTrendPoint = LabResultTrendPoint & {
  numericValue?: number;
  unit?: string;
  observationId: string;
};

export type LabLongTrendItem = {
  item: string;
  code?: string;
  display?: string;
  baseline?: string;
  latestValue?: string;
  previousValue?: string;
  latestDate?: string;
  delta?: number;
  deltaLabel: string;
  abnormalCount: number;
  pointCount: number;
  points: LabLongTrendPoint[];
};

export type ChartHistoryEntry = {
  date: string;
  department: string;
  title: string;
  summary: string;
};

export type ImagingOrderEntry = {
  id?: number;
  patientId?: string;
  category: string;
  status: 'scheduled' | 'draft' | 'cancelled';
  scheduledAt: string;
  note: string;
};

export type ProcedureOrderEntry = {
  id?: number;
  patientId?: string;
  title: string;
  status: 'planned' | 'done' | 'cancelled';
  note: string;
};

export type AuditLogEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  scope: AuditScope;
  detail: string;
  patientId?: string;
  patientName?: string;
};

export type ChartMeta = {
  isDirty: boolean;
  lastSavedAt: string | null;
  version: number;
  pendingWarnings: number;
};

export type InpatientAdmission = {
  id: number;
  patientId: string;
  patientName: string;
  patientKana: string;
  age: string;
  sex: string;
  status: AdmissionStatus;
  wardId?: string;
  wardName?: string;
  floor?: string;
  bedId?: string;
  bedLabel?: string;
  attendingDoctor: string;
  team?: string;
  primaryDiagnosis?: string;
  careLevel?: string;
  note?: string;
  stayDays: number;
  pendingInstructionCount: number;
  latestNursingFocus?: string;
  latestNursingAssessment?: string;
  admittedAt?: string;
};

export type InpatientBed = {
  id: string;
  wardId: string;
  wardName: string;
  floor: string;
  roomNumber: string;
  bedNumber: string;
  bedLabel: string;
  status: BedStatus;
  note?: string;
  currentAdmissionId?: number;
  currentPatientId?: string;
  currentPatientName?: string;
  stayDays?: number;
};

export type InpatientCareAssignment = {
  id: number;
  admissionId: number;
  userId: string;
  userDisplayName: string;
  role: string;
  assignedBy: string;
  createdAt: string;
};

export type InpatientInstruction = {
  id: number;
  admissionId: number;
  category: string;
  title: string;
  status: 'pending' | 'done' | 'cancelled';
  dueAt?: string;
  createdBy: string;
  createdAt: string;
};

export type NursingNote = {
  id: number;
  admissionId: number;
  noteType: string;
  focus?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  recordedBy: string;
  recordedAt: string;
};

export type InpatientDocumentType = 'admission_care_plan' | 'discharge_summary' | 'discharge_instruction';
export type InpatientDocumentStatus = 'draft' | 'signed' | 'archived';

export type InpatientDocument = {
  id: number;
  admissionId: number;
  documentType: InpatientDocumentType;
  title: string;
  status: InpatientDocumentStatus;
  body: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type InpatientProgressRow = {
  date: string;
  vitals: string[];
  labs: string[];
  prescriptions: string[];
  labOrders: string[];
  instructions: string[];
  nursingNotes: string[];
};

export type InpatientProgress = {
  admissionId: number;
  patientId: string;
  rows: InpatientProgressRow[];
};

export type InpatientSummaryDraft = {
  admissionId: number;
  patientId: string;
  title: string;
  periodLabel: string;
  sourceCounts: {
    nursingNotes: number;
    observations: number;
    prescriptions: number;
    labOrders: number;
    instructions: number;
  };
  keyEvents: string[];
  body: string;
  generatedAt: string;
};

export type InpatientEvent = {
  id: number;
  admissionId: number;
  eventType: string;
  title: string;
  detail?: string;
  actor: string;
  occurredAt: string;
};

export type InpatientPathwayTaskStatus = 'pending' | 'done' | 'variance' | 'skipped';

export type InpatientPathwayTask = {
  id: number;
  pathwayAssignmentId: number;
  dayOffset: number;
  category: string;
  title: string;
  role?: string;
  dueOn?: string;
  dueTime?: string;
  status: InpatientPathwayTaskStatus;
  varianceNote?: string;
  updatedBy?: string;
  updatedAt: string;
};

export type InpatientPathway = {
  id: number;
  admissionId: number;
  pathwayMasterId?: string;
  pathwayName: string;
  status: string;
  startedOn: string;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
  tasks: InpatientPathwayTask[];
};

export type InpatientPathwayTaskMaster = {
  id: string;
  pathwayMasterId: string;
  sortOrder: number;
  dayOffset: number;
  category: string;
  title: string;
  role?: string;
  dueTime?: string;
};

export type InpatientPathwayMaster = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  name: string;
  department: string;
  primaryDiagnosis?: string;
  expectedDays: number;
  note?: string;
  tasks: InpatientPathwayTaskMaster[];
};

export type InpatientAiSummaryReview = {
  id: number;
  admissionId: number;
  summaryTitle: string;
  summaryBody: string;
  status: 'accepted' | 'rejected';
  sourceCounts: InpatientSummaryDraft['sourceCounts'];
  reviewedBy: string;
  reviewNote?: string;
  createdAt: string;
};

export type InpatientDischargePlan = {
  id: number;
  admissionId: number;
  status: 'draft' | 'reviewed' | 'ready';
  dischargeMedicationNote: string;
  billingCandidates: Array<{
    id?: string;
    category: string;
    label: string;
    source: string;
    evidence?: string;
    status?: 'candidate' | 'needs_review' | 'accepted' | 'excluded' | string;
    confidence?: 'high' | 'medium' | 'low' | string;
    receiptCode?: string;
    receiptName?: string;
    receiptPoints?: string;
    receiptUnit?: string;
  }>;
  followUpNote: string;
  reviewedBy: string;
  reviewedAt: string;
  updatedAt: string;
};

export type ClaimReviewIssue = {
  id: number;
  claimDraftId: number;
  issueType: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidence?: string;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: string;
};

export type ClaimDraftLine = {
  id: number;
  claimDraftId: number;
  lineType: string;
  sourceType: string;
  sourceId?: string;
  label: string;
  receiptCode?: string;
  receiptName?: string;
  points: number;
  quantity: number;
  unit?: string;
  evidence?: string;
  reviewStatus: string;
  createdAt: string;
};

export type ReceiptCodeCandidate = {
  receiptCode: string;
  receiptName: string;
  points?: number;
  unit?: string;
  category?: string;
};

export type ClaimLineAdjustment = {
  id: number;
  claimDraftId: number;
  claimDraftLineId?: number;
  ruleId?: string;
  adjustmentType: string;
  pointsDelta: number;
  comment?: string;
  commentCode?: string;
  commentPattern?: string;
  reason: string;
  status: 'suggested' | 'accepted' | 'ignored';
  createdAt: string;
};

export type ClaimTransmission = {
  id: number;
  claimDraftId: number;
  adapter: string;
  status: 'accepted' | 'rejected' | 'error';
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  errorMessage?: string;
  sentBy: string;
  sentAt: string;
  createdAt: string;
};

export type ClaimTransmissionSummary = ClaimTransmission & {
  patientId: string;
  patientName: string;
  patientKana: string;
  department: string;
  admissionId?: number;
  claimStatus: ClaimDraft['status'];
  totalPoints: number;
  transmissionCount: number;
  isReclaim: boolean;
};

export type ClaimDraft = {
  id: number;
  patientId: string;
  admissionId?: number;
  status: 'draft' | 'reviewed' | 'ready' | 'submitted' | 'error';
  sourceType: string;
  billingCandidates: InpatientDischargePlan['billingCandidates'];
  totalPoints: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lines: ClaimDraftLine[];
  adjustments: ClaimLineAdjustment[];
  issues: ClaimReviewIssue[];
  transmissions: ClaimTransmission[];
};

export type ClaimDraftSummary = {
  id: number;
  patientId: string;
  patientName: string;
  patientKana: string;
  department: string;
  doctor: string;
  admissionId?: number;
  admissionStatus?: string;
  wardId?: string;
  bedId?: string;
  primaryDiagnosis?: string;
  status: ClaimDraft['status'];
  sourceType: string;
  totalPoints: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lineCount: number;
  openIssueCount: number;
  openErrorCount: number;
  openWarningCount: number;
  unresolvedLineCount: number;
  suggestedAdjustmentCount: number;
  latestTransmissionStatus?: ClaimTransmission['status'];
  latestTransmissionAt?: string;
  openReturnEventCount: number;
};

export type ClaimReturnEvent = {
  id: number;
  claimDraftId: number;
  transmissionId?: number;
  eventType: 'return' | 'assessment' | 'notice';
  severity: 'info' | 'warning' | 'error';
  status: 'open' | 'in_progress' | 'resolved' | 'ignored';
  title: string;
  message: string;
  reasonCode?: string;
  payer?: string;
  receivedAt: string;
  dueAt?: string;
  assignee?: string;
  resolutionNote?: string;
  rawPayload: Record<string, unknown>;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimReturnEventSummary = ClaimReturnEvent & {
  patientId: string;
  patientName: string;
  patientKana: string;
  department: string;
  admissionId?: number;
  claimStatus: ClaimDraft['status'];
  totalPoints: number;
};

export type MonthlyCloseBucket = {
  key: string;
  label: string;
  count: number;
  totalPoints: number;
};

export type MonthlyClaimClose = {
  month: string;
  status: 'pending_approval' | 'closed' | 'cancelled';
  claimCount: number;
  totalPoints: number;
  unsubmittedCount: number;
  openReturnCount: number;
  unresolvedIssueCount: number;
  snapshot: Record<string, unknown>;
  requestedBy?: string;
  requestedAt?: string;
  closedBy: string;
  closedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNote?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  updatedAt: string;
};

export type ClaimReturnReasonBucket = {
  key: string;
  label: string;
  eventType?: ClaimReturnEvent['eventType'];
  severity?: 'info' | 'warning' | 'error';
  count: number;
  openCount: number;
  resolvedCount: number;
  latestReceivedAt?: string;
};

export type ClaimReturnAnalytics = {
  month: string;
  totalCount: number;
  openCount: number;
  inProgressCount: number;
  resolvedCount: number;
  ignoredCount: number;
  reasonBuckets: ClaimReturnReasonBucket[];
  eventTypeBuckets: MonthlyCloseBucket[];
  statusBuckets: MonthlyCloseBucket[];
};

export type ClaimReturnReasonDelta = {
  key: string;
  label: string;
  currentCount: number;
  previousCount: number;
  delta: number;
  currentOpenCount: number;
  previousOpenCount: number;
  openDelta: number;
};

export type ClaimReturnAnalyticsComparison = {
  current: ClaimReturnAnalytics;
  previous: ClaimReturnAnalytics;
  totalDelta: number;
  openDelta: number;
  reasonDeltas: ClaimReturnReasonDelta[];
};

export type ClaimReturnTrendPoint = {
  month: string;
  totalCount: number;
  openCount: number;
  resolvedCount: number;
  assessmentCount: number;
  returnCount: number;
  topReasonCode?: string;
  topReasonCount: number;
};

export type ClaimReturnAssigneeSla = {
  assignee: string;
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  noDueCount: number;
  oldestReceivedAt?: string;
  latestDueAt?: string;
};

export type ClaimReturnSlaSummary = {
  generatedAt: string;
  openCount: number;
  overdueCount: number;
  dueSoonCount: number;
  noDueCount: number;
  assigneeBuckets: ClaimReturnAssigneeSla[];
};

export type ClaimReturnSlaAlert = {
  eventId: number;
  claimDraftId: number;
  patientId: string;
  patientName: string;
  assignee: string;
  status: ClaimReturnEvent['status'];
  title: string;
  reasonCode?: string;
  severity: 'overdue' | 'due_soon' | 'no_due';
  receivedAt: string;
  dueAt?: string;
  hoursUntilDue?: number;
};

export type ClaimReturnSlaEscalation = {
  escalatedCount: number;
  eventIds: number[];
  assignee: string;
  note?: string;
};

export type ClaimSlaSetting = {
  id: string;
  dueSoonHours: number;
  includeNoDue: boolean;
  escalationAssignee: string;
  notifyDestinations: Array<Record<string, unknown>>;
  escalationRules: Array<Record<string, unknown>>;
  note?: string;
  updatedBy?: string;
  updatedAt: string;
};

export type ClaimSlaNotificationDryRun = {
  generatedAt: string;
  destinationCount: number;
  alertCount: number;
  destinations: Array<Record<string, unknown>>;
  alerts: ClaimReturnSlaAlert[];
};

export type MonthlyCloseSummary = {
  month: string;
  claimCount: number;
  totalPoints: number;
  unsubmittedCount: number;
  submittedCount: number;
  openReturnCount: number;
  assessmentCount: number;
  reclaimWaitingCount: number;
  unresolvedIssueCount: number;
  assigneeBuckets: MonthlyCloseBucket[];
  statusBuckets: MonthlyCloseBucket[];
  close?: MonthlyClaimClose;
};

export type FacilityClaimRule = {
  id: string;
  sortOrder: number;
  isActive: boolean;
  category: string;
  targetCategory: string;
  ruleType: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  evidenceHint?: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>;
  updatedAt: string;
};

export type OrcaAdapterSetting = {
  id: string;
  isActive: boolean;
  baseUrl?: string;
  authType: 'none' | 'basic' | 'client';
  username?: string;
  hasPassword: boolean;
  clientId?: string;
  claimEndpoint: string;
  healthEndpoint: string;
  mode: 'mock' | 'http';
  responseMappings: Array<Record<string, unknown>>;
  note?: string;
  updatedBy?: string;
  updatedAt: string;
};

export type OrcaConnectionTestResult = {
  ok: boolean;
  statusCode?: number;
  url?: string;
  message: string;
  responsePayload: Record<string, unknown>;
};

export type OrcaResponseAnalysis = {
  statusCode: number;
  normalized: Record<string, unknown>;
  reasonCount: number;
  mappingCount: number;
};

export type OrcaResponseMappingDiff = {
  baseline: OrcaResponseAnalysis;
  candidate: OrcaResponseAnalysis;
  addedReasons: Array<Record<string, unknown>>;
  removedReasons: Array<Record<string, unknown>>;
  changedReasons: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
};

export type OrcaResponseSample = {
  id: number;
  claimDraftId?: number;
  name: string;
  statusCode: number;
  payload: Record<string, unknown>;
  normalized: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type ChartVersion = {
  version: number;
  savedAt: string;
  savedBy: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type ReservationSlotState = 'available' | 'few' | 'full';

export type PrescriptionCatalogItem = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  drugName: string;
  category: DrugCategory;
  dosageOptions: string[];
  genericName?: string;
  nameKana?: string;
  aliases: string[];
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
};

export type StandardUsageMaster = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  label: string;
  category: DrugCategory;
  instruction: string;
  defaultDays: string;
  note?: string;
};

export type PrescriptionSetItem = {
  drugId: string;
  dosage: string;
  days: string;
  note?: string;
};

export type PrescriptionSetMaster = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  label: string;
  department: string;
  relatedProblem?: string;
  note?: string;
  items: PrescriptionSetItem[];
  includedSetIds: string[];
};

export type PrescriptionEntry = {
  type: string;
  days: string;
  drugName: string;
  dosage: string;
  createdAt?: string;
  warnings?: string[];
  warningDetails?: Array<{
    message: string;
    source?: string;
    severity?: string;
    evidence?: string;
  }>;
};

export type PrescriptionTimelineEntry = PrescriptionEntry & {
  isCurrent?: boolean;
  catalogId?: string;
  pmdaInfoUrl?: string;
  warnings: string[];
};

export type PrescriptionHistoryGroup = {
  date: string;
  label: string;
  isLatest?: boolean;
  itemCount: number;
  items: PrescriptionEntry[];
};

export type PrescriptionTimelineGroup = {
  date: string;
  label: string;
  isLatest?: boolean;
  isToday: boolean;
  copyable: boolean;
  itemCount: number;
  warningCount: number;
  items: PrescriptionTimelineEntry[];
};

export type PrescriptionCopyResult = {
  sourceDate: string;
  copiedCount: number;
  skippedCount: number;
  copiedItems: PrescriptionEntry[];
  skippedItems: Array<{ drugName: string; reason: string }>;
  timeline: PrescriptionTimelineGroup[];
};

export type PrescriptionDiffStatus = 'continued' | 'changed' | 'to_copy' | 'skipped' | 'added';

export type PrescriptionDiffItem = {
  drugName: string;
  status: PrescriptionDiffStatus;
  label: string;
  sourceDosage?: string;
  currentDosage?: string;
  reason?: string;
};

export type PrescriptionCopyPreview = {
  sourceDate: string;
  plannedCount: number;
  skippedCount: number;
  plannedItems: PrescriptionTimelineEntry[];
  skippedItems: Array<{ drugName: string; reason: string }>;
  diffItems: PrescriptionDiffItem[];
};

export type LabSetOption = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  label: string;
  items: string[];
  includedSetIds: string[];
};

export type ReservationSlot = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  date: string;
  time: string;
  department: string;
  doctor: string;
  state: ReservationSlotState;
  capacity: number;
  bookedCount: number;
  remainingCount: number;
};

export type ChartTemplate = {
  id: string;
  sortOrder?: number;
  isActive?: boolean;
  label: string;
  department: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

export type DiagnosisSearchResult = {
  managementNumber: string;
  diseaseName: string;
  diseaseNameKana: string;
  adoptionLevel: string;
  exchangeCode?: string;
  icd10Code?: string;
  icd10Subcode?: string;
  claimCode?: string;
  isDeleted?: boolean;
  updatedAtMaster?: string;
  matchedAlias?: string;
  migrationSourceManagementNumber?: string;
  migrationSourceName?: string;
};

export type ScheduledVisit = {
  slotId?: string;
  date: string;
  department: string;
  doctor?: string;
  note: string;
};

export type ChartOrderConfig = {
  prescriptionCatalog: PrescriptionCatalogItem[];
  standardUsageMasters: StandardUsageMaster[];
  prescriptionSets: PrescriptionSetMaster[];
  labSetOptions: LabSetOption[];
  reservationSlots: ReservationSlot[];
  chartTemplates: ChartTemplate[];
};

export type ChartWorkspaceData = {
  latestNote: ChartVersion | null;
  versions: ChartVersion[];
  patientProfile: PatientProfileEntry[];
  problems: ProblemListItem[];
  visitHistory: VisitHistoryEntry[];
  vitals: VitalEntry[];
  labResults: LabResultEntry[];
  chartHistory: ChartHistoryEntry[];
  imagingOrders: ImagingOrderEntry[];
  procedureOrders: ProcedureOrderEntry[];
  prescriptions: PrescriptionEntry[];
  prescriptionHistory: PrescriptionHistoryGroup[];
  labOrders: Array<{
    id: number;
    patientId: string;
    category: string;
    status: 'done' | 'pending' | 'cancelled';
    urgency?: '通常' | '至急';
    items: string[];
    createdAt?: string;
  }>;
  reservation: ScheduledVisit | null;
  auditLogs: AuditLogEntry[];
};
