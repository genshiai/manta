import { CheckCircle2, FlaskConical, PauseCircle, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import type { PatientRecord, ReceptionStatus } from '../data/chartMock';
import type { UserSession } from '../types/workflow';
import { cn } from './ui/utils';

type StatusFilter = ReceptionStatus | 'all';
type SortKey = 'receptionNumber' | 'reservationTime' | 'elapsed';

type OutpatientWorkspaceProps = {
  patients: PatientRecord[];
  currentUser: UserSession;
  statusFilter: StatusFilter;
  departmentFilter: string | 'all';
  sortKey: SortKey;
  lastRefreshedAt: string;
  isLoading?: boolean;
  errorMessage?: string | null;
  onStatusFilterChange: (value: StatusFilter) => void;
  onDepartmentFilterChange: (value: string | 'all') => void;
  onSortChange: (value: SortKey) => void;
  onOpenChart: (patientId: string) => void;
};

const isClosed = (status: ReceptionStatus) => status === '診察終了' || status === '会計済';

function ActionRow({
  icon,
  patient,
  detail,
  action,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode;
  patient: string;
  detail: string;
  action: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div className={cn('grid grid-cols-[20px_130px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0', danger && 'bg-destructive-bg/40')}>
      <span className={danger ? 'text-destructive' : 'text-text-tertiary'}>{icon}</span>
      <span className="text-[13px] font-semibold text-text-primary">{patient}</span>
      <span className="text-[12px] leading-[1.6] text-text-secondary">{detail}</span>
      <button className="rounded-lg border border-border-strong bg-card px-3 py-1.5 text-[11.5px] font-semibold text-text-primary hover:bg-surface-subtle" onClick={onClick} type="button">{action}</button>
    </div>
  );
}

export function OutpatientWorkspace({
  patients,
  currentUser,
  lastRefreshedAt,
  isLoading = false,
  errorMessage = null,
  onOpenChart,
}: OutpatientWorkspaceProps) {
  const outpatientPatients = patients.filter((patient) => !patient.department.includes('病棟') && patient.department !== '集中治療');
  const [verifyPatient, setVerifyPatient] = useState<PatientRecord | null>(null);
  const scopedPatients = outpatientPatients;
  const completed = scopedPatients.filter((patient) => isClosed(patient.status)).length;
  const results = scopedPatients.filter((patient) => patient.labProgress === '結果到着' || patient.labProgress === '一部結果');
  const interrupted = scopedPatients.filter((patient) => patient.status === '診察一時中断');
  const duplicates = scopedPatients.filter((patient) => patient.sameNameDuplicateCount > 1);
  const dateLabel = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-14 pt-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-[20px] font-bold tracking-[-0.01em] text-text-primary">今日の外来</h1>
          <p className="mt-1 text-[12px] text-text-tertiary">
            {dateLabel} · {currentUser.department} · {currentUser.displayName} — 予約 {scopedPatients.length}名 · 終了 {completed}名
          </p>
        </div>
        <p className="ms-auto text-[10.5px] text-text-tertiary tabular-nums">更新 {lastRefreshedAt}</p>
      </div>

      <section className="mt-5">
        <div className="mb-2 text-[11px] font-bold tracking-[0.05em] text-text-tertiary">対応が必要</div>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {results.map((patient) => (
            <ActionRow
              action={isClosed(patient.status) ? 'カルテを確認' : '診察を開始'}
              detail={`${patient.labProgress} — ${patient.comment || '結果を確認して診察できます'}`}
              icon={<FlaskConical size={15} strokeWidth={1.7} />}
              key={`lab-${patient.id}`}
              onClick={() => onOpenChart(patient.id)}
              patient={patient.name}
            />
          ))}
          {interrupted.map((patient) => (
            <ActionRow action="診察を再開" detail={`診察を一時中断中 — ${patient.comment || '再開待ち'}`} icon={<PauseCircle size={15} strokeWidth={1.7} />} key={`pause-${patient.id}`} onClick={() => onOpenChart(patient.id)} patient={patient.name} />
          ))}
          {duplicates.map((patient) => (
            <ActionRow action="患者を照合" danger detail={`同姓同名が ${patient.sameNameDuplicateCount}名 — ID・生年月日を照合してから開く`} icon={<ShieldAlert size={15} strokeWidth={1.8} />} key={`dup-${patient.id}`} onClick={() => setVerifyPatient(patient)} patient={patient.name} />
          ))}
          {results.length + interrupted.length + duplicates.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-5 text-[12px] text-text-tertiary"><CheckCircle2 size={15} className="text-success" />現在、具体的な対応が必要な患者はいません。</div>
          ) : null}
        </div>
      </section>

      {verifyPatient ? (
        <section className="mt-3 rounded-xl border border-destructive/25 bg-destructive-bg px-4 py-3" aria-live="polite">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-4 flex-none text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-text-primary">{verifyPatient.name} — 患者同定</p>
              <div className="mt-1 grid gap-1 text-[12px] text-text-secondary sm:grid-cols-2">
                <span>患者ID <b className="tabular-nums text-text-primary">{verifyPatient.id}</b></span>
                <span>{verifyPatient.age} · {verifyPatient.sex}</span>
                {verifyPatient.demographics.slice(0, 4).map((item) => <span key={item.label}>{item.label} <b className="text-text-primary">{item.value}</b></span>)}
              </div>
            </div>
            <button className="rounded-lg border border-border-strong bg-card px-3 py-1.5 text-[11.5px] font-semibold" onClick={() => onOpenChart(verifyPatient.id)} type="button">照合して開く</button>
            <button className="px-2 py-1.5 text-[11.5px] text-text-tertiary" onClick={() => setVerifyPatient(null)} type="button">閉じる</button>
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <div className="mb-2 text-[11px] font-bold tracking-[0.05em] text-text-tertiary">本日の予約 · 時刻順</div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {errorMessage ? <p className="px-4 py-3 text-[12px] text-destructive">{errorMessage}</p> : null}
          {isLoading ? <p className="px-4 py-6 text-[12px] text-text-tertiary">患者一覧を更新しています…</p> : null}
          {!isLoading && scopedPatients.length === 0 ? <p className="px-4 py-6 text-center text-[12px] text-text-tertiary">条件に一致する患者はいません。</p> : null}
          {scopedPatients.map((patient) => (
            <button className="grid w-full grid-cols-[76px_minmax(130px,180px)_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-subtle" key={patient.id} onClick={() => patient.sameNameDuplicateCount > 1 ? setVerifyPatient(patient) : onOpenChart(patient.id)} type="button">
              <span className="text-[12px] text-text-primary tabular-nums">{patient.reservationTime}<span className="mt-0.5 block text-[10.5px] text-text-tertiary">受付 {patient.receptionTime}</span></span>
              <span className="min-w-0 text-[13px] font-semibold text-text-primary">{patient.name}<span className="mt-0.5 block truncate text-[11px] font-normal text-text-tertiary">{patient.age} · {patient.sex} · {patient.department}</span></span>
              <span className="min-w-0 truncate text-[12px] text-text-secondary">{patient.comment || `${patient.department} · ${patient.doctor}`}</span>
              <span className={cn('text-[11.5px] font-medium text-text-secondary', patient.labProgress === '結果到着' && 'text-brand', patient.sameNameDuplicateCount > 1 && 'text-destructive', isClosed(patient.status) && 'text-text-tertiary')}>
                {patient.sameNameDuplicateCount > 1 ? '同姓同名 · 要照合' : patient.labProgress === '結果到着' ? '診察可 · 結果到着' : patient.status}
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
