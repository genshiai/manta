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

export type AdminUserSummary = {
  userId: string;
  displayName: string;
  department: string;
  role: UserRole;
  passwordExpiresAt: string;
};

export type AuditScope = 'auth' | 'patient' | 'chart' | 'order' | 'reservation' | 'system';
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
  flag: 'high' | 'normal';
  reportedAt?: string;
  history: LabResultTrendPoint[];
};

export type LabResultTrendPoint = {
  date: string;
  value: string;
  flag: 'high' | 'normal';
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
  category: string;
  status: 'scheduled' | 'draft';
  scheduledAt: string;
  note: string;
};

export type ProcedureOrderEntry = {
  title: string;
  status: 'planned' | 'done';
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
    category: string;
    label: string;
    source: string;
  }>;
  followUpNote: string;
  reviewedBy: string;
  reviewedAt: string;
  updatedAt: string;
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
    category: string;
    status: 'done' | 'pending';
    urgency?: '通常' | '至急';
    items: string[];
    createdAt?: string;
  }>;
  reservation: ScheduledVisit | null;
  auditLogs: AuditLogEntry[];
};
