import { useEffect, useState } from 'react';
import { Button, ChipLabel, Heading, HeadingTitle, Select, buttonBaseStyle } from '../vendor/dads';
import { departmentOptions, isVisitClosed, receptionStatusColor, type PatientRecord, type ReceptionStatus } from '../data/chartMock';
import { cn } from '../lib/cn';
import { readStorage, writeStorage } from '../lib/storage';

type ReceptionBoardProps = {
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

type SavedReceptionSearch = {
  id: string;
  label: string;
  searchQuery: string;
  statusFilter: ReceptionStatus | 'all';
  departmentFilter: string | 'all';
};

export const ReceptionBoard = ({
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
  const [savedSearches, setSavedSearches] = useState<SavedReceptionSearch[]>([]);

  useEffect(() => {
    setSavedSearches(readStorage<SavedReceptionSearch[]>(savedSearchKey, []));
  }, []);

  useEffect(() => {
    writeStorage(savedSearchKey, savedSearches);
  }, [savedSearches]);

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

  return (
    <div className='mx-auto w-full max-w-[1280px] space-y-4 px-4 py-6 lg:px-6'>
      <section className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <Heading size='28'>
            <HeadingTitle level='h1'>本日の診療キュー</HeadingTitle>
          </Heading>
          <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
            患者をクリックするとAIカルテを開きます · 更新: {lastRefreshedAt}
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

      <section className={cn(surfaceClassName, 'overflow-hidden')}>
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

        <div className='hidden grid-cols-[5rem_7rem_1fr_9rem_8rem_7rem] gap-3 border-b border-solid-gray-200 px-5 py-2 text-[14px] font-normal leading-none text-solid-gray-536 lg:grid lg:px-6'>
          <span>受付</span>
          <span>予約</span>
          <span>患者</span>
          <span>診療科</span>
          <span>状態</span>
          <span>経過</span>
        </div>

        <div className='divide-y divide-solid-gray-200'>
          {patients.map((patient) => (
            <button
              className={cn(
                buttonBaseStyle,
                'grid w-full gap-3 px-5 py-3 text-left transition-colors hover:bg-solid-gray-50 lg:grid-cols-[5rem_7rem_1fr_9rem_8rem_7rem] lg:px-6',
              )}
              key={patient.id}
              onClick={() => onOpenChart(patient.id)}
              type='button'
            >
              <div className='text-[16px] font-bold leading-none text-solid-gray-900'>#{patient.receptionNumber}</div>
              <div>
                <div className='text-mono-14B-150 text-solid-gray-900'>{patient.reservationTime}</div>
                <div className='mt-1 text-mono-14N-150 text-solid-gray-536'>{patient.receptionTime}</div>
              </div>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span className='text-[16px] font-bold leading-none text-solid-gray-900'>{patient.name}</span>
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
              <div className='text-[16px] font-normal leading-none text-solid-gray-700'>{patient.department}</div>
              <div>
                <ChipLabel color={receptionStatusColor[patient.status]} variant='filled-outline'>
                  {patient.status}
                </ChipLabel>
              </div>
              <div>
                <div className='text-[16px] font-bold leading-none text-solid-gray-900'>{patient.elapsed}</div>
                <div className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>{patient.labProgress}</div>
              </div>
            </button>
          ))}
        </div>

        {patients.length === 0 ? (
          <div className='px-5 py-10 text-center lg:px-6'>
            <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>該当する患者がいません</p>
            <p className='mt-2 text-[16px] font-normal leading-none text-solid-gray-536'>
              検索条件か受付状態を見直してください。
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
};
