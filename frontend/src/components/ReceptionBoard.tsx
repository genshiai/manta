import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BadgeAlert,
  Baby,
  Building2,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  ClipboardCheck,
  FileText,
  FlaskConical,
  HeartPulse,
  Mars,
  ShieldAlert,
  Stethoscope,
  UserCheck,
  UserRound,
  Venus,
  SearchX,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button, Heading, HeadingTitle, Select, buttonBaseStyle } from '../vendor/dads';
import { EmptyState } from './patterns/empty-state';
import { Skeleton } from './ui/skeleton';
import { toast } from './ui/toast';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { isVisitClosed, type AlertItem, type LabProgress, type PatientRecord, type ReceptionStatus } from '../data/chartMock';
import { cn } from '../lib/cn';
import { type HomeSettings, type HomeView, homeProfileConfigs, homeViewLabels } from '../lib/homeSettings';
import { readStorage, writeStorage } from '../lib/storage';
import type { InpatientAdmission, UserSession } from '../types/workflow';

type ReceptionBoardProps = {
  currentUser: UserSession;
  homeSettings: HomeSettings;
  inpatientAdmissions: InpatientAdmission[];
  patients: PatientRecord[];
  recentPatients: PatientRecord[];
  searchQuery: string;
  statusFilter: ReceptionStatus | 'all';
  departmentFilter: string | 'all';
  sortKey: 'receptionNumber' | 'reservationTime' | 'elapsed';
  lastRefreshedAt: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: ReceptionStatus | 'all') => void;
  onDepartmentFilterChange: (value: string | 'all') => void;
  onSortChange: (value: 'receptionNumber' | 'reservationTime' | 'elapsed') => void;
  onOpenChart: (patientId: string) => void;
};

const surfaceClassName = 'rounded-8 border border-solid-gray-200 bg-white';
const savedSearchKey = 'manta-reception-saved-searches';
const worklistGridClassName = 'lg:grid-cols-[7.5rem_minmax(12rem,1.35fr)_10rem_8.5rem_minmax(9rem,1fr)_7rem]';
const pressableControlClassName =
  'cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-out hover:-translate-y-px hover:border-blue-300 hover:shadow-sm active:translate-y-0 active:shadow-none';
const pressableRowClassName =
  'cursor-pointer transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:bg-solid-gray-50 hover:shadow-sm active:translate-y-0 active:shadow-none';

type SavedReceptionSearch = {
  id: string;
  label: string;
  searchQuery: string;
  statusFilter: ReceptionStatus | 'all';
  departmentFilter: string | 'all';
};

type WorkScope = 'all' | 'assigned' | 'department';

type BadgeTone =
  | 'identity'
  | 'safety'
  | 'condition'
  | 'lab'
  | 'muted'
  | 'progress'
  | 'done'
  | 'paused'
  | 'active';

const badgeToneClasses: Record<BadgeTone, string> = {
  identity: 'border-yellow-400 bg-yellow-50 text-yellow-1100 ring-1 ring-yellow-100',
  safety: 'border-red-300 bg-red-50 text-red-1000 ring-1 ring-red-100',
  condition: 'border-blue-200 bg-blue-50 text-blue-900 ring-1 ring-blue-100',
  lab: 'border-purple-200 bg-purple-50 text-purple-1000 ring-1 ring-purple-100',
  muted: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-800',
  progress: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  done: 'border-green-200 bg-green-50 text-green-900',
  paused: 'border-red-200 bg-red-50 text-red-1000',
  active: 'border-blue-200 bg-blue-50 text-blue-900',
};

const WorkBadge = ({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: BadgeTone;
}) => (
  <span
    className={cn(
      'inline-flex min-h-7 items-center gap-1 rounded-md border px-2 py-1 text-[12px] font-bold leading-none',
      badgeToneClasses[tone],
    )}
  >
    <Icon size={13} strokeWidth={2.4} />
    <span>{label}</span>
  </span>
);

const parseAgeValue = (age: string) => {
  const matched = age.match(/\d+/);
  return matched ? Number(matched[0]) : null;
};

const patientAgeIcon = (age: string): LucideIcon => {
  const ageValue = parseAgeValue(age);
  if (ageValue !== null && ageValue < 15) return Baby;
  if (ageValue !== null && ageValue >= 65) return UserCheck;
  return UserRound;
};

