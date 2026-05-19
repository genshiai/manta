import { ChipLabel } from '../vendor/dads';
import type { AuditLogEntry } from '../types/workflow';

type AuditPanelProps = {
  logs: AuditLogEntry[];
  title?: string;
};

const scopeColorMap = {
  auth: 'purple',
  patient: 'blue',
  chart: 'green',
  order: 'orange',
  reservation: 'cyan',
  system: 'gray',
  billing: 'yellow',
} as const;

export const AuditPanel = ({ logs, title = '操作ログ' }: AuditPanelProps) => (
  <section className='overflow-hidden rounded-8 border border-solid-gray-200 bg-white'>
    <header className='border-b border-solid-gray-200 bg-white px-4 py-4 lg:px-5'>
      <p className='text-[18px] font-bold leading-snug text-solid-gray-900'>{title}</p>
      <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>参照・更新・認証の直近履歴を保持します。</p>
    </header>
    <div className='divide-y divide-solid-gray-200'>
      {logs.length > 0 ? (
        logs.map((log) => (
          <article className='px-4 py-4 lg:px-5' key={log.id}>
            <div className='flex flex-wrap items-center gap-2'>
              <ChipLabel color={scopeColorMap[log.scope]} variant='filled-outline'>
                {log.scope}
              </ChipLabel>
              <span className='text-mono-14N-150 text-solid-gray-536'>{log.timestamp}</span>
            </div>
            <p className='mt-2 text-[16px] font-bold leading-none text-solid-gray-900'>{log.action}</p>
            <p className='mt-1 text-[16px] font-normal leading-none text-solid-gray-700'>{log.detail}</p>
            <p className='mt-1 text-[14px] font-normal leading-none text-solid-gray-536'>
              実行者: {log.actor}
              {log.patientName ? ` / 患者: ${log.patientName}` : ''}
            </p>
          </article>
        ))
      ) : (
        <div className='px-4 py-8 text-center text-[16px] font-normal leading-none text-solid-gray-536 lg:px-5'>
          まだログはありません。
        </div>
      )}
    </div>
  </section>
);
