import { useCallback, useEffect, useMemo, useState } from 'react';
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
  createChartTemplateMaster,
  createLabSetMaster,
  createPrescriptionCatalogItem,
  createPrescriptionSetMaster,
  createReservationSlotMaster,
  createStandardUsageMaster,
  createUser,
  getChartOrderConfig,
  isForbiddenError,
  isUnauthorizedError,
  listAuditLogs,
  listUsers,
  resetUserPassword,
  updateChartTemplateMaster,
  updateLabSetMaster,
  updatePrescriptionCatalogItem,
  updatePrescriptionSetMaster,
  updateReservationSlotMaster,
  updateStandardUsageMaster,
  updateUser,
} from '../lib/api';
import { cn } from '../lib/cn';
import {
  type HomeSettings,
  homeProfileConfigs,
  homeViewLabels,
  normalizeHomeSettings,
  type HomeProfile,
  type HomeView,
} from '../lib/homeSettings';
import { buildPmdaDrugInfoUrl } from '../lib/pmda';
import type {
  AdminUserSummary,
  AuditLogEntry,
  ChartOrderConfig,
  ChartTemplate,
  DrugCategory,
  LabSetOption,
  PrescriptionCatalogItem,
  PrescriptionSetMaster,
  ReservationSlot,
  StandardUsageMaster,
  UserRole,
  UserSession,
} from '../types/workflow';
import { AuditPanel } from './AuditPanel';

type SettingsWorkspaceProps = {
  currentUser: UserSession;
  homeSettings: HomeSettings;
  onAuthExpired: () => void;
  onHomeSettingsChange: (settings: HomeSettings) => void;
};

type FlashState = {
  tone: 'success' | 'error';
  text: string;
} | null;

type ManagementTab = 'users' | 'prescription' | 'usage' | 'rxset' | 'labset' | 'slot' | 'template';

type CreateFormState = {
  userId: string;
  displayName: string;
  department: string;
  role: UserRole;
  password: string;
  passwordExpiresAt: string;
};

type EditFormState = {
  displayName: string;
  department: string;
  role: UserRole;
  passwordExpiresAt: string;
};

type PrescriptionCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  drugName: string;
  category: DrugCategory;
  dosageOptionsText: string;
  genericName: string;
  nameKana: string;
  aliasesText: string;
  yjCode: string;
  hotCode: string;
  dosageForm: string;
  strength: string;
  standardUsageCode: string;
  defaultDays: string;
  pmdaInfoUrl: string;
  relatedProblem: string;
  allergyConflictLabel: string;
};

type PrescriptionEditFormState = {
  sortOrder: string;
  isActive: boolean;
  drugName: string;
  category: DrugCategory;
  dosageOptionsText: string;
  genericName: string;
  nameKana: string;
  aliasesText: string;
  yjCode: string;
  hotCode: string;
  dosageForm: string;
  strength: string;
  standardUsageCode: string;
  defaultDays: string;
  pmdaInfoUrl: string;
  relatedProblem: string;
  allergyConflictLabel: string;
};

type StandardUsageCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  label: string;
  category: DrugCategory;
  instruction: string;
  defaultDays: string;
  note: string;
};

type StandardUsageEditFormState = {
  sortOrder: string;
  isActive: boolean;
  label: string;
  category: DrugCategory;
  instruction: string;
  defaultDays: string;
  note: string;
};

type PrescriptionSetFormItemState = {
  id: string;
  drugId: string;
  dosage: string;
  days: string;
  note: string;
};

type PrescriptionSetCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  label: string;
  department: string;
  relatedProblem: string;
  note: string;
  includedSetIdsText: string;
  items: PrescriptionSetFormItemState[];
};

type PrescriptionSetEditFormState = {
  sortOrder: string;
  isActive: boolean;
  label: string;
  department: string;
  relatedProblem: string;
  note: string;
  includedSetIdsText: string;
  items: PrescriptionSetFormItemState[];
};

type LabSetCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  label: string;
  itemsText: string;
  includedSetIdsText: string;
};

type LabSetEditFormState = {
  sortOrder: string;
  isActive: boolean;
  label: string;
  itemsText: string;
  includedSetIdsText: string;
};

type ReservationSlotCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  date: string;
  time: string;
  department: string;
  doctor: string;
  state: 'available' | 'few' | 'full';
};

type ReservationSlotEditFormState = {
  sortOrder: string;
  isActive: boolean;
  date: string;
  time: string;
  department: string;
  doctor: string;
  state: 'available' | 'few' | 'full';
};

type ChartTemplateCreateFormState = {
  id: string;
  sortOrder: string;
  isActive: boolean;
  label: string;
  department: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type ChartTemplateEditFormState = {
  sortOrder: string;
  isActive: boolean;
  label: string;
  department: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

const surfaceClassName = 'rounded-8 border border-solid-gray-200 bg-white';

const roleChipColor = (role: UserRole) => (role === '管理者' ? 'purple' : 'blue');
const slotStateColor = (state: 'available' | 'few' | 'full') =>
  state === 'available' ? 'green' : state === 'few' ? 'yellow' : 'gray';
const slotStateLabel = (state: 'available' | 'few' | 'full') =>
  state === 'available' ? '空きあり' : state === 'few' ? '残りわずか' : '満枠';
const masterStatusColor = (isActive: boolean | undefined) => (isActive === false ? 'gray' : 'green');
const masterStatusLabel = (isActive: boolean | undefined) => (isActive === false ? '無効' : '有効');
const toActivationValue = (isActive: boolean) => (isActive ? 'active' : 'inactive');
const createEditorId = () => `item-${Math.random().toString(36).slice(2, 10)}`;
const addDays = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};
const isExpired = (dateValue: string) => dateValue < new Date().toISOString().slice(0, 10);
const nextSortOrder = (values: Array<{ sortOrder?: number }>) =>
  String((Math.max(0, ...values.map((item) => item.sortOrder ?? 0)) || 0) + 10);
const parseLines = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
const toLines = (values: string[]) => values.join('\n');
const normalizeSortOrder = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const createInitialCreateForm = (): CreateFormState => ({
  userId: '',
  displayName: '',
  department: '',
  role: '医師',
  password: '',
  passwordExpiresAt: addDays(90),
});

const createEditForm = (user: AdminUserSummary): EditFormState => ({
  displayName: user.displayName,
  department: user.department,
  role: user.role,
  passwordExpiresAt: user.passwordExpiresAt,
});

const createPrescriptionCreateForm = (
  values: PrescriptionCatalogItem[],
): PrescriptionCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  drugName: '',
  category: '内服',
  dosageOptionsText: '',
  genericName: '',
  nameKana: '',
  aliasesText: '',
  yjCode: '',
  hotCode: '',
  dosageForm: '',
  strength: '',
  standardUsageCode: '',
  defaultDays: '28',
  pmdaInfoUrl: '',
  relatedProblem: '',
  allergyConflictLabel: '',
});

const createPrescriptionEditForm = (
  item: PrescriptionCatalogItem,
): PrescriptionEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  drugName: item.drugName,
  category: item.category,
  dosageOptionsText: toLines(item.dosageOptions),
  genericName: item.genericName ?? '',
  nameKana: item.nameKana ?? '',
  aliasesText: toLines(item.aliases ?? []),
  yjCode: item.yjCode ?? '',
  hotCode: item.hotCode ?? '',
  dosageForm: item.dosageForm ?? '',
  strength: item.strength ?? '',
  standardUsageCode: item.standardUsageCode ?? '',
  defaultDays: item.defaultDays ?? '28',
  pmdaInfoUrl: item.pmdaInfoUrl ?? '',
  relatedProblem: item.relatedProblem ?? '',
  allergyConflictLabel: item.allergyConflictLabel ?? '',
});

const createStandardUsageCreateForm = (values: StandardUsageMaster[]): StandardUsageCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  label: '',
  category: '内服',
  instruction: '',
  defaultDays: '28',
  note: '',
});

const createStandardUsageEditForm = (item: StandardUsageMaster): StandardUsageEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  label: item.label,
  category: item.category,
  instruction: item.instruction,
  defaultDays: item.defaultDays,
  note: item.note ?? '',
});

const createPrescriptionSetFormItem = (): PrescriptionSetFormItemState => ({
  id: createEditorId(),
  drugId: '',
  dosage: '',
  days: '28',
  note: '',
});

const createPrescriptionSetCreateForm = (
  values: PrescriptionSetMaster[],
): PrescriptionSetCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  label: '',
  department: '',
  relatedProblem: '',
  note: '',
  includedSetIdsText: '',
  items: [createPrescriptionSetFormItem()],
});

const createPrescriptionSetEditForm = (item: PrescriptionSetMaster): PrescriptionSetEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  label: item.label,
  department: item.department,
  relatedProblem: item.relatedProblem ?? '',
  note: item.note ?? '',
  includedSetIdsText: toLines(item.includedSetIds ?? []),
  items:
    item.items.length > 0
      ? item.items.map((setItem) => ({
          id: createEditorId(),
          drugId: setItem.drugId,
          dosage: setItem.dosage,
          days: setItem.days,
          note: setItem.note ?? '',
        }))
      : [createPrescriptionSetFormItem()],
});

const createLabSetCreateForm = (values: LabSetOption[]): LabSetCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  label: '',
  itemsText: '',
  includedSetIdsText: '',
});

const createLabSetEditForm = (item: LabSetOption): LabSetEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  label: item.label,
  itemsText: toLines(item.items),
  includedSetIdsText: toLines(item.includedSetIds ?? []),
});

const createReservationSlotCreateForm = (
  values: ReservationSlot[],
): ReservationSlotCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  date: '',
  time: '',
  department: '',
  doctor: '',
  state: 'available',
});

const createReservationSlotEditForm = (
  item: ReservationSlot,
): ReservationSlotEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  date: item.date,
  time: item.time,
  department: item.department,
  doctor: item.doctor,
  state: item.state,
});

const createChartTemplateCreateForm = (values: ChartTemplate[]): ChartTemplateCreateFormState => ({
  id: '',
  sortOrder: nextSortOrder(values),
  isActive: true,
  label: '',
  department: '',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
});

const createChartTemplateEditForm = (item: ChartTemplate): ChartTemplateEditFormState => ({
  sortOrder: String(item.sortOrder ?? 0),
  isActive: item.isActive ?? true,
  label: item.label,
  department: item.department,
  subjective: item.subjective,
  objective: item.objective,
  assessment: item.assessment,
  plan: item.plan,
});