const PatientDemographicIcon = ({ patient }: { patient: PatientRecord }) => {
  const AgeIcon = patientAgeIcon(patient.age);
  const SexIcon = patient.sex === '男性' ? Mars : Venus;
  const sexClassName = patient.sex === '男性'
    ? 'border-blue-200 bg-blue-50 text-blue-900'
    : 'border-magenta-200 bg-magenta-50 text-magenta-900';

  return (
    <span
      className={cn(
        'relative inline-grid size-9 shrink-0 place-items-center rounded-full border',
        sexClassName,
      )}
      title={`${patient.age} ${patient.sex}`}
    >
      <AgeIcon size={19} strokeWidth={2.2} />
      <span className='absolute -bottom-1 -right-1 inline-grid size-4 place-items-center rounded-full border border-white bg-white shadow-sm'>
        <SexIcon size={11} strokeWidth={2.4} />
      </span>
    </span>
  );
};

const classifyAlert = (alert: AlertItem): { icon: LucideIcon; tone: BadgeTone } => {
  if (
    alert.label.includes('アレルギー') ||
    alert.label.includes('副反応') ||
    alert.label.includes('ラテックス') ||
    alert.label.includes('妊娠')
  ) {
    return { icon: ShieldAlert, tone: 'safety' };
  }

  return { icon: HeartPulse, tone: 'condition' };
};

const statusBadgeConfig: Record<ReceptionStatus, { icon: LucideIcon; tone: BadgeTone }> = {
  未受付: { icon: CircleDashed, tone: 'muted' },
  来院済: { icon: UserCheck, tone: 'active' },
  問診中: { icon: CircleDot, tone: 'progress' },
  問診済: { icon: CheckCircle2, tone: 'done' },
  到着済: { icon: UserCheck, tone: 'active' },
  診察中: { icon: Stethoscope, tone: 'progress' },
  診察終了: { icon: CheckCircle2, tone: 'done' },
  診察一時中断: { icon: AlertTriangle, tone: 'paused' },
  会計済: { icon: CheckCircle2, tone: 'muted' },
};

const labBadgeConfig: Record<LabProgress, { icon: LucideIcon; tone: BadgeTone; label: string }> = {
  未依頼: { icon: CircleDashed, tone: 'muted', label: '検査なし' },
  依頼中: { icon: FlaskConical, tone: 'active', label: '検査依頼中' },
  一部結果: { icon: FlaskConical, tone: 'progress', label: '一部結果' },
  結果到着: { icon: FlaskConical, tone: 'lab', label: '結果到着' },
};

const SidebarItem = ({ title, meta, body }: { title: string; meta: string; body: string }) => (
  <div className='rounded-md border border-border bg-surface-subtle px-3 py-2.5'>
    <div className='flex items-baseline justify-between gap-2'>
      <p className='truncate text-[13px] font-bold text-text-primary'>{title}</p>
      <span className='shrink-0 text-[11px] text-text-tertiary'>{meta}</span>
    </div>
    <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{body}</p>
  </div>
);

