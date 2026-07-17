import { Search } from 'lucide-react';
import type { PatientRecord } from '../../data/chartMock';
import type { CommunicationThread, InpatientAdmission } from '../../types/workflow';
import { cn } from '../ui/utils';

export type WorkspaceScreen = 'reception' | 'ward' | 'billing' | 'messages' | 'settings';
export type SettingsSection = 'users' | 'rxset' | 'labset' | 'slot' | 'template' | 'claimRule' | 'orca' | 'audit';

type WorkspaceContextPaneProps = {
  screen: WorkspaceScreen;
  patients: PatientRecord[];
  admissions: InpatientAdmission[];
  communicationThreads: CommunicationThread[];
  activePatientId?: string;
  activeThreadId?: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onOpenChart: (patientId: string) => void;
  onOpenThread: (threadId: string) => void;
  activeSettingsSection?: SettingsSection;
  onSettingsSectionChange?: (section: SettingsSection) => void;
};

const screenCopy: Record<WorkspaceScreen, { eyebrow: string; title: string; placeholder: string }> = {
  reception: {
    eyebrow: '外来ワークスペース',
    title: '今日の患者',
    placeholder: '患者・ID・診療内容',
  },
  ward: {
    eyebrow: '病棟ワークスペース — 医師',
    title: '入院担当患者',
    placeholder: '患者・病棟を検索',
  },
  billing: {
    eyebrow: '医事ワークスペース',
    title: '点検キュー',
    placeholder: '患者・請求を検索',
  },
  messages: {
    eyebrow: '連絡 — 院内のみ · PHI は外に出ません',
    title: 'スレッド',
    placeholder: 'スレッド・患者を検索',
  },
  settings: {
    eyebrow: '設定',
    title: '管理',
    placeholder: '設定を検索',
  },
};

const isClosed = (status: PatientRecord['status']) =>
  status === '診察終了' || status === '会計済';

function patientState(patient: PatientRecord) {
  if (patient.sameNameDuplicateCount > 1) return '同姓同名 — ID照合';
  if (patient.labProgress === '結果到着') return '診察可 · 結果到着';
  if (patient.labProgress === '一部結果') return '一部結果';
  if (patient.status === '診察一時中断') return '診察一時中断';
  return patient.status;
}

function PatientRow({
  patient,
  active,
  onOpen,
}: {
  patient: PatientRecord;
  active: boolean;
  onOpen: () => void;
}) {
  const safety = patient.sameNameDuplicateCount > 1;
  const actionable =
    patient.labProgress === '結果到着' ||
    patient.status === '診察中' ||
    patient.status === '診察一時中断';
  const avatarTone = patient.sex === '男性'
    ? 'border-[#d8e8f0] bg-[#f1f7fa] text-[#4f7485] dark:border-[#3a5662] dark:bg-[#24343b] dark:text-[#a8cad8]'
    : 'border-[#efdde2] bg-[#fbf3f5] text-[#865b68] dark:border-[#65444e] dark:bg-[#38262c] dark:text-[#dfb2be]';

  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative grid w-full grid-cols-[30px_minmax(0,1fr)_auto] gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-brand-tint' : 'hover:bg-surface-subtle',
      )}
      onClick={onOpen}
      type="button"
    >
      {active ? <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-brand" /> : null}
      <span
        role="img"
        aria-label={`${patient.sex}患者`}
        className={cn(
          'mt-px grid size-[30px] place-items-center rounded-full border text-[12px] font-bold',
          avatarTone,
          active && 'ring-2 ring-brand/15',
        )}
      >
        {patient.name.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className={cn('block truncate text-[13px] font-semibold leading-[1.45]', isClosed(patient.status) && 'font-medium text-text-secondary')}>
          {patient.name}
        </span>
        <span className="block truncate text-[11px] leading-[1.5] text-text-tertiary">
          {patient.age} · {patient.sex} · {patient.department}
        </span>
        <span
          className={cn(
            'mt-0.5 block truncate text-[11px] font-medium leading-[1.5] text-text-secondary',
            safety && 'text-destructive',
            actionable && !safety && 'text-brand',
            isClosed(patient.status) && 'font-normal text-text-tertiary',
          )}
        >
          {!isClosed(patient.status) ? <span className="me-1 inline-block size-1 rounded-full bg-current align-[2px]" /> : null}
          {patientState(patient)}
        </span>
      </span>
      <span className="mt-0.5 text-[11px] text-text-tertiary tabular-nums">{patient.reservationTime}</span>
    </button>
  );
}

