import { useEffect, useState } from 'react';
import { Building2, ClipboardCheck, FileText, History, Siren, Stethoscope, UserRound } from 'lucide-react';
import { Button, ChipLabel, Heading, HeadingTitle, Select, buttonBaseStyle } from '../vendor/dads';
import { departmentOptions, isVisitClosed, receptionStatusColor, type PatientRecord, type ReceptionStatus } from '../data/chartMock';
import { cn } from '../lib/cn';
import { type HomeSettings, type HomeView, homeProfileConfigs, homeViewLabels } from '../lib/homeSettings';
import { readStorage, writeStorage } from '../lib/storage';
import type { UserSession } from '../types/workflow';

type ReceptionBoardProps = {
  currentUser: UserSession;
  homeSettings: HomeSettings;
  patients: PatientRecord[];
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

type SavedReceptionSearch = {
  id: string;
  label: string;
  searchQuery: string;
  statusFilter: ReceptionStatus | 'all';
  departmentFilter: string | 'all';
};

const pendingTypeColor: Record<string, 'yellow' | 'red' | 'blue' | 'gray'> = {
  検査結果: 'yellow',
  再開待ち: 'red',
  患者照合: 'blue',
  確認なし: 'gray',
};

const wardLocations = ['5東 512', '3西 318', 'ICU 02', '6南 607'];
const wardTeams = ['内科Aチーム', '皮膚科', '循環器チーム', '内科Bチーム'];
const emergencyTriage = ['黄', '緑', '黄', '緑'];
const emergencyChiefComplaints = ['胸部圧迫感', '血糖高値', '皮疹増悪', '咳嗽'];

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
  patients,
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
  const [activeView, setActiveView] = useState<HomeView>(homeSettings.defaultView);
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
    emergency: Siren,
    personal: UserRound,
    pending: ClipboardCheck,
    recent: History,
  };
  const [savedSearches, setSavedSearches] = useState<SavedReceptionSearch[]>([]);

  useEffect(() => {
    setSavedSearches(readStorage<SavedReceptionSearch[]>(savedSearchKey, []));
  }, []);

  useEffect(() => {
    setActiveView(profileConfig.views.includes(homeSettings.defaultView) ? homeSettings.defaultView : profileConfig.defaultView);
  }, [homeSettings.defaultView, profileConfig.defaultView, profileConfig.views]);

  useEffect(() => {
    writeStorage(savedSearchKey, savedSearches);
  }, [savedSearches]);

  const personalPatients = patients.filter(
    (patient) => patient.doctor === currentUser.displayName || patient.department === currentUser.department,
  );
  const pendingPatients = patients.filter(
    (patient) =>
      patient.labProgress === '結果到着' ||
      patient.labProgress === '一部結果' ||
      patient.status === '診察一時中断' ||
      patient.sameNameDuplicateCount > 1,
  );
  const activePatients = (() => {
    if (activeView === 'personal') {
      return personalPatients.length > 0 ? personalPatients : patients;
    }
    if (activeView === 'pending') {
      return pendingPatients;
    }
    if (activeView === 'recent') {
      return patients.slice(0, 3);
    }
    if (activeView === 'emergency') {
      return patients.slice(0, 3);
    }

    return patients;
  })();
  const viewCounts: Record<HomeView, number> = {
    outpatient: patients.length,
    inpatient: patients.length,
    emergency: Math.min(3, patients.length),
    personal: personalPatients.length > 0 ? personalPatients.length : patients.length,
    pending: pendingPatients.length,
    recent: Math.min(3, patients.length),
  };
  const isOutpatientView = activeView === 'outpatient';
  const isClinicProfile = homeSettings.profile === 'clinic';
  const headerLabels =
    activeView === 'inpatient'
      ? ['病棟/病室', '患者', '主治医/チーム', '入院日数', '未読', '指示/文書']
      : activeView === 'emergency'
        ? ['到着', 'トリアージ', '患者', '主訴', '状態', '滞在']
        : activeView === 'personal'
          ? ['区分', '患者', '場所/科', '未処理', '最新メモ', '状態']
          : activeView === 'pending'
            ? ['種別', '患者', '場所/科', '未処理', '確認内容', '状態']
            : activeView === 'recent'
              ? ['最終表示', '患者', '場所/科', '最近の文脈', '検査', '状態']
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
  };

  const handleApplySavedSearch = (savedSearch: SavedReceptionSearch) => {
    onSearchChange(savedSearch.searchQuery);
    onStatusFilterChange(savedSearch.statusFilter);
    onDepartmentFilterChange(savedSearch.departmentFilter);
  };

  const handleRemoveSavedSearch = (savedSearchId: string) => {
    setSavedSearches((current) => current.filter((item) => item.id !== savedSearchId));
  };

  const renderPatientIdentity = (patient: PatientRecord) => (
    <div className='min-w-0'>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-[16px] font-bold leading-snug text-solid-gray-900'>{patient.name}</span>
        <span className='text-mono-14N-150 text-solid-gray-536'>{patient.id}</span>
        {patient.sameNameDuplicateCount > 1 ? (
          <ChipLabel color='yellow' variant='filled-outline'>
            同姓同名
          </ChipLabel>
        ) : null}
      </div>
      {patient.alerts.length > 0 ? (
        <div className='mt-1 flex flex-wrap gap-2'>
          {patient.alerts.slice(0, 2).map((alert) => (
            <ChipLabel color={alert.color} key={alert.label} variant='filled-outline'>
              {alert.label}
            </ChipLabel>
          ))}
        </div>
      ) : null}
    </div>
  );

  const renderPatientCells = (patient: PatientRecord, index: number) => {
    const wardLocation = wardLocations[index % wardLocations.length];
    const wardTeam = wardTeams[index % wardTeams.length];
    const stayDays = `${index + 3}日目`;
    const triage = emergencyTriage[index % emergencyTriage.length];
    const chiefComplaint = emergencyChiefComplaints[index % emergencyChiefComplaints.length];
    const pendingLabel =
      patient.labProgress === '結果到着' || patient.labProgress === '一部結果'
        ? '検査結果'
        : patient.sameNameDuplicateCount > 1
          ? '患者照合'
          : patient.status === '診察一時中断'
            ? '再開待ち'
            : '確認なし';

    if (activeView === 'inpatient') {
      return (
        <>
          <div className='text-[15px] font-bold leading-snug text-solid-gray-900'>{wardLocation}</div>
          {renderPatientIdentity(patient)}
          <div>
            <p className='text-[14px] font-bold leading-snug text-solid-gray-900'>{patient.doctor}</p>
            <p className='mt-1 text-[12px] text-solid-gray-536'>{wardTeam}</p>
          </div>
          <div className='text-[14px] font-bold text-solid-gray-900'>{stayDays}</div>
          <div>
            <ChipLabel color={patient.labProgress === '未依頼' ? 'gray' : 'yellow'} variant='filled-outline'>
              {patient.labProgress === '未依頼' ? '未読なし' : patient.labProgress}
            </ChipLabel>
          </div>
          <div className='text-[13px] leading-normal text-solid-gray-700'>指示確認 / 文書確認</div>
        </>
      );
    }

    if (activeView === 'emergency') {
      return (
        <>
          <div>
            <p className='text-mono-14B-150 text-solid-gray-900'>{patient.receptionTime}</p>
            <p className='mt-1 text-[12px] text-solid-gray-536'>到着</p>
          </div>
          <div>
            <ChipLabel color={triage === '黄' ? 'yellow' : 'green'} variant='filled-outline'>
              {triage}
            </ChipLabel>
          </div>
          {renderPatientIdentity(patient)}
          <div className='text-[14px] leading-normal text-solid-gray-700'>{chiefComplaint}</div>
          <div>
            <ChipLabel color={receptionStatusColor[patient.status]} variant='filled-outline'>
              {patient.status}
            </ChipLabel>
          </div>
          <div className='text-[15px] font-bold text-solid-gray-900'>{patient.elapsed}</div>
        </>
      );
    }

    if (activeView === 'personal' || activeView === 'pending' || activeView === 'recent') {
      return (
        <>
          <div className='text-[14px] font-bold leading-snug text-solid-gray-900'>
            {activeView === 'recent' ? patient.elapsed : patient.department}
          </div>
          {renderPatientIdentity(patient)}
          <div>
            <p className='text-[14px] font-bold leading-snug text-solid-gray-900'>{patient.department}</p>
            <p className='mt-1 text-[12px] text-solid-gray-536'>{patient.doctor}</p>
          </div>
          <div>
            <ChipLabel color={pendingTypeColor[pendingLabel] ?? 'gray'} variant='filled-outline'>
              {pendingLabel}
            </ChipLabel>
          </div>
          <div className='line-clamp-2 text-[13px] leading-normal text-solid-gray-700'>{patient.comment}</div>
          <div>
            <ChipLabel color={receptionStatusColor[patient.status]} variant='filled-outline'>
              {patient.status}
            </ChipLabel>
          </div>
        </>
      );
    }

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
        <div>
          <ChipLabel color={receptionStatusColor[patient.status]} variant='filled-outline'>
            {patient.status}
          </ChipLabel>
        </div>
        <div>
          <ChipLabel color={patient.labProgress === '未依頼' ? 'gray' : 'yellow'} variant='filled-outline'>
            {patient.labProgress}
          </ChipLabel>
          {!isClinicProfile ? <p className='mt-1 text-[12px] text-solid-gray-536'>文書確認</p> : null}
        </div>
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
            {profileConfig.label} · {homeViewLabels[activeView]}ワークリスト · 更新: {lastRefreshedAt}
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

      <section className='flex flex-wrap gap-2'>
        {profileConfig.views.map((view) => {
          const Icon = viewIconMap[view];
          return (
            <button
              className={cn(
                buttonBaseStyle,
                'flex items-center gap-2 rounded-8 border px-3 py-2 text-[14px] font-bold leading-none transition-colors',
                activeView === view
                  ? 'border-blue-900 bg-blue-50 text-blue-900'
                  : 'border-solid-gray-200 bg-white text-solid-gray-700 hover:bg-solid-gray-50 hover:text-solid-gray-900',
              )}
              key={view}
              onClick={() => setActiveView(view)}
              type='button'
            >
              <Icon size={15} />
              {homeViewLabels[view]}
              <span className='text-[12px] font-normal text-solid-gray-536'>{viewCounts[view]}</span>
            </button>
          );
        })}
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

        {isLoading ? (
          <div className='border-b border-solid-gray-200 px-5 py-3 text-[14px] font-normal leading-none text-solid-gray-536 lg:px-6'>
            更新中…
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
                <button
                  aria-label={`${savedSearch.label} を削除`}
                  className='px-1 text-[14px] font-normal leading-none text-solid-gray-536 hover:text-solid-gray-900'
                  onClick={() => handleRemoveSavedSearch(savedSearch.id)}
                  type='button'
                >
                  ×
                </button>
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
          {activePatients.map((patient, index) => (
            <button
              className={cn(
                buttonBaseStyle,
                'grid w-full gap-3 px-5 py-3 text-left transition-colors hover:bg-solid-gray-50 lg:px-6',
                worklistGridClassName,
              )}
              key={patient.id}
              onClick={() => onOpenChart(patient.id)}
              type='button'
            >
              {renderPatientCells(patient, index)}
            </button>
          ))}
        </div>

        {activePatients.length === 0 ? (
          <div className='px-5 py-10 text-center lg:px-6'>
            <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>該当する患者がいません</p>
            <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-536'>
              ビュー、検索条件、または受付状態を見直してください。
            </p>
          </div>
        ) : null}
        </section>

        <aside className='space-y-4'>
          <section className='rounded-8 border border-border bg-card p-4'>
            <div className='mb-3 flex items-center gap-2'>
              <ClipboardCheck size={16} className='text-brand' />
              <h2 className='text-[16px] font-bold leading-snug text-text-primary'>自分の未処理</h2>
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
              {patients.slice(0, 3).map((patient) => (
                <button
                  className='w-full rounded-md border border-border bg-surface-subtle px-3 py-2 text-left hover:border-brand'
                  key={patient.id}
                  onClick={() => onOpenChart(patient.id)}
                  type='button'
                >
                  <div className='flex items-baseline justify-between gap-2'>
                    <span className='truncate text-[13px] font-bold text-text-primary'>{patient.name}</span>
                    <span className='text-[11px] text-text-tertiary'>{patient.elapsed}</span>
                  </div>
                  <p className='mt-0.5 truncate text-[12px] text-text-secondary'>
                    {patient.department} ・ {patient.labProgress}
                  </p>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