export const ReceptionBoard = ({
  currentUser,
  homeSettings,
  inpatientAdmissions,
  patients,
  recentPatients,
  searchQuery,
  statusFilter,
  departmentFilter,
  sortKey,
  lastRefreshedAt,
  isLoading = false,
  errorMessage = null,
  onSearchChange,
  onStatusFilterChange,
  onDepartmentFilterChange,
  onSortChange,
  onOpenChart,
}: ReceptionBoardProps) => {
  const waitingCount = patients.filter((patient) => !isVisitClosed(patient.status)).length;
  const completedCount = patients.length - waitingCount;
  const resultReviewCount = patients.filter((patient) =>
    patient.labProgress === '結果到着' || patient.labProgress === '一部結果'
  ).length;
  const sameNameReviewCount = patients.filter((patient) => patient.sameNameDuplicateCount > 1).length;
  const interruptedCount = patients.filter((patient) => patient.status === '診察一時中断').length;
  const profileConfig = homeProfileConfigs[homeSettings.profile];
  // 診療科フィルタの選択肢は実際の患者一覧から導出する（モック患者由来にしない）。
  // フィルタ適用中は patients が絞られるため、選択中の値も必ず候補に含める。
  const departmentOptions = Array.from(
    new Set([
      ...patients.map((patient) => patient.department),
      ...(departmentFilter !== 'all' ? [departmentFilter] : []),
    ]),
  ).sort();
  const [activeView, setActiveView] = useState<HomeView>(homeSettings.defaultView);
  const [workScope, setWorkScope] = useState<WorkScope>(homeSettings.profile === 'personal' ? 'assigned' : 'all');
  const [pendingOnly, setPendingOnly] = useState(false);
  const pendingItems = [
    resultReviewCount > 0
      ? {
          type: '検査',
          title: '未読検査結果',
          meta: `${resultReviewCount}件`,
          body: '結果到着・一部結果の患者を確認します。',
        }
      : null,
    interruptedCount > 0
      ? {
          type: '中断',
          title: '診察一時中断',
          meta: `${interruptedCount}件`,
          body: '中断中の診療を再開または引き継ぎます。',
        }
      : null,
    sameNameReviewCount > 0
      ? {
          type: '照合',
          title: '同姓同名確認',
          meta: `${sameNameReviewCount}名`,
          body: '患者取り違え防止のため、ID と生年月日を確認します。',
        }
      : null,
  ].filter((item): item is { type: string; title: string; meta: string; body: string } => Boolean(item));
  const viewIconMap = {
    outpatient: Stethoscope,
    inpatient: Building2,
  };
  const [savedSearches, setSavedSearches] = useState<SavedReceptionSearch[]>([]);

  useEffect(() => {
    setSavedSearches(readStorage<SavedReceptionSearch[]>(savedSearchKey, []));
  }, []);

  useEffect(() => {
    setActiveView(profileConfig.views.includes(homeSettings.defaultView) ? homeSettings.defaultView : profileConfig.defaultView);
  }, [homeSettings.defaultView, profileConfig.defaultView, profileConfig.views]);

  useEffect(() => {
    setWorkScope(homeSettings.profile === 'personal' ? 'assigned' : 'all');
    setPendingOnly(false);
  }, [homeSettings.profile]);

  useEffect(() => {
    writeStorage(savedSearchKey, savedSearches);
  }, [savedSearches]);

  const pendingPatients = patients.filter(
    (patient) =>
      patient.labProgress === '結果到着' ||
      patient.labProgress === '一部結果' ||
      patient.status === '診察一時中断' ||
      patient.sameNameDuplicateCount > 1,
  );
  const modePatients = patients;
  const assignedModePatients = modePatients.filter((patient) => patient.doctor === currentUser.displayName);
  const departmentModePatients = modePatients.filter((patient) => patient.department === currentUser.department);
  const scopedPatients =
    workScope === 'assigned'
      ? assignedModePatients
      : workScope === 'department'
        ? departmentModePatients
        : modePatients;
  const activePatients = pendingOnly
    ? scopedPatients.filter((patient) => pendingPatients.some((pendingPatient) => pendingPatient.id === patient.id))
    : scopedPatients;
  const viewCounts: Record<HomeView, number> = {
    outpatient: patients.length,
    inpatient: inpatientAdmissions.length,
  };
  const scopeOptions: Array<{ value: WorkScope; label: string; count: number }> = [
    { value: 'all', label: '全体', count: modePatients.length },
    { value: 'assigned', label: '自分の担当', count: assignedModePatients.length },
    { value: 'department', label: '同じ診療科', count: departmentModePatients.length },
  ];
  const isOutpatientView = activeView === 'outpatient';
  const activeInpatientAdmissions = inpatientAdmissions.filter((admission) => {
    if (workScope === 'assigned' && admission.attendingDoctor !== currentUser.displayName) {
      return false;
    }
    if (workScope === 'department' && admission.wardName && !admission.wardName.includes(currentUser.department)) {
      return admission.team?.includes(currentUser.department) ?? false;
    }
    if (pendingOnly) {
      return admission.pendingInstructionCount > 0;
    }
    return true;
  });
  const isClinicProfile = homeSettings.profile === 'clinic';
  const headerLabels =
    activeView === 'inpatient'
      ? ['病棟/病室', '患者', '主治医/チーム', '入院日数', '未読', '指示/文書']
      : isClinicProfile
        ? ['時刻', '患者', '年齢/性別', '状態', '検査', 'メモ']
        : ['時刻', '患者', '診療科/担当', '状態', '検査/文書', 'メモ'];

  const createSearchLabel = () => {
    const parts = [
      searchQuery ? `検索:${searchQuery}` : '全件',
      statusFilter === 'all' ? null : statusFilter,
      departmentFilter === 'all' ? null : departmentFilter,
    ].filter(Boolean);

    return parts.join(' / ');
  };

  const handleSaveCurrentSearch = () => {
    const label = createSearchLabel();

    setSavedSearches((current) => [
      {
        id: `${Date.now()}`,
        label,
        searchQuery,
        statusFilter,
        departmentFilter,
      },
      ...current.filter((item) => item.label !== label).slice(0, 4),
    ]);
    toast(`「${label}」を条件として保存しました。`, 'success');
  };

  const handleApplySavedSearch = (savedSearch: SavedReceptionSearch) => {
    onSearchChange(savedSearch.searchQuery);
    onStatusFilterChange(savedSearch.statusFilter);
    onDepartmentFilterChange(savedSearch.departmentFilter);
  };

  const handleRemoveSavedSearch = (savedSearchId: string, label: string) => {
    setSavedSearches((current) => current.filter((item) => item.id !== savedSearchId));
    toast(`「${label}」を削除しました。`);
  };

  const renderStatusBadge = (status: ReceptionStatus) => {
    const config = statusBadgeConfig[status];

    return <WorkBadge icon={config.icon} label={status} tone={config.tone} />;
  };

  const renderLabBadge = (labProgress: LabProgress) => {
    const config = labBadgeConfig[labProgress];

    return <WorkBadge icon={config.icon} label={config.label} tone={config.tone} />;
  };

  const renderPatientIdentity = (patient: PatientRecord) => (
    <div className='flex min-w-0 items-start gap-2.5'>
      <PatientDemographicIcon patient={patient} />
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-[16px] font-bold leading-snug text-solid-gray-900'>{patient.name}</span>
          <span className='text-mono-14N-150 text-solid-gray-536'>{patient.id}</span>
          <span className='rounded-full border border-solid-gray-200 bg-solid-gray-50 px-2 py-0.5 text-[11px] font-bold text-solid-gray-700'>
            {patient.age} {patient.sex}
          </span>
          {patient.sameNameDuplicateCount > 1 ? (
            <WorkBadge icon={BadgeAlert} label='同姓同名' tone='identity' />
          ) : null}
        </div>
        {patient.alerts.length > 0 ? (
          <div className='mt-1 flex flex-wrap gap-2'>
            {patient.alerts.slice(0, 2).map((alert) => {
              const alertBadge = classifyAlert(alert);

              return (
                <WorkBadge
                  icon={alertBadge.icon}
                  key={alert.label}
                  label={alert.label}
                  tone={alertBadge.tone}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );

  const renderInpatientCells = (admission: InpatientAdmission) => (
    <>
      <div>
        <div className='text-[15px] font-bold leading-snug text-solid-gray-900'>
          {admission.wardName ?? '病棟未定'}
        </div>
        <p className='mt-1 text-[12px] text-solid-gray-536'>{admission.bedLabel ?? '病床未定'}</p>
      </div>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-[16px] font-bold leading-snug text-solid-gray-900'>{admission.patientName}</span>
          <span className='text-mono-14N-150 text-solid-gray-536'>{admission.patientId}</span>
        </div>
        <p className='mt-1 text-[12px] text-solid-gray-536'>
          {admission.age} / {admission.sex} · {admission.primaryDiagnosis ?? '主病名未設定'}
        </p>
      </div>
      <div>
        <p className='text-[14px] font-bold leading-snug text-solid-gray-900'>{admission.attendingDoctor}</p>
        <p className='mt-1 text-[12px] text-solid-gray-536'>{admission.team ?? 'チーム未設定'}</p>
      </div>
      <div>
        <p className='text-[14px] font-bold text-solid-gray-900'>{admission.stayDays}日目</p>
        <p className='mt-1 text-[12px] text-solid-gray-536'>{admission.careLevel ?? '一般'}</p>
      </div>
      <div>
        {admission.pendingInstructionCount > 0 ? (
          <WorkBadge icon={ClipboardCheck} label={`未実施 ${admission.pendingInstructionCount}`} tone='progress' />
        ) : (
          <WorkBadge icon={CheckCircle2} label='未実施なし' tone='done' />
        )}
      </div>
      <div className='text-[13px] leading-normal text-solid-gray-700'>
        {admission.latestNursingFocus ? (
          <>
            <p className='font-bold text-solid-gray-900'>{admission.latestNursingFocus}</p>
            <p className='mt-1 line-clamp-2'>{admission.latestNursingAssessment}</p>
          </>
        ) : (
          '看護記録なし'
        )}
      </div>
    </>
  );

  const renderPatientCells = (patient: PatientRecord) => {
    return (
      <>
        <div>
          <p className='text-mono-14B-150 text-solid-gray-900'>{patient.reservationTime}</p>
          <p className='mt-1 text-mono-14N-150 text-solid-gray-536'>{patient.receptionTime}</p>
        </div>
        {renderPatientIdentity(patient)}
        <div>
          <p className='text-[14px] font-bold leading-snug text-solid-gray-900'>
            {isClinicProfile ? `${patient.age} / ${patient.sex}` : patient.department}
          </p>
          <p className='mt-1 text-[12px] text-solid-gray-536'>{isClinicProfile ? patient.department : patient.doctor}</p>
        </div>
        <div>{renderStatusBadge(patient.status)}</div>
        <div>{renderLabBadge(patient.labProgress)}</div>
        <div className='line-clamp-2 text-[13px] leading-normal text-solid-gray-700'>{patient.comment}</div>
      </>
    );
  };

  return (
    <div className='mx-auto w-full max-w-[1280px] space-y-5 px-4 py-6 lg:px-6'>
      <section className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <Heading size='28'>
            <HeadingTitle level='h1'>ホーム</HeadingTitle>
          </Heading>
          <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
            {profileConfig.label} · {homeViewLabels[activeView]}患者群 · 更新: {lastRefreshedAt}
          </p>
        </div>
        <div className='flex items-center gap-4 text-[14px] font-normal leading-none text-solid-gray-536'>
          <span>全{patients.length}</span>
          <span className='text-solid-gray-400'>·</span>
          <span>進行中 {waitingCount}</span>
          <span className='text-solid-gray-400'>·</span>
          <span>終了 {completedCount}</span>
        </div>
      </section>

      <section className='rounded-8 border border-solid-gray-200 bg-white p-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-[13px] font-bold text-solid-gray-700'>患者群</span>
            {profileConfig.views.length > 1 ? (
              <div className='inline-flex rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-1'>
                {profileConfig.views.map((view) => {
                  const Icon = viewIconMap[view];
                  return (
                    <button
                      className={cn(
                        buttonBaseStyle,
                        pressableControlClassName,
                        'flex items-center gap-1.5 rounded-md border border-transparent px-3 py-1.5 text-[13px] font-bold leading-none',
                        activeView === view
                          ? 'bg-white text-blue-900 shadow-sm'
                          : 'text-solid-gray-700 hover:text-solid-gray-900',
                      )}
                      aria-pressed={activeView === view}
                      key={view}
                      onClick={() => setActiveView(view)}
                      type='button'
                    >
                      <Icon size={14} />
                      {homeViewLabels[view]}
                      <span className='text-[11px] font-normal text-solid-gray-536'>{viewCounts[view]}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className='inline-flex cursor-default select-none items-center gap-1.5 rounded-md border border-solid-gray-200 bg-solid-gray-50 px-3 py-2 text-[13px] font-bold text-solid-gray-800'>
                {(() => {
                  const Icon = viewIconMap[activeView];
                  return <Icon size={14} />;
                })()}
                {homeViewLabels[activeView]}
              </span>
            )}
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-[13px] font-bold text-solid-gray-700'>スコープ</span>
            <div className='inline-flex rounded-8 border border-solid-gray-200 bg-solid-gray-50 p-1'>
              {scopeOptions.map((scope) => (
                <button
                  className={cn(
                    buttonBaseStyle,
                    pressableControlClassName,
                    'rounded-md border border-transparent px-3 py-1.5 text-[13px] font-bold leading-none',
                    workScope === scope.value
                      ? 'bg-white text-blue-900 shadow-sm'
                      : 'text-solid-gray-700 hover:text-solid-gray-900',
                  )}
                  aria-pressed={workScope === scope.value}
                  key={scope.value}
                  onClick={() => setWorkScope(scope.value)}
                  type='button'
                >
                  {scope.label}
                  <span className='ml-1 text-[11px] font-normal text-solid-gray-536'>{scope.count}</span>
                </button>
              ))}
            </div>
            <button
              className={cn(
                buttonBaseStyle,
                pressableControlClassName,
                'flex items-center gap-1.5 rounded-8 border px-3 py-2 text-[13px] font-bold leading-none',
                pendingOnly
                  ? 'border-blue-900 bg-blue-50 text-blue-900'
                  : 'border-solid-gray-200 bg-white text-solid-gray-700 hover:bg-solid-gray-50',
              )}
              aria-pressed={pendingOnly}
              onClick={() => setPendingOnly((current) => !current)}
              type='button'
            >
              <ClipboardCheck size={14} />
              未処理のみ
              <span className='text-[11px] font-normal text-solid-gray-536'>{pendingPatients.length}</span>
            </button>
          </div>
        </div>
      </section>

      <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]'>
        <section className={cn(surfaceClassName, 'overflow-hidden')}>
          <div className='flex items-center justify-between gap-3 border-b border-solid-gray-200 px-5 py-4 lg:px-6'>
            <div>
              <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>患者ワークリスト</h2>
              <p className='mt-1 text-[13px] text-solid-gray-536'>
                {profileConfig.description}
              </p>
            </div>
          </div>
        {isOutpatientView ? (
          <div className='grid gap-3 border-b border-solid-gray-200 bg-white px-5 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:px-6'>
          <Select
            aria-label='受付状態で絞り込む'
            blockSize='md'
            onChange={(event) =>
              onStatusFilterChange(event.target.value as ReceptionStatus | 'all')
            }
            value={statusFilter}
          >
            <option value='all'>すべての受付状態</option>
            <option value='未受付'>未受付</option>
            <option value='来院済'>来院済</option>
            <option value='問診中'>問診中</option>
            <option value='問診済'>問診済</option>
            <option value='到着済'>到着済</option>
            <option value='診察中'>診察中</option>
            <option value='診察終了'>診察終了</option>
            <option value='診察一時中断'>診察一時中断</option>
            <option value='会計済'>会計済</option>
          </Select>

          <Select
            aria-label='診療科で絞り込む'
            blockSize='md'
            onChange={(event) => onDepartmentFilterChange(event.target.value)}
            value={departmentFilter}
          >
            <option value='all'>すべての診療科</option>
            {departmentOptions.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </Select>

          <Select
            aria-label='並び順を変更する'
            blockSize='md'
            onChange={(event) =>
              onSortChange(event.target.value as 'receptionNumber' | 'reservationTime' | 'elapsed')
            }
            value={sortKey}
          >
            <option value='receptionNumber'>受付番号順</option>
            <option value='reservationTime'>予約時間順</option>
            <option value='elapsed'>経過時間順</option>
          </Select>

          <div className='flex items-center gap-2'>
            <Button onClick={handleSaveCurrentSearch} size='xs' type='button' variant='outline'>
              条件を保存
            </Button>
            <Button
              onClick={() => {
                onSearchChange('');
                onStatusFilterChange('all');
                onDepartmentFilterChange('all');
                onSortChange('receptionNumber');
              }}
              size='xs'
              type='button'
              variant='text'
            >
              クリア
            </Button>
          </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div className='border-b border-red-200 bg-red-50 px-5 py-3 text-[14px] font-normal leading-none text-red-900 lg:px-6'>
            {errorMessage}
          </div>
        ) : null}

        {savedSearches.length > 0 ? (
          <div className='flex flex-wrap items-center gap-2 border-b border-solid-gray-200 px-5 py-3 lg:px-6'>
            <span className='text-[14px] font-normal leading-none text-solid-gray-536'>保存済み</span>
            {savedSearches.map((savedSearch) => (
              <div
                className='flex items-center gap-1 rounded-8 border border-solid-gray-200 bg-white px-2 py-1'
                key={savedSearch.id}
              >
                <button
                  className='text-[14px] font-bold leading-none text-blue-900 hover:underline'
                  onClick={() => handleApplySavedSearch(savedSearch)}
                  type='button'
                >
                  {savedSearch.label}
                </button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label={`${savedSearch.label} を削除`}
                      className='grid size-5 flex-none place-items-center rounded text-text-tertiary transition-colors hover:bg-surface-muted hover:text-text-primary'
                      onClick={() => handleRemoveSavedSearch(savedSearch.id, savedSearch.label)}
                      type='button'
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>削除</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        ) : null}

        <div className={cn('hidden gap-3 border-b border-solid-gray-200 px-5 py-2 text-[13px] font-normal leading-none text-solid-gray-536 lg:grid lg:px-6', worklistGridClassName)}>
          {headerLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className='divide-y divide-solid-gray-200'>
          {activeView === 'inpatient'
            ? activeInpatientAdmissions.map((admission) => (
                <button
                  className={cn(
                    buttonBaseStyle,
                    pressableRowClassName,
                    'grid w-full gap-3 px-5 py-3 text-left lg:px-6',
                    worklistGridClassName,
                  )}
                  key={admission.id}
                  onClick={() => onOpenChart(admission.patientId)}
                  type='button'
                >
                  {renderInpatientCells(admission)}
                </button>
              ))
            : activePatients.map((patient) => (
                <button
                  className={cn(
                    buttonBaseStyle,
                    pressableRowClassName,
                    'grid w-full gap-3 px-5 py-3 text-left lg:px-6',
                    worklistGridClassName,
                  )}
                  key={patient.id}
                  onClick={() => onOpenChart(patient.id)}
                  type='button'
                >
                  {renderPatientCells(patient)}
                </button>
              ))}
        </div>

        {(activeView === 'inpatient' ? activeInpatientAdmissions.length === 0 : activePatients.length === 0) ? (
          isLoading ? (
            <div className='flex flex-col'>
              {['s1', 's2', 's3', 's4', 's5', 's6'].map((key) => (
                <div
                  className='flex items-center gap-3 border-b border-border px-5 py-3.5 lg:px-6'
                  key={key}
                >
                  <Skeleton className='size-8 flex-none rounded-full bg-surface-muted' />
                  <Skeleton className='h-3.5 w-32 bg-surface-muted' />
                  <Skeleton className='h-3.5 w-20 bg-surface-muted' />
                  <Skeleton className='ms-auto h-3.5 w-16 bg-surface-muted' />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className='py-12'
              description='患者群・スコープ・フィルタ・受付状態のいずれかを見直してください。'
              icon={SearchX}
              title='該当する患者がいません'
            />
          )
        ) : null}
        </section>

        <aside className='space-y-4'>
          <section className='rounded-8 border border-border bg-card p-4'>
            <div className='mb-3 flex items-start gap-2'>
              <ClipboardCheck size={16} className='mt-0.5 text-brand' />
              <div>
                <h2 className='text-[16px] font-bold leading-snug text-text-primary'>自分の未処理</h2>
                <p className='mt-1 text-[12px] leading-normal text-text-tertiary'>
                  確認、説明、署名、再開が必要なもの
                </p>
              </div>
            </div>
            {pendingItems.length > 0 ? (
              <div className='space-y-2'>
                {pendingItems.map((item) => (
                  <SidebarItem body={item.body} key={item.title} meta={item.meta} title={item.title} />
                ))}
              </div>
            ) : (
              <p className='rounded-md border border-border bg-surface-subtle px-3 py-2.5 text-[13px] text-text-secondary'>
                いま表示できる未処理はありません。
              </p>
            )}
          </section>

          <section className='rounded-8 border border-border bg-card p-4'>
            <div className='mb-3 flex items-center gap-2'>
              <FileText size={16} className='text-brand' />
              <h2 className='text-[16px] font-bold leading-snug text-text-primary'>最近開いたカルテ</h2>
            </div>
            <div className='space-y-2'>
              {recentPatients.length === 0 ? (
                <p className='rounded-md border border-dashed border-border px-3 py-4 text-center text-[12px] text-text-tertiary'>
                  まだカルテを開いていません
                </p>
              ) : (
                recentPatients.slice(0, 3).map((patient) => (
                  <button
                    className='w-full cursor-pointer rounded-md border border-border bg-surface-subtle px-3 py-2 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-brand hover:bg-white hover:shadow-sm active:translate-y-0 active:shadow-none'
                    key={patient.id}
                    onClick={() => onOpenChart(patient.id)}
                    type='button'
                  >
                    <div className='flex items-baseline justify-between gap-2'>
                      <span className='truncate text-[13px] font-bold text-text-primary'>{patient.name}</span>
                      <span className='text-[11px] text-text-tertiary'>{patient.department}</span>
                    </div>
                    <div className='mt-1 flex flex-wrap items-center gap-2'>
                      <span className='text-[12px] text-text-secondary'>{patient.kana}</span>
                      {renderLabBadge(patient.labProgress)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