const formatAdminError = (message: string) => {
  if (message === 'User already exists') {
    return '同じ利用者 ID が既に存在します。';
  }

  if (message === 'User not found') {
    return '対象の利用者が見つかりません。';
  }

  if (message === 'Prescription catalog already exists') {
    return '同じ処方候補 ID が既に存在します。';
  }

  if (message === 'Prescription catalog not found') {
    return '対象の処方候補が見つかりません。';
  }

  if (message === 'Standard usage already exists') {
    return '同じ標準用法 ID が既に存在します。';
  }

  if (message === 'Standard usage not found') {
    return '対象の標準用法が見つかりません。';
  }

  if (message === 'Prescription set already exists') {
    return '同じ処方セット ID が既に存在します。';
  }

  if (message === 'Prescription set not found') {
    return '対象の処方セットが見つかりません。';
  }

  if (message === 'Lab set already exists') {
    return '同じ検査セット ID が既に存在します。';
  }

  if (message === 'Lab set not found') {
    return '対象の検査セットが見つかりません。';
  }

  if (message === 'Reservation slot already exists') {
    return '同じ予約枠 ID が既に存在します。';
  }

  if (message === 'Reservation slot not found') {
    return '対象の予約枠が見つかりません。';
  }

  if (message === 'Chart template already exists') {
    return '同じカルテテンプレート ID が既に存在します。';
  }

  if (message === 'Chart template not found') {
    return '対象のカルテテンプレートが見つかりません。';
  }

  if (message === 'Forbidden') {
    return '管理者権限が必要です。';
  }

  return message;
};