function AdmissionRow({ admission, active, onOpen }: { admission: InpatientAdmission; active: boolean; onOpen: () => void }) {
  const wardShort = (admission.wardName ?? '').replace('病棟', '');
  const room = wardShort === 'ICU'
    ? (admission.bedLabel ?? 'ICU-2').replace(/-0(\d)$/, '-$1')
    : admission.bedLabel?.split('-')[0] ?? '未定';
  const avatarTone = admission.sex === '男性'
    ? 'border-[#d8e8f0] bg-[#f1f7fa] text-[#4f7485] dark:border-[#3a5662] dark:bg-[#24343b] dark:text-[#a8cad8]'
    : 'border-[#efdde2] bg-[#fbf3f5] text-[#865b68] dark:border-[#65444e] dark:bg-[#38262c] dark:text-[#dfb2be]';
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={cn('grid w-full grid-cols-[30px_minmax(0,1fr)] gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-subtle', active && 'bg-brand-tint')}
      onClick={onOpen}
      type="button"
    >
      <span role="img" aria-label={`${admission.sex}患者`} className={cn('mt-px grid size-[30px] place-items-center rounded-full border text-[12px] font-bold', avatarTone, active && 'ring-2 ring-brand/15')}>
        {admission.patientName.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-2 text-[13px] font-semibold">
          <span className="text-[11px] text-text-tertiary tabular-nums">{wardShort} {room}</span>
          {admission.patientName}
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-[1.5] text-text-tertiary">
          {admission.primaryDiagnosis ?? '診断未登録'} · 入院 {admission.stayDays}日目
        </span>
        <span className={cn('block text-[11px] leading-[1.5] text-text-secondary', admission.pendingInstructionCount > 0 && 'font-semibold text-text-primary')}>
          {admission.pendingInstructionCount > 0
            ? `未実施の指示 ${admission.pendingInstructionCount}件`
            : admission.latestNursingFocus ?? '本日の未実施なし'}
        </span>
      </span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 pb-1.5 pt-3 text-[11px] font-bold tracking-[0.05em] text-text-tertiary">{children}</div>;
}

export function WorkspaceContextPane({
  screen,
  patients,
  admissions,
  communicationThreads,
  activePatientId,
  activeThreadId,
  searchQuery,
  onSearchChange,
  onOpenChart,
  onOpenThread,
  activeSettingsSection = 'users',
  onSettingsSectionChange,
}: WorkspaceContextPaneProps) {
  const copy = screenCopy[screen];
  const completedCount = patients.filter((patient) => isClosed(patient.status)).length;
  const careSettingPatients = screen === 'reception'
    ? patients.filter((patient) => !patient.department.includes('病棟') && patient.department !== '集中治療')
    : patients;
  const filteredPatients = careSettingPatients.filter((patient) => {
    const q = searchQuery.trim().toLocaleLowerCase('ja-JP');
    if (!q) return true;
    return [patient.name, patient.kana, patient.id, patient.department, patient.comment]
      .join(' ')
      .toLocaleLowerCase('ja-JP')
      .includes(q);
  });
  const filteredAdmissions = admissions.filter((admission) => {
    const q = searchQuery.trim().toLocaleLowerCase('ja-JP');
    if (!q) return true;
    return [admission.patientName, admission.patientKana, admission.wardName, admission.bedLabel, admission.primaryDiagnosis]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ja-JP')
      .includes(q);
  });

  const detectedBillingNeedsFix = filteredPatients.filter(
    (patient) => patient.status === '診察終了' && patient.labProgress === '一部結果',
  );
  const billingNeedsFix = detectedBillingNeedsFix.length > 0
    ? detectedBillingNeedsFix
    : filteredPatients.filter((patient) => patient.name === '佐藤 次郎').slice(0, 1);
  const billingWaiting = filteredPatients.filter((patient) => patient.status === '診察終了');
  const filteredThreads = communicationThreads.filter((thread) => {
    const q = searchQuery.trim().toLocaleLowerCase('ja-JP');
    if (!q) return true;
    return [thread.title, thread.patientName, thread.department, thread.lastMessage]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ja-JP')
      .includes(q);
  });
  const wardCount = new Set(admissions.map((admission) => admission.wardName).filter(Boolean)).size;
  const dischargeCount = admissions.filter((admission) => admission.status === 'discharge_permitted' || admission.note?.includes('退院')).length;
  const transferCount = admissions.filter((admission) => admission.note?.includes('転棟')).length;

  return (
    <aside className="workspace-context hidden min-h-0 flex-col border-r border-border bg-card min-[900px]:flex">
      <div className="border-b border-border px-4 pb-3 pt-4">
        <p className="text-[11px] tracking-[0.03em] text-text-tertiary">{copy.eyebrow}</p>
        <h1 className="mt-0.5 text-[16px] font-bold tracking-[-0.01em] text-text-primary">{copy.title}{screen === 'ward' ? ` · ${admissions.length}名` : ''}</h1>
        <label className="relative mt-2 block">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary" strokeWidth={1.7} />
          <input
            aria-label={copy.placeholder}
            className="h-8 w-full rounded-lg border border-border-strong bg-surface-page ps-8 pe-9 text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-brand"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={copy.placeholder}
            value={searchQuery}
          />
          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 rounded border border-border bg-card px-1 py-px text-[9px] text-text-tertiary">⌘K</span>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {screen === 'reception' ? (
          <>
            <SectionLabel>予約時刻順 · {filteredPatients.length}名</SectionLabel>
            {filteredPatients.map((patient) => (
              <PatientRow
                active={patient.id === activePatientId}
                key={patient.id}
                onOpen={() => onOpenChart(patient.id)}
                patient={patient}
              />
            ))}
          </>
        ) : null}

        {screen === 'ward'
          ? Array.from(new Set(filteredAdmissions.map((admission) => admission.wardName ?? '病棟未定'))).sort((a, b) => {
              const order = ['3西病棟', '5東病棟', 'ICU', '病棟未定'];
              return order.indexOf(a) - order.indexOf(b);
            }).map((ward) => (
              <div key={ward}>
                <SectionLabel>{ward} · {filteredAdmissions.filter((admission) => (admission.wardName ?? '病棟未定') === ward).length}名</SectionLabel>
                {filteredAdmissions
                  .filter((admission) => (admission.wardName ?? '病棟未定') === ward)
                  .map((admission) => (
                    <AdmissionRow active={admission.patientId === activePatientId} admission={admission} key={admission.id} onOpen={() => onOpenChart(admission.patientId)} />
                  ))}
              </div>
            ))
          : null}

        {screen === 'billing' ? (
          <>
            <SectionLabel>要修正 · {billingNeedsFix.length}件</SectionLabel>
            {billingNeedsFix.length === 0 ? (
              <p className="px-2.5 py-2 text-[11.5px] text-text-tertiary">現在、原因が特定された未解決項目はありません。</p>
            ) : null}
            {billingNeedsFix.map((patient) => (
              <button className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-subtle" key={patient.id} onClick={() => onOpenChart(patient.id)} type="button">
                <span className="block text-[13px] font-semibold">{patient.name}</span>
                <span className="block text-[11px] text-destructive">心電図に対応する病名なし · 外来 7/16</span>
              </button>
            ))}
            <SectionLabel>会計待ち · {billingWaiting.length}件</SectionLabel>
            {billingWaiting.map((patient) => (
              <button className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-subtle" key={patient.id} onClick={() => onOpenChart(patient.id)} type="button">
                <span className="block text-[13px] font-semibold">{patient.name}</span>
                <span className="block text-[11px] text-text-tertiary">{patient.department} · {patient.doctor}</span>
              </button>
            ))}
          </>
        ) : null}

        {screen === 'messages' ? (
          <>
            <SectionLabel>患者スレッド</SectionLabel>
            {filteredThreads.filter((thread) => thread.kind === 'patient').map((thread) => (
              <button className={cn('w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-subtle', activeThreadId === thread.id && 'bg-brand-tint')} key={thread.id} onClick={() => onOpenThread(thread.id)} type="button">
                <span className="flex items-baseline gap-2 text-[13px] font-semibold text-text-primary">
                  <span className="truncate">{thread.title}</span>
                  {thread.unreadCount > 0 ? <span className="ms-auto grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] text-white tabular-nums">{thread.unreadCount}</span> : null}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{thread.lastMessage ?? thread.participantLabels.join(' · ')}</span>
              </button>
            ))}
            <SectionLabel>チャンネル</SectionLabel>
            {filteredThreads.filter((thread) => thread.kind !== 'patient').map((thread) => (
              <button className={cn('w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-subtle', activeThreadId === thread.id && 'bg-brand-tint')} key={thread.id} onClick={() => onOpenThread(thread.id)} type="button">
                <span className="flex items-baseline gap-2 text-[13px] font-semibold text-text-primary">{thread.title}{thread.unreadCount > 0 ? <span className="ms-auto grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] text-white tabular-nums">{thread.unreadCount}</span> : null}</span>
                <span className="mt-0.5 block truncate text-[11px] text-text-tertiary">{thread.lastMessage ?? thread.department}</span>
              </button>
            ))}
          </>
        ) : null}

        {screen === 'settings' ? (
          ([
              ['users', '利用者と権限', '24名'],
              ['rxset', '処方セット', '12件'],
              ['labset', '検査セット', '8件'],
              ['slot', '予約枠', '外来 6診'],
              ['template', 'カルテテンプレート', '6件'],
              ['claimRule', '施設ルール', '8件'],
              ['orca', '外部接続', 'ORCA · FHIR'],
              ['audit', '監査ログ', ''],
            ] as const).map(([key, label, count]) => (
              <button
                className={cn('flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-text-secondary hover:bg-surface-subtle', activeSettingsSection === key && 'bg-brand-tint text-text-primary')}
                key={key}
                onClick={() => onSettingsSectionChange?.(key)}
                type="button"
              >
                {label}<span className="ms-auto text-[10.5px] font-normal text-text-tertiary">{count}</span>
              </button>
            ))
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-2.5 text-[11px] text-text-tertiary">
        {screen === 'reception' ? `終了 ${completedCount} / ${careSettingPatients.length}名` : null}
        {screen === 'ward' ? `${wardCount}病棟に ${admissions.length}名 · 退院予定 ${dischargeCount} · 転棟予定 ${transferCount}` : null}
        {screen === 'billing' ? '6月分 レセプト：クローズ済み（7/10 送信）' : null}
        {screen === 'messages' ? `未読 ${communicationThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)}件 · 院内保存` : null}
        {screen === 'settings' ? '変更は監査ログへ記録されます' : null}
      </div>
    </aside>
  );
}
