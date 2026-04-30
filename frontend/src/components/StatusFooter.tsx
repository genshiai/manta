import type { PatientRecord } from '../data/chartMock';
import type { UserSession } from '../types/workflow';

type StatusFooterProps = {
  screen: 'reception' | 'chart' | 'settings';
  currentPatient?: PatientRecord;
  chartMeta: {
    isDirty: boolean;
    lastSavedAt: string | null;
    version: number;
    pendingWarnings: number;
  };
  currentUser: UserSession;
};

export const StatusFooter = ({ screen, currentPatient, chartMeta, currentUser }: StatusFooterProps) => (
  <footer className='border-t border-solid-gray-200 bg-white'>
    <div className='mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3 text-[14px] font-normal leading-none text-solid-gray-536 lg:flex-row lg:items-center lg:justify-between lg:px-6'>
      <div className='flex flex-wrap items-center gap-4'>
        <span className='inline-flex items-center gap-2'>
          <span className='h-2 w-2 rounded-full bg-green-700' />
          接続中
        </span>
        <span>{currentUser.displayName}</span>
        <span className='text-solid-gray-400'>·</span>
        <span>
          {screen === 'reception' ? '本日の診療キュー' : screen === 'chart' ? 'AIカルテ' : '管理設定'}
        </span>
        {screen === 'chart' ? (
          <>
            <span className='text-solid-gray-400'>·</span>
            <span>
              {chartMeta.isDirty
                ? '未保存'
                : `保存済み${chartMeta.lastSavedAt ? ` (${chartMeta.lastSavedAt})` : ''}`}
            </span>
            <span>v{chartMeta.version}</span>
            {chartMeta.pendingWarnings > 0 ? (
              <span className='text-yellow-1000'>警告 {chartMeta.pendingWarnings}件</span>
            ) : null}
          </>
        ) : null}
      </div>
      <div className='flex flex-wrap items-center gap-3 text-solid-gray-700'>
        <span>{currentPatient ? `${currentPatient.name} (${currentPatient.id})` : '患者未選択'}</span>
        {currentPatient?.department ? (
          <>
            <span className='text-solid-gray-400'>·</span>
            <span>{currentPatient.department}</span>
          </>
        ) : null}
      </div>
    </div>
  </footer>
);