export const SettingsWorkspace = ({
  currentUser,
  homeSettings,
  onAuthExpired,
  onHomeSettingsChange,
}: SettingsWorkspaceProps) => {
  const isAdmin = currentUser.role === '管理者';
  const [managementTab, setManagementTab] = useState<ManagementTab>('users');
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [createForm, setCreateForm] = useState<CreateFormState>(createInitialCreateForm);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState('');
  const [orderConfig, setOrderConfig] = useState<ChartOrderConfig>({
    prescriptionCatalog: [],
    standardUsageMasters: [],
    prescriptionSets: [],
    labSetOptions: [],
    reservationSlots: [],
    chartTemplates: [],
  });
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState('');
  const [selectedStandardUsageId, setSelectedStandardUsageId] = useState('');
  const [selectedPrescriptionSetId, setSelectedPrescriptionSetId] = useState('');
  const [selectedLabSetId, setSelectedLabSetId] = useState('');
  const [selectedReservationSlotId, setSelectedReservationSlotId] = useState('');
  const [selectedChartTemplateId, setSelectedChartTemplateId] = useState('');
  const [prescriptionCreateForm, setPrescriptionCreateForm] = useState<PrescriptionCreateFormState>(
    createPrescriptionCreateForm([]),
  );
  const [prescriptionEditForm, setPrescriptionEditForm] = useState<PrescriptionEditFormState | null>(null);
  const [standardUsageCreateForm, setStandardUsageCreateForm] = useState<StandardUsageCreateFormState>(
    createStandardUsageCreateForm([]),
  );
  const [standardUsageEditForm, setStandardUsageEditForm] = useState<StandardUsageEditFormState | null>(null);
  const [prescriptionSetCreateForm, setPrescriptionSetCreateForm] = useState<PrescriptionSetCreateFormState>(
    createPrescriptionSetCreateForm([]),
  );
  const [prescriptionSetEditForm, setPrescriptionSetEditForm] = useState<PrescriptionSetEditFormState | null>(null);
  const [labSetCreateForm, setLabSetCreateForm] = useState<LabSetCreateFormState>(createLabSetCreateForm([]));
  const [labSetEditForm, setLabSetEditForm] = useState<LabSetEditFormState | null>(null);
  const [reservationSlotCreateForm, setReservationSlotCreateForm] = useState<ReservationSlotCreateFormState>(
    createReservationSlotCreateForm([]),
  );
  const [reservationSlotEditForm, setReservationSlotEditForm] = useState<ReservationSlotEditFormState | null>(null);
  const [chartTemplateCreateForm, setChartTemplateCreateForm] = useState<ChartTemplateCreateFormState>(
    createChartTemplateCreateForm([]),
  );
  const [chartTemplateEditForm, setChartTemplateEditForm] = useState<ChartTemplateEditFormState | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [systemAuditLogs, setSystemAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogError, setAuditLogError] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(isAdmin);
  const [isLoadingMasters, setIsLoadingMasters] = useState(isAdmin);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(isAdmin);
  const [isMutating, setIsMutating] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setIsLoadingUsers(false);
      return;
    }

    setIsLoadingUsers(true);
    setListError(null);

    try {
      const nextUsers = await listUsers();
      setUsers(nextUsers);
      return nextUsers;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      if (isForbiddenError(error)) {
        setListError('管理者権限が必要です。');
        return;
      }

      setListError(
        `利用者一覧の取得に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isAdmin, onAuthExpired]);

  const loadMasters = useCallback(async () => {
    if (!isAdmin) {
      setIsLoadingMasters(false);
      return null;
    }

    setIsLoadingMasters(true);
    setMasterError(null);

    try {
      const nextConfig = await getChartOrderConfig({ includeInactive: true });
      setOrderConfig(nextConfig);
      setPrescriptionCreateForm(createPrescriptionCreateForm(nextConfig.prescriptionCatalog));
      setStandardUsageCreateForm(createStandardUsageCreateForm(nextConfig.standardUsageMasters));
      setPrescriptionSetCreateForm(createPrescriptionSetCreateForm(nextConfig.prescriptionSets));
      setLabSetCreateForm(createLabSetCreateForm(nextConfig.labSetOptions));
      setReservationSlotCreateForm(createReservationSlotCreateForm(nextConfig.reservationSlots));
      setChartTemplateCreateForm(createChartTemplateCreateForm(nextConfig.chartTemplates));
      return nextConfig;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return null;
      }

      if (isForbiddenError(error)) {
        setMasterError('管理者権限が必要です。');
        return null;
      }

      setMasterError(
        `マスタ一覧の取得に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      );
      return null;
    } finally {
      setIsLoadingMasters(false);
    }
  }, [isAdmin, onAuthExpired]);

  const loadSystemAuditLogs = useCallback(async () => {
    if (!isAdmin) {
      setIsLoadingAuditLogs(false);
      return;
    }

    setIsLoadingAuditLogs(true);
    setAuditLogError(null);

    try {
      const logs = await listAuditLogs(20, { scope: 'system' });
      setSystemAuditLogs(logs);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setAuditLogError(
        `監査ログの取得に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      );
    } finally {
      setIsLoadingAuditLogs(false);
    }
  }, [isAdmin, onAuthExpired]);

  useEffect(() => {
    void loadUsers();
    void loadMasters();
    void loadSystemAuditLogs();
  }, [loadMasters, loadSystemAuditLogs, loadUsers]);

  useEffect(() => {
    if (!isAdmin) {
      setSelectedUserId('');
      return;
    }

    if (users.length === 0) {
      setSelectedUserId('');
      return;
    }

    if (!selectedUserId || !users.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(users[0].userId);
    }
  }, [isAdmin, selectedUserId, users]);

  useEffect(() => {
    if (!isAdmin) {
      setSelectedPrescriptionId('');
      setSelectedStandardUsageId('');
      setSelectedPrescriptionSetId('');
      setSelectedLabSetId('');
      setSelectedReservationSlotId('');
      setSelectedChartTemplateId('');
      return;
    }

    if (orderConfig.prescriptionCatalog.length === 0) {
      setSelectedPrescriptionId('');
    } else if (
      !selectedPrescriptionId ||
      !orderConfig.prescriptionCatalog.some((item) => item.id === selectedPrescriptionId)
    ) {
      setSelectedPrescriptionId(orderConfig.prescriptionCatalog[0].id);
    }

    if (orderConfig.standardUsageMasters.length === 0) {
      setSelectedStandardUsageId('');
    } else if (
      !selectedStandardUsageId ||
      !orderConfig.standardUsageMasters.some((item) => item.id === selectedStandardUsageId)
    ) {
      setSelectedStandardUsageId(orderConfig.standardUsageMasters[0].id);
    }

    if (orderConfig.prescriptionSets.length === 0) {
      setSelectedPrescriptionSetId('');
    } else if (
      !selectedPrescriptionSetId ||
      !orderConfig.prescriptionSets.some((item) => item.id === selectedPrescriptionSetId)
    ) {
      setSelectedPrescriptionSetId(orderConfig.prescriptionSets[0].id);
    }

    if (orderConfig.labSetOptions.length === 0) {
      setSelectedLabSetId('');
    } else if (!selectedLabSetId || !orderConfig.labSetOptions.some((item) => item.id === selectedLabSetId)) {
      setSelectedLabSetId(orderConfig.labSetOptions[0].id);
    }

    if (orderConfig.reservationSlots.length === 0) {
      setSelectedReservationSlotId('');
    } else if (
      !selectedReservationSlotId ||
      !orderConfig.reservationSlots.some((item) => item.id === selectedReservationSlotId)
    ) {
      setSelectedReservationSlotId(orderConfig.reservationSlots[0].id);
    }

    if (orderConfig.chartTemplates.length === 0) {
      setSelectedChartTemplateId('');
    } else if (
      !selectedChartTemplateId ||
      !orderConfig.chartTemplates.some((item) => item.id === selectedChartTemplateId)
    ) {
      setSelectedChartTemplateId(orderConfig.chartTemplates[0].id);
    }
  }, [
    orderConfig.chartTemplates,
    isAdmin,
    orderConfig.labSetOptions,
    orderConfig.prescriptionCatalog,
    orderConfig.prescriptionSets,
    orderConfig.reservationSlots,
    orderConfig.standardUsageMasters,
    selectedChartTemplateId,
    selectedLabSetId,
    selectedPrescriptionId,
    selectedPrescriptionSetId,
    selectedReservationSlotId,
    selectedStandardUsageId,
  ]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) ?? null,
    [selectedUserId, users],
  );
  const selectedPrescription = useMemo(
    () => orderConfig.prescriptionCatalog.find((item) => item.id === selectedPrescriptionId) ?? null,
    [orderConfig.prescriptionCatalog, selectedPrescriptionId],
  );
  const selectedStandardUsage = useMemo(
    () => orderConfig.standardUsageMasters.find((item) => item.id === selectedStandardUsageId) ?? null,
    [orderConfig.standardUsageMasters, selectedStandardUsageId],
  );
  const selectedPrescriptionSet = useMemo(
    () => orderConfig.prescriptionSets.find((item) => item.id === selectedPrescriptionSetId) ?? null,
    [orderConfig.prescriptionSets, selectedPrescriptionSetId],
  );
  const selectedLabSet = useMemo(
    () => orderConfig.labSetOptions.find((item) => item.id === selectedLabSetId) ?? null,
    [orderConfig.labSetOptions, selectedLabSetId],
  );
  const selectedReservationSlot = useMemo(
    () => orderConfig.reservationSlots.find((item) => item.id === selectedReservationSlotId) ?? null,
    [orderConfig.reservationSlots, selectedReservationSlotId],
  );
  const selectedChartTemplate = useMemo(
    () => orderConfig.chartTemplates.find((item) => item.id === selectedChartTemplateId) ?? null,
    [orderConfig.chartTemplates, selectedChartTemplateId],
  );
  const prescriptionCreatePmdaPreviewUrl =
    prescriptionCreateForm.pmdaInfoUrl.trim() || buildPmdaDrugInfoUrl(prescriptionCreateForm.yjCode);
  const prescriptionEditPmdaPreviewUrl =
    prescriptionEditForm?.pmdaInfoUrl.trim() || buildPmdaDrugInfoUrl(prescriptionEditForm?.yjCode);

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(null);
      return;
    }

    setEditForm(createEditForm(selectedUser));
    setPasswordResetValue('');
  }, [selectedUser]);

  useEffect(() => {
    setPrescriptionEditForm(selectedPrescription ? createPrescriptionEditForm(selectedPrescription) : null);
  }, [selectedPrescription]);

  useEffect(() => {
    setStandardUsageEditForm(selectedStandardUsage ? createStandardUsageEditForm(selectedStandardUsage) : null);
  }, [selectedStandardUsage]);

  useEffect(() => {
    setPrescriptionSetEditForm(selectedPrescriptionSet ? createPrescriptionSetEditForm(selectedPrescriptionSet) : null);
  }, [selectedPrescriptionSet]);

  useEffect(() => {
    setLabSetEditForm(selectedLabSet ? createLabSetEditForm(selectedLabSet) : null);
  }, [selectedLabSet]);

  useEffect(() => {
    setReservationSlotEditForm(
      selectedReservationSlot ? createReservationSlotEditForm(selectedReservationSlot) : null,
    );
  }, [selectedReservationSlot]);

  useEffect(() => {
    setChartTemplateEditForm(
      selectedChartTemplate ? createChartTemplateEditForm(selectedChartTemplate) : null,
    );
  }, [selectedChartTemplate]);

  const handleCreateUser = async () => {
    if (
      !createForm.userId.trim() ||
      !createForm.displayName.trim() ||
      !createForm.department.trim() ||
      !createForm.password ||
      !createForm.passwordExpiresAt
    ) {
      setFlash({ tone: 'error', text: '新規利用者の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const createdUser = await createUser({
        userId: createForm.userId.trim(),
        displayName: createForm.displayName.trim(),
        department: createForm.department.trim(),
        role: createForm.role,
        password: createForm.password,
        passwordExpiresAt: createForm.passwordExpiresAt,
      });

      setUsers((current) =>
        [...current, createdUser].sort((left, right) =>
          `${left.department}-${left.displayName}`.localeCompare(`${right.department}-${right.displayName}`, 'ja'),
        ),
      );
      await loadSystemAuditLogs();
      setSelectedUserId(createdUser.userId);
      setCreateForm(createInitialCreateForm());
      setFlash({ tone: 'success', text: `${createdUser.displayName} を利用者マスタに追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `利用者作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser || !editForm) {
      return;
    }

    if (!editForm.displayName.trim() || !editForm.department.trim() || !editForm.passwordExpiresAt) {
      setFlash({ tone: 'error', text: '更新対象の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updatedUser = await updateUser(selectedUser.userId, {
        displayName: editForm.displayName.trim(),
        department: editForm.department.trim(),
        role: editForm.role,
        passwordExpiresAt: editForm.passwordExpiresAt,
      });

      setUsers((current) =>
        current
          .map((user) => (user.userId === updatedUser.userId ? updatedUser : user))
          .sort((left, right) =>
            `${left.department}-${left.displayName}`.localeCompare(`${right.department}-${right.displayName}`, 'ja'),
          ),
      );
      await loadSystemAuditLogs();
      setFlash({ tone: 'success', text: `${updatedUser.displayName} の基本情報を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `利用者更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) {
      return;
    }

    if (passwordResetValue.length < 8) {
      setFlash({ tone: 'error', text: '一時パスワードは 8 文字以上で入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      await resetUserPassword(selectedUser.userId, passwordResetValue);
      await loadSystemAuditLogs();
      setPasswordResetValue('');
      setFlash({ tone: 'success', text: `${selectedUser.displayName} のパスワードを再設定しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `パスワード再設定に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreatePrescription = async () => {
    if (
      !prescriptionCreateForm.id.trim() ||
      !prescriptionCreateForm.drugName.trim() ||
      parseLines(prescriptionCreateForm.dosageOptionsText).length === 0
    ) {
      setFlash({ tone: 'error', text: '処方候補の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createPrescriptionCatalogItem({
        id: prescriptionCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(prescriptionCreateForm.sortOrder),
        isActive: prescriptionCreateForm.isActive,
        drugName: prescriptionCreateForm.drugName.trim(),
        category: prescriptionCreateForm.category,
        dosageOptions: parseLines(prescriptionCreateForm.dosageOptionsText),
        genericName: prescriptionCreateForm.genericName.trim() || undefined,
        nameKana: prescriptionCreateForm.nameKana.trim() || undefined,
        aliases: parseLines(prescriptionCreateForm.aliasesText),
        yjCode: prescriptionCreateForm.yjCode.trim() || undefined,
        hotCode: prescriptionCreateForm.hotCode.trim() || undefined,
        dosageForm: prescriptionCreateForm.dosageForm.trim() || undefined,
        strength: prescriptionCreateForm.strength.trim() || undefined,
        standardUsageCode: prescriptionCreateForm.standardUsageCode.trim() || undefined,
        defaultDays: prescriptionCreateForm.defaultDays.trim() || undefined,
        pmdaInfoUrl: prescriptionCreateForm.pmdaInfoUrl.trim() || undefined,
        allergyConflictLabel: prescriptionCreateForm.allergyConflictLabel.trim() || undefined,
        relatedProblem: prescriptionCreateForm.relatedProblem.trim() || undefined,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedPrescriptionId(created.id);
      setFlash({ tone: 'success', text: `${created.drug_name} を処方候補に追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `処方候補の作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdatePrescription = async () => {
    if (!selectedPrescription || !prescriptionEditForm) {
      return;
    }

    if (!prescriptionEditForm.drugName.trim() || parseLines(prescriptionEditForm.dosageOptionsText).length === 0) {
      setFlash({ tone: 'error', text: '処方候補の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updatePrescriptionCatalogItem(selectedPrescription.id, {
        sortOrder: normalizeSortOrder(prescriptionEditForm.sortOrder),
        isActive: prescriptionEditForm.isActive,
        drugName: prescriptionEditForm.drugName.trim(),
        category: prescriptionEditForm.category,
        dosageOptions: parseLines(prescriptionEditForm.dosageOptionsText),
        genericName: prescriptionEditForm.genericName.trim() || undefined,
        nameKana: prescriptionEditForm.nameKana.trim() || undefined,
        aliases: parseLines(prescriptionEditForm.aliasesText),
        yjCode: prescriptionEditForm.yjCode.trim() || undefined,
        hotCode: prescriptionEditForm.hotCode.trim() || undefined,
        dosageForm: prescriptionEditForm.dosageForm.trim() || undefined,
        strength: prescriptionEditForm.strength.trim() || undefined,
        standardUsageCode: prescriptionEditForm.standardUsageCode.trim() || undefined,
        defaultDays: prescriptionEditForm.defaultDays.trim() || undefined,
        pmdaInfoUrl: prescriptionEditForm.pmdaInfoUrl.trim() || undefined,
        allergyConflictLabel: prescriptionEditForm.allergyConflictLabel.trim() || undefined,
        relatedProblem: prescriptionEditForm.relatedProblem.trim() || undefined,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedPrescriptionId(updated.id);
      setFlash({ tone: 'success', text: `${updated.drug_name} を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `処方候補の更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const updateSetItems = (
    items: PrescriptionSetFormItemState[],
    index: number,
    patch: Partial<PrescriptionSetFormItemState>,
  ) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));

  const handleCreateStandardUsage = async () => {
    if (
      !standardUsageCreateForm.id.trim() ||
      !standardUsageCreateForm.label.trim() ||
      !standardUsageCreateForm.instruction.trim() ||
      !standardUsageCreateForm.defaultDays.trim()
    ) {
      setFlash({ tone: 'error', text: '標準用法の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createStandardUsageMaster({
        id: standardUsageCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(standardUsageCreateForm.sortOrder),
        isActive: standardUsageCreateForm.isActive,
        label: standardUsageCreateForm.label.trim(),
        category: standardUsageCreateForm.category,
        instruction: standardUsageCreateForm.instruction.trim(),
        defaultDays: standardUsageCreateForm.defaultDays.trim(),
        note: standardUsageCreateForm.note.trim() || undefined,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedStandardUsageId(created.id);
      setFlash({ tone: 'success', text: `${created.label} を標準用法に追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `標準用法の作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateStandardUsage = async () => {
    if (!selectedStandardUsage || !standardUsageEditForm) {
      return;
    }

    if (
      !standardUsageEditForm.label.trim() ||
      !standardUsageEditForm.instruction.trim() ||
      !standardUsageEditForm.defaultDays.trim()
    ) {
      setFlash({ tone: 'error', text: '標準用法の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updateStandardUsageMaster(selectedStandardUsage.id, {
        sortOrder: normalizeSortOrder(standardUsageEditForm.sortOrder),
        isActive: standardUsageEditForm.isActive,
        label: standardUsageEditForm.label.trim(),
        category: standardUsageEditForm.category,
        instruction: standardUsageEditForm.instruction.trim(),
        defaultDays: standardUsageEditForm.defaultDays.trim(),
        note: standardUsageEditForm.note.trim() || undefined,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedStandardUsageId(updated.id);
      setFlash({ tone: 'success', text: `${updated.label} を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `標準用法の更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreatePrescriptionSet = async () => {
    const validItems = prescriptionSetCreateForm.items.filter(
      (item) => item.drugId.trim() && item.dosage.trim() && item.days.trim(),
    );
    if (
      !prescriptionSetCreateForm.id.trim() ||
      !prescriptionSetCreateForm.label.trim() ||
      !prescriptionSetCreateForm.department.trim() ||
      validItems.length === 0
    ) {
      setFlash({ tone: 'error', text: '処方セットの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createPrescriptionSetMaster({
        id: prescriptionSetCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(prescriptionSetCreateForm.sortOrder),
        isActive: prescriptionSetCreateForm.isActive,
        label: prescriptionSetCreateForm.label.trim(),
        department: prescriptionSetCreateForm.department.trim(),
        relatedProblem: prescriptionSetCreateForm.relatedProblem.trim() || undefined,
        note: prescriptionSetCreateForm.note.trim() || undefined,
        includedSetIds: parseLines(prescriptionSetCreateForm.includedSetIdsText),
        items: validItems,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedPrescriptionSetId(created.id);
      setFlash({ tone: 'success', text: `${created.label} を処方セットに追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `処方セットの作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdatePrescriptionSet = async () => {
    if (!selectedPrescriptionSet || !prescriptionSetEditForm) {
      return;
    }

    const validItems = prescriptionSetEditForm.items.filter(
      (item) => item.drugId.trim() && item.dosage.trim() && item.days.trim(),
    );
    if (!prescriptionSetEditForm.label.trim() || !prescriptionSetEditForm.department.trim() || validItems.length === 0) {
      setFlash({ tone: 'error', text: '処方セットの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updatePrescriptionSetMaster(selectedPrescriptionSet.id, {
        sortOrder: normalizeSortOrder(prescriptionSetEditForm.sortOrder),
        isActive: prescriptionSetEditForm.isActive,
        label: prescriptionSetEditForm.label.trim(),
        department: prescriptionSetEditForm.department.trim(),
        relatedProblem: prescriptionSetEditForm.relatedProblem.trim() || undefined,
        note: prescriptionSetEditForm.note.trim() || undefined,
        includedSetIds: parseLines(prescriptionSetEditForm.includedSetIdsText),
        items: validItems,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedPrescriptionSetId(updated.id);
      setFlash({ tone: 'success', text: `${updated.label} を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `処方セットの更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateLabSet = async () => {
    if (!labSetCreateForm.id.trim() || !labSetCreateForm.label.trim() || parseLines(labSetCreateForm.itemsText).length === 0) {
      setFlash({ tone: 'error', text: '検査セットの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createLabSetMaster({
        id: labSetCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(labSetCreateForm.sortOrder),
        isActive: labSetCreateForm.isActive,
        label: labSetCreateForm.label.trim(),
        items: parseLines(labSetCreateForm.itemsText),
        includedSetIds: parseLines(labSetCreateForm.includedSetIdsText),
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedLabSetId(created.id);
      setFlash({ tone: 'success', text: `${created.label} を検査セットに追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `検査セットの作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateLabSet = async () => {
    if (!selectedLabSet || !labSetEditForm) {
      return;
    }

    if (!labSetEditForm.label.trim() || parseLines(labSetEditForm.itemsText).length === 0) {
      setFlash({ tone: 'error', text: '検査セットの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updateLabSetMaster(selectedLabSet.id, {
        sortOrder: normalizeSortOrder(labSetEditForm.sortOrder),
        isActive: labSetEditForm.isActive,
        label: labSetEditForm.label.trim(),
        items: parseLines(labSetEditForm.itemsText),
        includedSetIds: parseLines(labSetEditForm.includedSetIdsText),
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedLabSetId(updated.id);
      setFlash({ tone: 'success', text: `${updated.label} を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `検査セットの更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateReservationSlot = async () => {
    if (
      !reservationSlotCreateForm.id.trim() ||
      !reservationSlotCreateForm.date.trim() ||
      !reservationSlotCreateForm.time.trim() ||
      !reservationSlotCreateForm.department.trim() ||
      !reservationSlotCreateForm.doctor.trim()
    ) {
      setFlash({ tone: 'error', text: '予約枠の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createReservationSlotMaster({
        id: reservationSlotCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(reservationSlotCreateForm.sortOrder),
        isActive: reservationSlotCreateForm.isActive,
        date: reservationSlotCreateForm.date.trim(),
        time: reservationSlotCreateForm.time.trim(),
        department: reservationSlotCreateForm.department.trim(),
        doctor: reservationSlotCreateForm.doctor.trim(),
        state: reservationSlotCreateForm.state,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedReservationSlotId(created.id);
      setFlash({
        tone: 'success',
        text: `${created.date} ${created.time} の予約枠を追加しました。`,
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `予約枠の作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateReservationSlot = async () => {
    if (!selectedReservationSlot || !reservationSlotEditForm) {
      return;
    }

    if (
      !reservationSlotEditForm.date.trim() ||
      !reservationSlotEditForm.time.trim() ||
      !reservationSlotEditForm.department.trim() ||
      !reservationSlotEditForm.doctor.trim()
    ) {
      setFlash({ tone: 'error', text: '予約枠の必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updateReservationSlotMaster(selectedReservationSlot.id, {
        sortOrder: normalizeSortOrder(reservationSlotEditForm.sortOrder),
        isActive: reservationSlotEditForm.isActive,
        date: reservationSlotEditForm.date.trim(),
        time: reservationSlotEditForm.time.trim(),
        department: reservationSlotEditForm.department.trim(),
        doctor: reservationSlotEditForm.doctor.trim(),
        state: reservationSlotEditForm.state,
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedReservationSlotId(updated.id);
      setFlash({
        tone: 'success',
        text: `${updated.date} ${updated.time} の予約枠を更新しました。`,
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `予約枠の更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleCreateChartTemplate = async () => {
    if (
      !chartTemplateCreateForm.id.trim() ||
      !chartTemplateCreateForm.label.trim() ||
      !chartTemplateCreateForm.department.trim() ||
      !chartTemplateCreateForm.subjective.trim() ||
      !chartTemplateCreateForm.objective.trim() ||
      !chartTemplateCreateForm.assessment.trim() ||
      !chartTemplateCreateForm.plan.trim()
    ) {
      setFlash({ tone: 'error', text: 'カルテテンプレートの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const created = await createChartTemplateMaster({
        id: chartTemplateCreateForm.id.trim(),
        sortOrder: normalizeSortOrder(chartTemplateCreateForm.sortOrder),
        isActive: chartTemplateCreateForm.isActive,
        label: chartTemplateCreateForm.label.trim(),
        department: chartTemplateCreateForm.department.trim(),
        subjective: chartTemplateCreateForm.subjective.trim(),
        objective: chartTemplateCreateForm.objective.trim(),
        assessment: chartTemplateCreateForm.assessment.trim(),
        plan: chartTemplateCreateForm.plan.trim(),
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedChartTemplateId(created.id);
      setFlash({ tone: 'success', text: `${created.label} をカルテテンプレートに追加しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `カルテテンプレートの作成に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleUpdateChartTemplate = async () => {
    if (!selectedChartTemplate || !chartTemplateEditForm) {
      return;
    }

    if (
      !chartTemplateEditForm.label.trim() ||
      !chartTemplateEditForm.department.trim() ||
      !chartTemplateEditForm.subjective.trim() ||
      !chartTemplateEditForm.objective.trim() ||
      !chartTemplateEditForm.assessment.trim() ||
      !chartTemplateEditForm.plan.trim()
    ) {
      setFlash({ tone: 'error', text: 'カルテテンプレートの必須項目を入力してください。' });
      return;
    }

    setIsMutating(true);

    try {
      const updated = await updateChartTemplateMaster(selectedChartTemplate.id, {
        sortOrder: normalizeSortOrder(chartTemplateEditForm.sortOrder),
        isActive: chartTemplateEditForm.isActive,
        label: chartTemplateEditForm.label.trim(),
        department: chartTemplateEditForm.department.trim(),
        subjective: chartTemplateEditForm.subjective.trim(),
        objective: chartTemplateEditForm.objective.trim(),
        assessment: chartTemplateEditForm.assessment.trim(),
        plan: chartTemplateEditForm.plan.trim(),
      });
      await loadMasters();
      await loadSystemAuditLogs();
      setSelectedChartTemplateId(updated.id);
      setFlash({ tone: 'success', text: `${updated.label} を更新しました。` });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }

      setFlash({
        tone: 'error',
        text: `カルテテンプレートの更新に失敗しました: ${
          error instanceof Error ? formatAdminError(error.message) : '不明なエラー'
        }`,
      });
    } finally {
      setIsMutating(false);
    }
  };

  const managementTabs = [
    { key: 'users' as const, label: '利用者', count: users.length },
    { key: 'prescription' as const, label: '処方候補', count: orderConfig.prescriptionCatalog.length },
    { key: 'usage' as const, label: '標準用法', count: orderConfig.standardUsageMasters.length },
    { key: 'rxset' as const, label: '処方セット', count: orderConfig.prescriptionSets.length },
    { key: 'labset' as const, label: '検査セット', count: orderConfig.labSetOptions.length },
    { key: 'slot' as const, label: '予約枠', count: orderConfig.reservationSlots.length },
    { key: 'template' as const, label: 'テンプレート', count: orderConfig.chartTemplates.length },
  ];
  const currentHomeProfileConfig = homeProfileConfigs[homeSettings.profile];
  const availableHomeViews = currentHomeProfileConfig.views;
  const handleHomeProfileChange = (profile: HomeProfile) => {
    onHomeSettingsChange(
      normalizeHomeSettings({
        profile,
        defaultView: homeProfileConfigs[profile].defaultView,
      }),
    );
  };
  const handleDefaultHomeViewChange = (defaultView: HomeView) => {
    onHomeSettingsChange(normalizeHomeSettings({ ...homeSettings, defaultView }));
  };

  return (
    <main className='mx-auto max-w-[1600px] px-4 py-6 lg:px-6'>
      <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div className='space-y-3'>
            <Heading size='28'>
              <HeadingTitle level='h1'>設定 / マスタ管理</HeadingTitle>
            </Heading>
            <p className='text-[16px] font-normal leading-none text-solid-gray-700'>
              利用者・処方候補・標準用法・処方セット・検査セット・予約枠・カルテテンプレートを管理します。
            </p>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <SummaryTile label='ログイン利用者' value={currentUser.displayName} />
            <SummaryTile label='現在ロール' value={currentUser.role} />
          </div>
        </div>
      </section>

      <section className={cn(surfaceClassName, 'mt-6 p-5 lg:p-6')}>
        <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]'>
          <div>
            <Heading size='20'>
              <HeadingTitle level='h2'>ホーム設定</HeadingTitle>
            </Heading>
            <p className='mt-2 text-[15px] leading-normal text-solid-gray-700'>
              施設や担当業務に合わせて、ホームの初期患者群と表示スコープを切り替えます。
            </p>
            <div className='mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {(Object.entries(homeProfileConfigs) as Array<[HomeProfile, typeof currentHomeProfileConfig]>).map(
                ([profile, config]) => (
                  <button
                    className={cn(
                      buttonBaseStyle,
                      'rounded-8 border p-4 text-left transition-colors',
                      homeSettings.profile === profile
                        ? 'border-blue-900 bg-blue-50'
                        : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                    )}
                    key={profile}
                    onClick={() => handleHomeProfileChange(profile)}
                    type='button'
                  >
                    <p className='text-[15px] font-bold leading-snug text-solid-gray-900'>{config.label}</p>
                    <p className='mt-2 text-[13px] leading-normal text-solid-gray-536'>{config.description}</p>
                  </button>
                ),
              )}
            </div>
          </div>

          <div className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4'>
            <p className='text-[16px] font-bold leading-snug text-solid-gray-900'>現在のプロファイル</p>
            <p className='mt-1 text-[14px] leading-normal text-solid-gray-536'>{currentHomeProfileConfig.description}</p>
            <label className='mt-4 block text-[13px] font-bold leading-none text-solid-gray-700' htmlFor='home-default-view'>
              起動時に開く患者群
            </label>
            <Select
              aria-label='起動時に開く患者群'
              blockSize='md'
              className='mt-2'
              id='home-default-view'
              onChange={(event) => handleDefaultHomeViewChange(event.target.value as HomeView)}
              value={homeSettings.defaultView}
            >
              {availableHomeViews.map((view) => (
                <option key={view} value={view}>
                  {homeViewLabels[view]}
                </option>
              ))}
            </Select>
            <div className='mt-4 flex flex-wrap gap-2'>
              {availableHomeViews.map((view) => (
                <ChipLabel color={view === homeSettings.defaultView ? 'blue' : 'gray'} key={view} variant='filled-outline'>
                  {homeViewLabels[view]}
                </ChipLabel>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!isAdmin ? (
        <div className='mt-6 grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]'>
          <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
            <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>現在の利用者情報</p>
            <dl className='mt-4 grid gap-3'>
              <InfoRow label='利用者 ID' value={currentUser.userId} />
              <InfoRow label='表示名' value={currentUser.displayName} />
              <InfoRow label='所属' value={currentUser.department} />
              <InfoRow label='権限' value={currentUser.role} />
              <InfoRow label='パスワード有効期限' value={currentUser.passwordExpiresAt ?? '-'} />
            </dl>
          </section>

          <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
            <div className='rounded-8 border border-yellow-200 bg-yellow-50 px-4 py-4'>
              <p className='text-[18px] font-bold leading-snug text-yellow-1000'>管理者権限が必要です</p>
              <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-700'>
                マスタ編集は管理者ロールのみ許可しています。現在の利用者情報の確認はこの画面で継続できます。
              </p>
            </div>
          </section>
        </div>
      ) : (
        <>
          <section className={cn(surfaceClassName, 'mt-6 p-4 lg:p-5')}>
            <div className='flex flex-wrap gap-2'>
              {managementTabs.map((tab) => (
                <button
                  className={cn(
                    buttonBaseStyle,
                    'rounded-8 border px-4 py-3 text-[16px] font-bold leading-none transition-colors',
                    managementTab === tab.key
                      ? 'border-blue-900 bg-blue-50 text-blue-900'
                      : 'border-solid-gray-200 bg-white text-solid-gray-700 hover:bg-solid-gray-50 hover:text-solid-gray-900',
                  )}
                  key={tab.key}
                  onClick={() => setManagementTab(tab.key)}
                  type='button'
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </section>

          <div className='mt-6 grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]'>
            <aside className='space-y-6'>
              {managementTab === 'users' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>利用者一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {users.length}名
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    所属、権限、有効期限、一時パスワードを管理します。
                  </p>
                  {isLoadingUsers ? (
                    <LoadingBanner text='利用者一覧を読み込み中です。' />
                  ) : null}
                  {listError ? <ErrorBanner text={listError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {users.map((user) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedUserId === user.userId
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={user.userId}
                        onClick={() => setSelectedUserId(user.userId)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{user.displayName}</p>
                          <ChipLabel color={roleChipColor(user.role)} variant='filled-outline'>
                            {user.role}
                          </ChipLabel>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{user.userId}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>{user.department}</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                          有効期限: {user.passwordExpiresAt}
                        </p>
                        {isExpired(user.passwordExpiresAt) ? (
                          <p className='mt-2 text-[14px] font-bold leading-none text-red-900'>期限切れ</p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'prescription' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>処方候補一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.prescriptionCatalog.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    処方候補、用法候補、関連病名を管理します。
                  </p>
                  <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                    無効化した候補は一覧に残しつつ、カルテ入力候補からは外します。
                  </p>
                  {isLoadingMasters ? (
                    <LoadingBanner text='処方候補を読み込み中です。' />
                  ) : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.prescriptionCatalog.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedPrescriptionId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedPrescriptionId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.drugName}</p>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                              {masterStatusLabel(item.isActive)}
                            </ChipLabel>
                            <ChipLabel color='blue' variant='filled-outline'>
                              {item.category}
                            </ChipLabel>
                          </div>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>表示順: {item.sortOrder ?? '-'}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'usage' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>標準用法一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.standardUsageMasters.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    既定用法、既定日数、補足メモを管理します。
                  </p>
                  {isLoadingMasters ? <LoadingBanner text='標準用法を読み込み中です。' /> : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.standardUsageMasters.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedStandardUsageId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedStandardUsageId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.label}</p>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                              {masterStatusLabel(item.isActive)}
                            </ChipLabel>
                            <ChipLabel color='blue' variant='filled-outline'>
                              {item.category}
                            </ChipLabel>
                          </div>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>{item.instruction}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'rxset' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>処方セット一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.prescriptionSets.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    定期処方や疾患別セットを管理します。
                  </p>
                  {isLoadingMasters ? <LoadingBanner text='処方セットを読み込み中です。' /> : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.prescriptionSets.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedPrescriptionSetId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedPrescriptionSetId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.label}</p>
                          <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                            {masterStatusLabel(item.isActive)}
                          </ChipLabel>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>{item.department}</p>
                        <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{item.items.length}剤</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'labset' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>検査セット一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.labSetOptions.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    セット名と項目リストを管理します。
                  </p>
                  <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                    無効化したセットは一覧に残しつつ、オーダー候補からは外します。
                  </p>
                  {isLoadingMasters ? (
                    <LoadingBanner text='検査セットを読み込み中です。' />
                  ) : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.labSetOptions.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedLabSetId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedLabSetId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.label}</p>
                          <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                            {masterStatusLabel(item.isActive)}
                          </ChipLabel>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                          {item.items.slice(0, 3).join(' / ')}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'slot' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>予約枠一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.reservationSlots.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    日付、時刻、診療科、担当医、空き状態を管理します。
                  </p>
                  <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                    無効化した予約枠は再診候補に出さず、履歴確認用に残します。
                  </p>
                  {isLoadingMasters ? (
                    <LoadingBanner text='予約枠を読み込み中です。' />
                  ) : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.reservationSlots.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedReservationSlotId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedReservationSlotId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>
                            {item.date} {item.time}
                          </p>
                          <div className='flex flex-wrap items-center gap-2'>
                            <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                              {masterStatusLabel(item.isActive)}
                            </ChipLabel>
                            <ChipLabel color={slotStateColor(item.state)} variant='filled-outline'>
                              {slotStateLabel(item.state)}
                            </ChipLabel>
                          </div>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                          {item.department} / {item.doctor}
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {managementTab === 'template' ? (
                <section className={cn(surfaceClassName, 'p-5')}>
                  <div className='flex items-center justify-between gap-3'>
                    <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>カルテテンプレート一覧</p>
                    <ChipLabel color='gray' variant='filled-outline'>
                      {orderConfig.chartTemplates.length}件
                    </ChipLabel>
                  </div>
                  <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>
                    SOAP の下書きテンプレートを診療科別に管理します。
                  </p>
                  <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
                    無効化したテンプレートは一覧に残しつつ、カルテ記載画面の候補から外します。
                  </p>
                  {isLoadingMasters ? (
                    <LoadingBanner text='カルテテンプレートを読み込み中です。' />
                  ) : null}
                  {masterError ? <ErrorBanner text={masterError} /> : null}
                  <div className='mt-4 flex flex-col gap-3'>
                    {orderConfig.chartTemplates.map((item) => (
                      <button
                        className={cn(
                          buttonBaseStyle,
                          'rounded-8 border px-4 py-3 text-left transition-colors',
                          selectedChartTemplateId === item.id
                            ? 'border-blue-900 bg-blue-50'
                            : 'border-solid-gray-200 bg-white hover:bg-solid-gray-50',
                        )}
                        key={item.id}
                        onClick={() => setSelectedChartTemplateId(item.id)}
                        type='button'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <p className='text-[16px] font-bold leading-none text-solid-gray-900'>{item.label}</p>
                          <ChipLabel color={masterStatusColor(item.isActive)} variant='filled-outline'>
                            {masterStatusLabel(item.isActive)}
                          </ChipLabel>
                        </div>
                        <p className='mt-1 text-mono-14N-150 text-solid-gray-700'>{item.id}</p>
                        <p className='mt-2 text-[14px] font-normal leading-none text-solid-gray-536'>{item.department}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </aside>

            <div className='space-y-6'>
              {flash ? (
                <section
                  className={cn(
                    'rounded-12 border px-5 py-4 shadow-1',
                    flash.tone === 'success'
                      ? 'border-green-200 bg-green-50 text-green-900'
                      : 'border-red-200 bg-red-50 text-red-900',
                  )}
                >
                  <p className='text-[16px] font-bold leading-none'>{flash.text}</p>
                </section>
              ) : null}

              {managementTab === 'users' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='作成'
                      title='新規利用者を追加'
                      tone='blue'
                      description='初期パスワードと有効期限を同時に設定します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='利用者 ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, userId: event.target.value }))
                          }
                          placeholder='dr.yamada'
                          value={createForm.userId}
                        />
                      </Field>
                      <Field label='表示名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, displayName: event.target.value }))
                          }
                          placeholder='山田 花子'
                          value={createForm.displayName}
                        />
                      </Field>
                      <Field label='所属'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, department: event.target.value }))
                          }
                          placeholder='内科'
                          value={createForm.department}
                        />
                      </Field>
                      <Field label='権限'>
                        <Select
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, role: event.target.value as UserRole }))
                          }
                          value={createForm.role}
                        >
                          <option value='医師'>医師</option>
                          <option value='管理者'>管理者</option>
                        </Select>
                      </Field>
                      <Field label='初期パスワード'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({ ...current, password: event.target.value }))
                          }
                          placeholder='8文字以上'
                          type='password'
                          value={createForm.password}
                        />
                      </Field>
                      <Field label='パスワード有効期限'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setCreateForm((current) => ({
                              ...current,
                              passwordExpiresAt: event.target.value,
                            }))
                          }
                          type='date'
                          value={createForm.passwordExpiresAt}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreateUser} size='md' type='button' variant='solid-fill'>
                        利用者を追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedUser?.userId ?? '未選択'}
                      title='利用者情報を更新'
                      tone='purple'
                      description='所属、権限、有効期限を管理します。'
                    />

                    {selectedUser && editForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setEditForm((current) =>
                                  current ? { ...current, displayName: event.target.value } : current,
                                )
                              }
                              value={editForm.displayName}
                            />
                          </Field>
                          <Field label='所属'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setEditForm((current) =>
                                  current ? { ...current, department: event.target.value } : current,
                                )
                              }
                              value={editForm.department}
                            />
                          </Field>
                          <Field label='権限'>
                            <Select
                              blockSize='md'
                              onChange={(event) =>
                                setEditForm((current) =>
                                  current ? { ...current, role: event.target.value as UserRole } : current,
                                )
                              }
                              value={editForm.role}
                            >
                              <option value='医師'>医師</option>
                              <option value='管理者'>管理者</option>
                            </Select>
                          </Field>
                          <Field label='パスワード有効期限'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setEditForm((current) =>
                                  current ? { ...current, passwordExpiresAt: event.target.value } : current,
                                )
                              }
                              type='date'
                              value={editForm.passwordExpiresAt}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdateUser} size='md' type='button' variant='outline'>
                            基本情報を更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の利用者を選択してください。' />
                    )}
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='再設定'
                      title='一時パスワードを再設定'
                      tone='yellow'
                      description='ログイン不能時の復旧用です。設定後は利用者へ個別伝達してください。'
                    />

                    {selectedUser ? (
                      <div className='mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end'>
                        <Field label={`一時パスワード (${selectedUser.displayName})`}>
                          <Input
                            blockSize='md'
                            onChange={(event) => setPasswordResetValue(event.target.value)}
                            placeholder='8文字以上'
                            type='password'
                            value={passwordResetValue}
                          />
                        </Field>
                        <Button aria-disabled={isMutating} onClick={handleResetPassword} size='md' type='button' variant='outline'>
                          再設定する
                        </Button>
                      </div>
                    ) : (
                      <EmptyState text='対象の利用者を選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'prescription' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='処方候補'
                      title='新規処方候補を追加'
                      tone='blue'
                      description='薬剤名、表示順、用法候補、関連病名を登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='候補 ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='glimepiride-1'
                          value={prescriptionCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          type='number'
                          value={prescriptionCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={prescriptionCreateForm.isActive}
                          onChange={(isActive) =>
                            setPrescriptionCreateForm((current) => ({ ...current, isActive }))
                          }
                        />
                      </Field>
                      <Field label='薬剤名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, drugName: event.target.value }))
                          }
                          value={prescriptionCreateForm.drugName}
                        />
                      </Field>
                      <Field label='一般名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, genericName: event.target.value }))
                          }
                          value={prescriptionCreateForm.genericName}
                        />
                      </Field>
                      <Field label='カナ'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, nameKana: event.target.value }))
                          }
                          value={prescriptionCreateForm.nameKana}
                        />
                      </Field>
                      <Field label='区分'>
                        <Select
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({
                              ...current,
                              category: event.target.value as PrescriptionCreateFormState['category'],
                            }))
                          }
                          value={prescriptionCreateForm.category}
                        >
                          <option value='内服'>内服</option>
                          <option value='外用'>外用</option>
                          <option value='頓服'>頓服</option>
                        </Select>
                      </Field>
                      <Field label='標準用法'>
                        <Select
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({
                              ...current,
                              standardUsageCode: event.target.value,
                            }))
                          }
                          value={prescriptionCreateForm.standardUsageCode}
                        >
                          <option value=''>未設定</option>
                          {orderConfig.standardUsageMasters.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label='既定日数'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, defaultDays: event.target.value }))
                          }
                          value={prescriptionCreateForm.defaultDays}
                        />
                      </Field>
                      <Field label='剤形'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, dosageForm: event.target.value }))
                          }
                          placeholder='錠剤'
                          value={prescriptionCreateForm.dosageForm}
                        />
                      </Field>
                      <Field label='規格'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, strength: event.target.value }))
                          }
                          placeholder='500mg'
                          value={prescriptionCreateForm.strength}
                        />
                      </Field>
                      <Field label='別名 / 検索語'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, aliasesText: event.target.value }))
                          }
                          placeholder={'メトホルミン\n糖尿病薬'}
                          rows={4}
                          value={prescriptionCreateForm.aliasesText}
                        />
                      </Field>
                      <Field label='YJコード'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, yjCode: event.target.value }))
                          }
                          value={prescriptionCreateForm.yjCode}
                        />
                      </Field>
                      <Field label='HOTコード'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, hotCode: event.target.value }))
                          }
                          value={prescriptionCreateForm.hotCode}
                        />
                      </Field>
                      <Field label='PMDAリンク'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({ ...current, pmdaInfoUrl: event.target.value }))
                          }
                          placeholder='https://...'
                          value={prescriptionCreateForm.pmdaInfoUrl}
                        />
                        {prescriptionCreatePmdaPreviewUrl ? (
                          <p className='mt-2 text-14N text-solid-gray-700'>
                            <Link href={prescriptionCreatePmdaPreviewUrl} target='_blank' rel='noreferrer'>
                              PMDA 関連文書リンクを確認
                            </Link>
                          </p>
                        ) : (
                          <p className='mt-2 text-14N text-solid-gray-600'>
                            12桁の YJ コードがあれば PMDA リンクを自動生成します。
                          </p>
                        )}
                      </Field>
                      <Field label='関連病名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({
                              ...current,
                              relatedProblem: event.target.value,
                            }))
                          }
                          placeholder='#1 2型糖尿病'
                          value={prescriptionCreateForm.relatedProblem}
                        />
                      </Field>
                      <Field label='禁忌ラベル'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({
                              ...current,
                              allergyConflictLabel: event.target.value,
                            }))
                          }
                          placeholder='ペニシリンアレルギー'
                          value={prescriptionCreateForm.allergyConflictLabel}
                        />
                      </Field>
                      <Field label='用法候補'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setPrescriptionCreateForm((current) => ({
                              ...current,
                              dosageOptionsText: event.target.value,
                            }))
                          }
                          placeholder={'1回1錠 1日2回 朝夕食後\n1回1錠 1日1回 夕食後'}
                          rows={5}
                          value={prescriptionCreateForm.dosageOptionsText}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreatePrescription} size='md' type='button' variant='solid-fill'>
                        処方候補を追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedPrescription?.id ?? '未選択'}
                      title='処方候補を更新'
                      tone='purple'
                      description='既存の薬剤名、表示順、用法候補を更新します。'
                    />

                    {selectedPrescription && prescriptionEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                          value={prescriptionEditForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={prescriptionEditForm.isActive}
                          onChange={(isActive) =>
                            setPrescriptionEditForm((current) =>
                              current ? { ...current, isActive } : current,
                            )
                          }
                        />
                      </Field>
                          <Field label='区分'>
                            <Select
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        category: event.target.value as PrescriptionEditFormState['category'],
                                      }
                                    : current,
                                )
                              }
                              value={prescriptionEditForm.category}
                            >
                              <option value='内服'>内服</option>
                              <option value='外用'>外用</option>
                              <option value='頓服'>頓服</option>
                            </Select>
                          </Field>
                          <Field label='薬剤名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, drugName: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.drugName}
                            />
                          </Field>
                          <Field label='一般名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, genericName: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.genericName}
                            />
                          </Field>
                          <Field label='カナ'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, nameKana: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.nameKana}
                            />
                          </Field>
                          <Field label='標準用法'>
                            <Select
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, standardUsageCode: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.standardUsageCode}
                            >
                              <option value=''>未設定</option>
                              {orderConfig.standardUsageMasters.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label='既定日数'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, defaultDays: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.defaultDays}
                            />
                          </Field>
                          <Field label='剤形'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, dosageForm: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.dosageForm}
                            />
                          </Field>
                          <Field label='規格'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, strength: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.strength}
                            />
                          </Field>
                          <Field label='別名 / 検索語'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, aliasesText: event.target.value } : current,
                                )
                              }
                              rows={4}
                              value={prescriptionEditForm.aliasesText}
                            />
                          </Field>
                          <Field label='YJコード'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, yjCode: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.yjCode}
                            />
                          </Field>
                          <Field label='HOTコード'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, hotCode: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.hotCode}
                            />
                          </Field>
                          <Field label='PMDAリンク'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, pmdaInfoUrl: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.pmdaInfoUrl}
                            />
                            {prescriptionEditPmdaPreviewUrl ? (
                              <p className='mt-2 text-14N text-solid-gray-700'>
                                <Link href={prescriptionEditPmdaPreviewUrl} target='_blank' rel='noreferrer'>
                                  PMDA 関連文書リンクを確認
                                </Link>
                              </p>
                            ) : (
                              <p className='mt-2 text-14N text-solid-gray-600'>
                                12桁の YJ コードがあれば PMDA リンクを自動生成します。
                              </p>
                            )}
                          </Field>
                          <Field label='関連病名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, relatedProblem: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.relatedProblem}
                            />
                          </Field>
                          <Field label='禁忌ラベル'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, allergyConflictLabel: event.target.value } : current,
                                )
                              }
                              value={prescriptionEditForm.allergyConflictLabel}
                            />
                          </Field>
                          <Field label='用法候補'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setPrescriptionEditForm((current) =>
                                  current ? { ...current, dosageOptionsText: event.target.value } : current,
                                )
                              }
                              rows={5}
                              value={prescriptionEditForm.dosageOptionsText}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdatePrescription} size='md' type='button' variant='outline'>
                            処方候補を更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の処方候補を選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'usage' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='標準用法'
                      title='新規標準用法を追加'
                      tone='blue'
                      description='既定用法、既定日数、補足メモを登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='標準用法 ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='po-bid-after-meals'
                          value={standardUsageCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          type='number'
                          value={standardUsageCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={standardUsageCreateForm.isActive}
                          onChange={(isActive) =>
                            setStandardUsageCreateForm((current) => ({ ...current, isActive }))
                          }
                        />
                      </Field>
                      <Field label='区分'>
                        <Select
                          blockSize='md'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({
                              ...current,
                              category: event.target.value as DrugCategory,
                            }))
                          }
                          value={standardUsageCreateForm.category}
                        >
                          <option value='内服'>内服</option>
                          <option value='外用'>外用</option>
                          <option value='頓服'>頓服</option>
                        </Select>
                      </Field>
                      <Field label='表示名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({ ...current, label: event.target.value }))
                          }
                          value={standardUsageCreateForm.label}
                        />
                      </Field>
                      <Field label='既定日数'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({ ...current, defaultDays: event.target.value }))
                          }
                          value={standardUsageCreateForm.defaultDays}
                        />
                      </Field>
                      <Field label='用法文言'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({
                              ...current,
                              instruction: event.target.value,
                            }))
                          }
                          rows={3}
                          value={standardUsageCreateForm.instruction}
                        />
                      </Field>
                      <Field label='補足メモ'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setStandardUsageCreateForm((current) => ({ ...current, note: event.target.value }))
                          }
                          rows={3}
                          value={standardUsageCreateForm.note}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreateStandardUsage} size='md' type='button' variant='solid-fill'>
                        標準用法を追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedStandardUsage?.id ?? '未選択'}
                      title='標準用法を更新'
                      tone='purple'
                      description='名称、区分、既定日数、用法文言を更新します。'
                    />

                    {selectedStandardUsage && standardUsageEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                              value={standardUsageEditForm.sortOrder}
                            />
                          </Field>
                          <Field label='公開状態'>
                            <ActivationSelect
                              isActive={standardUsageEditForm.isActive}
                              onChange={(isActive) =>
                                setStandardUsageEditForm((current) => (current ? { ...current, isActive } : current))
                              }
                            />
                          </Field>
                          <Field label='区分'>
                            <Select
                              blockSize='md'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, category: event.target.value as DrugCategory } : current,
                                )
                              }
                              value={standardUsageEditForm.category}
                            >
                              <option value='内服'>内服</option>
                              <option value='外用'>外用</option>
                              <option value='頓服'>頓服</option>
                            </Select>
                          </Field>
                          <Field label='表示名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, label: event.target.value } : current,
                                )
                              }
                              value={standardUsageEditForm.label}
                            />
                          </Field>
                          <Field label='既定日数'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, defaultDays: event.target.value } : current,
                                )
                              }
                              value={standardUsageEditForm.defaultDays}
                            />
                          </Field>
                          <Field label='用法文言'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, instruction: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={standardUsageEditForm.instruction}
                            />
                          </Field>
                          <Field label='補足メモ'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setStandardUsageEditForm((current) =>
                                  current ? { ...current, note: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={standardUsageEditForm.note}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdateStandardUsage} size='md' type='button' variant='outline'>
                            標準用法を更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の標準用法を選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'rxset' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='処方セット'
                      title='新規処方セットを追加'
                      tone='blue'
                      description='疾患別・定期処方のセットを登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='セット ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='dm-follow-28'
                          value={prescriptionSetCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          type='number'
                          value={prescriptionSetCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={prescriptionSetCreateForm.isActive}
                          onChange={(isActive) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, isActive }))
                          }
                        />
                      </Field>
                      <Field label='セット名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, label: event.target.value }))
                          }
                          value={prescriptionSetCreateForm.label}
                        />
                      </Field>
                      <Field label='診療科'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, department: event.target.value }))
                          }
                          value={prescriptionSetCreateForm.department}
                        />
                      </Field>
                      <Field label='関連病名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({
                              ...current,
                              relatedProblem: event.target.value,
                            }))
                          }
                          value={prescriptionSetCreateForm.relatedProblem}
                        />
                      </Field>
                      <Field label='補足'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({ ...current, note: event.target.value }))
                          }
                          rows={3}
                          value={prescriptionSetCreateForm.note}
                        />
                      </Field>
                      <Field label='含める処方セットID'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setPrescriptionSetCreateForm((current) => ({
                              ...current,
                              includedSetIdsText: event.target.value,
                            }))
                          }
                          placeholder={'dm-follow-28\ndm-ht-follow-28'}
                          rows={3}
                          value={prescriptionSetCreateForm.includedSetIdsText}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 space-y-3'>
                      {prescriptionSetCreateForm.items.map((item, index) => (
                        <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4 md:grid-cols-2' key={item.id}>
                          <Field label={`薬剤 ${index + 1}`}>
                            <Select
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetCreateForm((current) => ({
                                  ...current,
                                  items: updateSetItems(current.items, index, { drugId: event.target.value }),
                                }))
                              }
                              value={item.drugId}
                            >
                              <option value=''>選択してください</option>
                              {orderConfig.prescriptionCatalog.map((drug) => (
                                <option key={drug.id} value={drug.id}>
                                  {drug.drugName}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label='日数'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetCreateForm((current) => ({
                                  ...current,
                                  items: updateSetItems(current.items, index, { days: event.target.value }),
                                }))
                              }
                              value={item.days}
                            />
                          </Field>
                          <Field label='用法'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetCreateForm((current) => ({
                                  ...current,
                                  items: updateSetItems(current.items, index, { dosage: event.target.value }),
                                }))
                              }
                              value={item.dosage}
                            />
                          </Field>
                          <Field label='補足'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetCreateForm((current) => ({
                                  ...current,
                                  items: updateSetItems(current.items, index, { note: event.target.value }),
                                }))
                              }
                              value={item.note}
                            />
                          </Field>
                        </div>
                      ))}
                    </div>

                    <div className='mt-4 flex flex-wrap justify-between gap-3'>
                      <Button
                        aria-disabled={isMutating}
                        onClick={() =>
                          setPrescriptionSetCreateForm((current) => ({
                            ...current,
                            items: [...current.items, createPrescriptionSetFormItem()],
                          }))
                        }
                        size='md'
                        type='button'
                        variant='outline'
                      >
                        剤を追加
                      </Button>
                      <Button aria-disabled={isMutating} onClick={handleCreatePrescriptionSet} size='md' type='button' variant='solid-fill'>
                        処方セットを追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedPrescriptionSet?.id ?? '未選択'}
                      title='処方セットを更新'
                      tone='purple'
                      description='構成薬剤、用法、日数を更新します。'
                    />

                    {selectedPrescriptionSet && prescriptionSetEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                              value={prescriptionSetEditForm.sortOrder}
                            />
                          </Field>
                          <Field label='公開状態'>
                            <ActivationSelect
                              isActive={prescriptionSetEditForm.isActive}
                              onChange={(isActive) =>
                                setPrescriptionSetEditForm((current) => (current ? { ...current, isActive } : current))
                              }
                            />
                          </Field>
                          <Field label='セット名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, label: event.target.value } : current,
                                )
                              }
                              value={prescriptionSetEditForm.label}
                            />
                          </Field>
                          <Field label='診療科'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, department: event.target.value } : current,
                                )
                              }
                              value={prescriptionSetEditForm.department}
                            />
                          </Field>
                          <Field label='関連病名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, relatedProblem: event.target.value } : current,
                                )
                              }
                              value={prescriptionSetEditForm.relatedProblem}
                            />
                          </Field>
                          <Field label='補足'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, note: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={prescriptionSetEditForm.note}
                            />
                          </Field>
                          <Field label='含める処方セットID'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setPrescriptionSetEditForm((current) =>
                                  current ? { ...current, includedSetIdsText: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={prescriptionSetEditForm.includedSetIdsText}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 space-y-3'>
                          {prescriptionSetEditForm.items.map((item, index) => (
                            <div className='grid gap-3 rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-4 md:grid-cols-2' key={item.id}>
                              <Field label={`薬剤 ${index + 1}`}>
                                <Select
                                  blockSize='md'
                                  onChange={(event) =>
                                    setPrescriptionSetEditForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            items: updateSetItems(current.items, index, { drugId: event.target.value }),
                                          }
                                        : current,
                                    )
                                  }
                                  value={item.drugId}
                                >
                                  <option value=''>選択してください</option>
                                  {orderConfig.prescriptionCatalog.map((drug) => (
                                    <option key={drug.id} value={drug.id}>
                                      {drug.drugName}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                              <Field label='日数'>
                                <Input
                                  blockSize='md'
                                  onChange={(event) =>
                                    setPrescriptionSetEditForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            items: updateSetItems(current.items, index, { days: event.target.value }),
                                          }
                                        : current,
                                    )
                                  }
                                  value={item.days}
                                />
                              </Field>
                              <Field label='用法'>
                                <Input
                                  blockSize='md'
                                  onChange={(event) =>
                                    setPrescriptionSetEditForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            items: updateSetItems(current.items, index, { dosage: event.target.value }),
                                          }
                                        : current,
                                    )
                                  }
                                  value={item.dosage}
                                />
                              </Field>
                              <Field label='補足'>
                                <Input
                                  blockSize='md'
                                  onChange={(event) =>
                                    setPrescriptionSetEditForm((current) =>
                                      current
                                        ? {
                                            ...current,
                                            items: updateSetItems(current.items, index, { note: event.target.value }),
                                          }
                                        : current,
                                    )
                                  }
                                  value={item.note}
                                />
                              </Field>
                            </div>
                          ))}
                        </div>

                        <div className='mt-4 flex flex-wrap justify-between gap-3'>
                          <Button
                            aria-disabled={isMutating}
                            onClick={() =>
                              setPrescriptionSetEditForm((current) =>
                                current
                                  ? {
                                      ...current,
                                      items: [...current.items, createPrescriptionSetFormItem()],
                                    }
                                  : current,
                              )
                            }
                            size='md'
                            type='button'
                            variant='outline'
                          >
                            剤を追加
                          </Button>
                          <Button aria-disabled={isMutating} onClick={handleUpdatePrescriptionSet} size='md' type='button' variant='outline'>
                            処方セットを更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の処方セットを選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'labset' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='検査セット'
                      title='新規検査セットを追加'
                      tone='blue'
                      description='セット名、表示順、含める検査項目を登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='セット ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setLabSetCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='renal-follow'
                          value={labSetCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setLabSetCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          type='number'
                          value={labSetCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={labSetCreateForm.isActive}
                          onChange={(isActive) => setLabSetCreateForm((current) => ({ ...current, isActive }))}
                        />
                      </Field>
                      <Field label='セット名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setLabSetCreateForm((current) => ({ ...current, label: event.target.value }))
                          }
                          value={labSetCreateForm.label}
                        />
                      </Field>
                      <Field label='検査項目'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setLabSetCreateForm((current) => ({ ...current, itemsText: event.target.value }))
                          }
                          placeholder={'AST\nALT\nALP'}
                          rows={5}
                          value={labSetCreateForm.itemsText}
                        />
                      </Field>
                      <Field label='含める検査セットID'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setLabSetCreateForm((current) => ({
                              ...current,
                              includedSetIdsText: event.target.value,
                            }))
                          }
                          placeholder={'dm-follow\nurine-basic'}
                          rows={4}
                          value={labSetCreateForm.includedSetIdsText}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreateLabSet} size='md' type='button' variant='solid-fill'>
                        検査セットを追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedLabSet?.id ?? '未選択'}
                      title='検査セットを更新'
                      tone='purple'
                      description='表示順、セット名、検査項目を更新します。'
                    />

                    {selectedLabSet && labSetEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setLabSetEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                          value={labSetEditForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={labSetEditForm.isActive}
                          onChange={(isActive) =>
                            setLabSetEditForm((current) => (current ? { ...current, isActive } : current))
                          }
                        />
                      </Field>
                      <Field label='セット名'>
                        <Input
                          blockSize='md'
                              onChange={(event) =>
                                setLabSetEditForm((current) =>
                                  current ? { ...current, label: event.target.value } : current,
                                )
                              }
                              value={labSetEditForm.label}
                            />
                          </Field>
                          <Field label='検査項目'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setLabSetEditForm((current) =>
                                  current ? { ...current, itemsText: event.target.value } : current,
                                )
                              }
                              rows={5}
                              value={labSetEditForm.itemsText}
                            />
                          </Field>
                          <Field label='含める検査セットID'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setLabSetEditForm((current) =>
                                  current ? { ...current, includedSetIdsText: event.target.value } : current,
                                )
                              }
                              rows={4}
                              value={labSetEditForm.includedSetIdsText}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdateLabSet} size='md' type='button' variant='outline'>
                            検査セットを更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の検査セットを選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'slot' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='予約枠'
                      title='新規予約枠を追加'
                      tone='blue'
                      description='日付、時刻、診療科、担当医、空き状態を登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='予約枠 ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='2026-06-01-0900'
                          value={reservationSlotCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({
                              ...current,
                              sortOrder: event.target.value,
                            }))
                          }
                          type='number'
                          value={reservationSlotCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={reservationSlotCreateForm.isActive}
                          onChange={(isActive) =>
                            setReservationSlotCreateForm((current) => ({ ...current, isActive }))
                          }
                        />
                      </Field>
                      <Field label='日付表示'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({ ...current, date: event.target.value }))
                          }
                          placeholder='2026/06/01（月）'
                          value={reservationSlotCreateForm.date}
                        />
                      </Field>
                      <Field label='時刻'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({ ...current, time: event.target.value }))
                          }
                          placeholder='09:00'
                          value={reservationSlotCreateForm.time}
                        />
                      </Field>
                      <Field label='診療科'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({
                              ...current,
                              department: event.target.value,
                            }))
                          }
                          value={reservationSlotCreateForm.department}
                        />
                      </Field>
                      <Field label='担当医'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({
                              ...current,
                              doctor: event.target.value,
                            }))
                          }
                          value={reservationSlotCreateForm.doctor}
                        />
                      </Field>
                      <Field label='空き状態'>
                        <Select
                          blockSize='md'
                          onChange={(event) =>
                            setReservationSlotCreateForm((current) => ({
                              ...current,
                              state: event.target.value as ReservationSlotCreateFormState['state'],
                            }))
                          }
                          value={reservationSlotCreateForm.state}
                        >
                          <option value='available'>available</option>
                          <option value='few'>few</option>
                          <option value='full'>full</option>
                        </Select>
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreateReservationSlot} size='md' type='button' variant='solid-fill'>
                        予約枠を追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedReservationSlot?.id ?? '未選択'}
                      title='予約枠を更新'
                      tone='purple'
                      description='表示順、日時、診療科、担当医、空き状態を更新します。'
                    />

                    {selectedReservationSlot && reservationSlotEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                          value={reservationSlotEditForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={reservationSlotEditForm.isActive}
                          onChange={(isActive) =>
                            setReservationSlotEditForm((current) =>
                              current ? { ...current, isActive } : current,
                            )
                          }
                        />
                      </Field>
                      <Field label='空き状態'>
                        <Select
                          blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current
                                    ? {
                                        ...current,
                                        state: event.target.value as ReservationSlotEditFormState['state'],
                                      }
                                    : current,
                                )
                              }
                              value={reservationSlotEditForm.state}
                            >
                              <option value='available'>available</option>
                              <option value='few'>few</option>
                              <option value='full'>full</option>
                            </Select>
                          </Field>
                          <Field label='日付表示'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current ? { ...current, date: event.target.value } : current,
                                )
                              }
                              value={reservationSlotEditForm.date}
                            />
                          </Field>
                          <Field label='時刻'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current ? { ...current, time: event.target.value } : current,
                                )
                              }
                              value={reservationSlotEditForm.time}
                            />
                          </Field>
                          <Field label='診療科'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current ? { ...current, department: event.target.value } : current,
                                )
                              }
                              value={reservationSlotEditForm.department}
                            />
                          </Field>
                          <Field label='担当医'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setReservationSlotEditForm((current) =>
                                  current ? { ...current, doctor: event.target.value } : current,
                                )
                              }
                              value={reservationSlotEditForm.doctor}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdateReservationSlot} size='md' type='button' variant='outline'>
                            予約枠を更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象の予約枠を選択してください。' />
                    )}
                  </section>
                </>
              ) : null}

              {managementTab === 'template' ? (
                <>
                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip='テンプレート'
                      title='新規カルテテンプレートを追加'
                      tone='blue'
                      description='診療科別の SOAP 下書きを登録します。'
                    />

                    <div className='mt-4 grid gap-4 md:grid-cols-2'>
                      <Field label='テンプレート ID'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({ ...current, id: event.target.value }))
                          }
                          placeholder='dm-follow-note'
                          value={chartTemplateCreateForm.id}
                        />
                      </Field>
                      <Field label='表示順'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({ ...current, sortOrder: event.target.value }))
                          }
                          type='number'
                          value={chartTemplateCreateForm.sortOrder}
                        />
                      </Field>
                      <Field label='公開状態'>
                        <ActivationSelect
                          isActive={chartTemplateCreateForm.isActive}
                          onChange={(isActive) =>
                            setChartTemplateCreateForm((current) => ({ ...current, isActive }))
                          }
                        />
                      </Field>
                      <Field label='診療科'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({
                              ...current,
                              department: event.target.value,
                            }))
                          }
                          placeholder='内科'
                          value={chartTemplateCreateForm.department}
                        />
                      </Field>
                      <Field label='テンプレート名'>
                        <Input
                          blockSize='md'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({ ...current, label: event.target.value }))
                          }
                          placeholder='糖尿病定期フォロー'
                          value={chartTemplateCreateForm.label}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 grid gap-4'>
                      <Field label='S: 主観的情報'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({
                              ...current,
                              subjective: event.target.value,
                            }))
                          }
                          rows={3}
                          value={chartTemplateCreateForm.subjective}
                        />
                      </Field>
                      <Field label='O: 客観的情報'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({
                              ...current,
                              objective: event.target.value,
                            }))
                          }
                          rows={3}
                          value={chartTemplateCreateForm.objective}
                        />
                      </Field>
                      <Field label='A: 評価'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({
                              ...current,
                              assessment: event.target.value,
                            }))
                          }
                          rows={3}
                          value={chartTemplateCreateForm.assessment}
                        />
                      </Field>
                      <Field label='P: 計画'>
                        <Textarea
                          className='w-full'
                          onChange={(event) =>
                            setChartTemplateCreateForm((current) => ({
                              ...current,
                              plan: event.target.value,
                            }))
                          }
                          rows={3}
                          value={chartTemplateCreateForm.plan}
                        />
                      </Field>
                    </div>

                    <div className='mt-4 flex justify-end'>
                      <Button aria-disabled={isMutating} onClick={handleCreateChartTemplate} size='md' type='button' variant='solid-fill'>
                        テンプレートを追加
                      </Button>
                    </div>
                  </section>

                  <section className={cn(surfaceClassName, 'p-5 lg:p-6')}>
                    <SectionHeader
                      chip={selectedChartTemplate?.id ?? '未選択'}
                      title='カルテテンプレートを更新'
                      tone='purple'
                      description='表示順、診療科、SOAP 下書きを更新します。'
                    />

                    {selectedChartTemplate && chartTemplateEditForm ? (
                      <>
                        <div className='mt-4 grid gap-4 md:grid-cols-2'>
                          <Field label='表示順'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, sortOrder: event.target.value } : current,
                                )
                              }
                              type='number'
                              value={chartTemplateEditForm.sortOrder}
                            />
                          </Field>
                          <Field label='公開状態'>
                            <ActivationSelect
                              isActive={chartTemplateEditForm.isActive}
                              onChange={(isActive) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, isActive } : current,
                                )
                              }
                            />
                          </Field>
                          <Field label='診療科'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, department: event.target.value } : current,
                                )
                              }
                              value={chartTemplateEditForm.department}
                            />
                          </Field>
                          <Field label='テンプレート名'>
                            <Input
                              blockSize='md'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, label: event.target.value } : current,
                                )
                              }
                              value={chartTemplateEditForm.label}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 grid gap-4'>
                          <Field label='S: 主観的情報'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, subjective: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={chartTemplateEditForm.subjective}
                            />
                          </Field>
                          <Field label='O: 客観的情報'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, objective: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={chartTemplateEditForm.objective}
                            />
                          </Field>
                          <Field label='A: 評価'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, assessment: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={chartTemplateEditForm.assessment}
                            />
                          </Field>
                          <Field label='P: 計画'>
                            <Textarea
                              className='w-full'
                              onChange={(event) =>
                                setChartTemplateEditForm((current) =>
                                  current ? { ...current, plan: event.target.value } : current,
                                )
                              }
                              rows={3}
                              value={chartTemplateEditForm.plan}
                            />
                          </Field>
                        </div>

                        <div className='mt-4 flex justify-end'>
                          <Button aria-disabled={isMutating} onClick={handleUpdateChartTemplate} size='md' type='button' variant='outline'>
                            テンプレートを更新
                          </Button>
                        </div>
                      </>
                    ) : (
                      <EmptyState text='更新対象のカルテテンプレートを選択してください。' />
                    )}
                  </section>
                </>
              ) : null}
            </div>
          </div>

          <section className='mt-6 space-y-4'>
            <div className={cn(surfaceClassName, 'p-5 lg:p-6')}>
              <SectionHeader
                chip='system'
                title='設定変更ログ'
                tone='yellow'
                description='利用者マスタとオーダーマスタの変更履歴を直近 20 件表示します。'
              />
              {isLoadingAuditLogs ? <LoadingBanner text='設定変更ログを読み込み中です。' /> : null}
              {auditLogError ? <ErrorBanner text={auditLogError} /> : null}
            </div>
            {!auditLogError && !isLoadingAuditLogs ? (
              <AuditPanel logs={systemAuditLogs} title='設定変更ログ' />
            ) : null}
          </section>
        </>
      )}
    </main>
  );
};

const Field = ({ children, label }: { children: React.ReactNode; label: string }) => (
  <div className='space-y-2'>
    <span className='text-[14px] font-bold leading-none text-solid-gray-700'>{label}</span>
    {children}
  </div>
);

const ActivationSelect = ({
  isActive,
  onChange,
}: {
  isActive: boolean;
  onChange: (isActive: boolean) => void;
}) => (
  <Select blockSize='md' onChange={(event) => onChange(event.target.value === 'active')} value={toActivationValue(isActive)}>
    <option value='active'>有効</option>
    <option value='inactive'>無効</option>
  </Select>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className='flex items-start justify-between gap-3'>
    <dt className='text-[14px] font-normal leading-none text-solid-gray-536'>{label}</dt>
    <dd className='text-right text-[16px] font-normal leading-none text-solid-gray-900'>{value}</dd>
  </div>
);

const SummaryTile = ({ label, value }: { label: string; value: string }) => (
  <div className='rounded-8 border border-solid-gray-200 bg-solid-gray-50 px-4 py-3'>
    <p className='text-[14px] font-normal leading-none text-solid-gray-536'>{label}</p>
    <p className='mt-2 text-[20px] font-bold leading-snug text-solid-gray-900'>{value}</p>
  </div>
);

const LoadingBanner = ({ text }: { text: string }) => (
  <div className='mt-4 rounded-8 border border-blue-100 bg-blue-50 px-4 py-3 text-[14px] font-normal leading-none text-blue-900'>
    {text}
  </div>
);

const ErrorBanner = ({ text }: { text: string }) => (
  <div className='mt-4 rounded-8 border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-normal leading-none text-red-900'>
    {text}
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <p className='mt-4 text-[16px] font-normal leading-none text-solid-gray-700'>{text}</p>
);

const SectionHeader = ({
  title,
  description,
  chip,
  tone,
}: {
  title: string;
  description: string;
  chip: string;
  tone: 'blue' | 'purple' | 'yellow';
}) => (
  <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between'>
    <div>
      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>{title}</p>
      <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{description}</p>
    </div>
    <ChipLabel color={tone} variant='filled-outline'>
      {chip}
    </ChipLabel>
  </div>
);
