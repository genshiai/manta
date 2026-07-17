import { Bed, CalendarClock, Columns3, LayoutGrid, List, Star, UserRoundPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { InpatientAdmission, InpatientBed, InpatientCareAssignment, UserSession } from '../../types/workflow';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';

type WardViewMode = 'layout' | 'columns' | 'list';

type WardOverviewProps = {
  admissions: InpatientAdmission[];
  assignments: InpatientCareAssignment[];
  beds: InpatientBed[];
  currentUser: UserSession;
  isAssigning: number | null;
  onAssign: (admission: InpatientAdmission) => void;
  onBedStatus: (bed: InpatientBed, status: InpatientBed['status']) => void;
  onOpenChart: (patientId: string) => void;
  onSelect: (admissionId: number) => void;
};

const statusLabel: Record<InpatientBed['status'], string> = {
  available: '空床', occupied: '入床', cleaning: '清掃中', blocked: '停止',
};

const statusClass: Record<InpatientBed['status'], string> = {
  available: 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
  occupied: 'border-slate-200 bg-white text-text-primary',
  cleaning: 'border-amber-200 bg-amber-50/80 text-amber-950',
  blocked: 'border-rose-200 bg-rose-50/80 text-rose-900',
};

const viewOptions: Array<{ key: WardViewMode; label: string; Icon: typeof LayoutGrid }> = [
  { key: 'layout', label: '配置', Icon: LayoutGrid },
  { key: 'columns', label: 'カラム', Icon: Columns3 },
  { key: 'list', label: 'リスト', Icon: List },
];

export function WardOverview({ admissions, assignments, beds, currentUser, isAssigning, onAssign, onBedStatus, onOpenChart, onSelect }: WardOverviewProps) {
  const [viewMode, setViewMode] = useState<WardViewMode>('layout');
  const [mineOnly, setMineOnly] = useState(false);
  const [selectedWardId, setSelectedWardId] = useState<string>();
  const [selectedBedId, setSelectedBedId] = useState<string>();
  const assignedIds = useMemo(() => new Set(assignments.map((item) => item.admissionId)), [assignments]);
  const visibleAdmissions = mineOnly ? admissions.filter((item) => assignedIds.has(item.id)) : admissions;
  const visibleAdmissionIds = useMemo(() => new Set(visibleAdmissions.map((item) => item.id)), [visibleAdmissions]);
  const admissionByBed = useMemo(() => new Map(admissions.filter((item) => item.bedId).map((item) => [item.bedId as string, item])), [admissions]);
  const visibleBeds = mineOnly ? beds.filter((bed) => bed.currentAdmissionId !== undefined && visibleAdmissionIds.has(bed.currentAdmissionId)) : beds;
  const wards = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; floor: string; beds: InpatientBed[] }>();
    for (const bed of visibleBeds) {
      const group = groups.get(bed.wardId) ?? { id: bed.wardId, name: bed.wardName, floor: bed.floor, beds: [] };
      group.beds.push(bed);
      groups.set(bed.wardId, group);
    }
    return Array.from(groups.values());
  }, [visibleBeds]);

  useEffect(() => {
    if (!wards.length) {
      setSelectedWardId(undefined);
      setSelectedBedId(undefined);
      return;
    }
    if (!selectedWardId || !wards.some((ward) => ward.id === selectedWardId)) {
      setSelectedWardId(wards[0].id);
      setSelectedBedId(wards[0].beds[0]?.id);
    }
  }, [selectedWardId, wards]);

  const selectedWard = wards.find((ward) => ward.id === selectedWardId) ?? wards[0];
  const selectedBed = beds.find((bed) => bed.id === selectedBedId) ?? selectedWard?.beds[0];
  const selectedAdmission = selectedBed ? admissionByBed.get(selectedBed.id) : undefined;
  const isExpectedVacancy = (admission?: InpatientAdmission) => Boolean(
    admission && (admission.status === 'discharge_permitted' || /(退院|転棟).*(予定|許可)|予定.*(退院|転棟)/.test(admission.note ?? '')),
  );
  const effectiveStatus = (bed: InpatientBed): InpatientBed['status'] => admissionByBed.has(bed.id) ? 'occupied' : bed.status;
  const expectedVacancies = admissions.filter(isExpectedVacancy);
  const occupiedCount = beds.filter((bed) => effectiveStatus(bed) === 'occupied').length;
  const availableCount = beds.filter((bed) => effectiveStatus(bed) === 'available').length;

  const assignmentButton = (admission: InpatientAdmission) => {
    const assigned = assignedIds.has(admission.id);
    return (
      <button type='button' disabled={isAssigning === admission.id} onClick={(event) => { event.stopPropagation(); onAssign(admission); }} className={cn('inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-bold transition-colors', assigned ? 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'border-border bg-white text-text-secondary hover:border-brand/40 hover:text-brand')} title={assigned ? '自分の患者から外す' : '自分の患者に登録'}>
        <Star size={12} fill={assigned ? 'currentColor' : 'none'} />{isAssigning === admission.id ? '更新中' : assigned ? '自分の患者' : '担当に追加'}
      </button>
    );
  };

  return (
    <section className='space-y-3' aria-label='病棟全体'>
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-8 border border-border bg-card p-3 shadow-sm'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='me-1'><h2 className='text-[17px] font-bold text-text-primary'>病棟全体</h2><p className='text-[11px] text-text-tertiary'>{beds.length}床 · {wards.length}病棟</p></div>
          <span className='rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] font-bold text-text-secondary'>入床 {occupiedCount}</span>
          <span className='rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900'>空床 {availableCount}</span>
          <span className='inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-900'><CalendarClock size={12} />空床見込 {expectedVacancies.length}</span>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <button type='button' onClick={() => setMineOnly((value) => !value)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-bold', mineOnly ? 'border-brand bg-brand text-white' : 'border-border bg-white text-text-secondary hover:text-brand')}><UserRoundPlus size={14} />自分の患者 {assignments.length}</button>
          <fieldset className='flex rounded-md border border-border bg-surface-subtle p-0.5' aria-label='表示方法'>
            {viewOptions.map(({ key, label, Icon }) => <button type='button' key={key} onClick={() => setViewMode(key)} className={cn('inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-bold', viewMode === key ? 'bg-white text-brand shadow-sm' : 'text-text-tertiary hover:text-text-primary')} title={`${label}表示`}><Icon size={13} />{label}</button>)}
          </fieldset>
        </div>
      </div>

      {mineOnly && !visibleAdmissions.length ? (
        <div className='rounded-8 border border-dashed border-border bg-card px-6 py-12 text-center'>
          <UserRoundPlus className='mx-auto text-text-tertiary' size={25} /><p className='mt-3 text-[14px] font-bold text-text-primary'>自分の患者はまだ登録されていません</p><p className='mt-1 text-[12px] text-text-tertiary'>全体表示に戻り、患者の「担当に追加」を押してください。</p><Button className='mt-4' onClick={() => setMineOnly(false)} size='xs' type='button' variant='outline'>全体を表示</Button>
        </div>
      ) : null}

      {!mineOnly || visibleAdmissions.length ? viewMode === 'layout' ? (
        <div className='space-y-4'>
          {wards.map((ward) => {
            const rooms = new Map<string, InpatientBed[]>();
            ward.beds.forEach((bed) => {
              rooms.set(bed.roomNumber, [...(rooms.get(bed.roomNumber) ?? []), bed]);
            });
            return <article className='rounded-8 border border-border bg-card' key={ward.id}>
              <header className='flex items-center justify-between border-b border-border px-4 py-3'><div><h3 className='text-[15px] font-bold text-text-primary'>{ward.name}</h3><p className='text-[11px] text-text-tertiary'>{ward.floor}</p></div><span className='text-[11px] font-bold text-text-secondary'>{ward.beds.filter((bed) => effectiveStatus(bed) === 'available').length}床 空き</span></header>
              <div className='grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3'>
                {Array.from(rooms.entries()).map(([roomNumber, roomBeds]) => <section className='rounded-md border border-border bg-surface-subtle/70 p-2.5' key={roomNumber}>
                  <div className='mb-2 flex items-center justify-between'><h4 className='text-[12px] font-bold text-text-secondary'>{roomNumber}号室</h4><span className='text-[10px] text-text-tertiary'>{roomBeds.length}床</span></div>
                  <div className='grid grid-cols-2 gap-2'>{roomBeds.map((bed) => {
                    const admission = admissionByBed.get(bed.id);
                    const shownStatus = effectiveStatus(bed);
                    return <button type='button' key={bed.id} onClick={() => admission ? onSelect(admission.id) : setSelectedBedId(bed.id)} className={cn('min-h-[102px] rounded-md border p-2 text-left transition hover:-translate-y-px hover:shadow-sm', statusClass[shownStatus])}>
                      <div className='flex items-center justify-between gap-1'><span className='inline-flex items-center gap-1 text-[11px] font-bold'><Bed size={12} />{bed.bedNumber}</span><span className='text-[10px] font-bold'>{statusLabel[shownStatus]}</span></div>
                      {admission ? <><p className='mt-2 truncate text-[13px] font-bold'>{admission.patientName}</p><p className='mt-0.5 text-[10px] opacity-70'>{admission.stayDays}日目 · {admission.age} {admission.sex}</p>{isExpectedVacancy(admission) ? <span className='mt-1.5 inline-flex rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-900'>退院・転棟予定 · 空床見込</span> : null}</> : <p className='mt-5 text-center text-[11px] opacity-70'>{bed.note || statusLabel[shownStatus]}</p>}
                    </button>;
                  })}</div>
                </section>)}
              </div>
            </article>;
          })}
        </div>
      ) : viewMode === 'list' ? (
        <div className='overflow-x-auto rounded-8 border border-border bg-card'><table className='w-full min-w-[980px] border-collapse text-left'>
          <thead className='bg-surface-subtle text-[10px] font-bold uppercase tracking-wide text-text-tertiary'><tr><th className='px-3 py-2'>病床</th><th className='px-3 py-2'>患者</th><th className='px-3 py-2'>主病名</th><th className='px-3 py-2'>入院</th><th className='px-3 py-2'>主担当</th><th className='px-3 py-2'>予定</th><th className='px-3 py-2 text-right'>担当</th></tr></thead>
          <tbody className='divide-y divide-border'>{visibleBeds.map((bed) => {
            const admission = admissionByBed.get(bed.id);
            const shownStatus = effectiveStatus(bed);
            return <tr key={bed.id} className={cn('text-[12px]', admission && 'cursor-pointer hover:bg-surface-subtle')} onClick={() => admission && onSelect(admission.id)}><td className='whitespace-nowrap px-3 py-2.5 font-bold'>{bed.wardName} · {bed.bedLabel}<span className={cn('ms-2 rounded border px-1.5 py-0.5 text-[9px]', statusClass[shownStatus])}>{statusLabel[shownStatus]}</span></td><td className='px-3 py-2.5 font-bold'>{admission?.patientName ?? '—'}</td><td className='max-w-[240px] truncate px-3 py-2.5 text-text-secondary'>{admission?.primaryDiagnosis ?? '—'}</td><td className='px-3 py-2.5 tabular-nums'>{admission ? `${admission.stayDays}日目` : '—'}</td><td className='px-3 py-2.5 text-text-secondary'>{admission?.attendingDoctor ?? '—'}</td><td className='px-3 py-2.5'>{isExpectedVacancy(admission) ? <span className='font-bold text-blue-900'>空床見込</span> : '—'}</td><td className='px-3 py-2.5 text-right'>{admission ? assignmentButton(admission) : null}</td></tr>;
          })}</tbody>
        </table></div>
      ) : (
        <div className='grid min-h-[520px] grid-cols-[220px_310px_minmax(0,1fr)] overflow-hidden rounded-8 border border-border bg-card'>
          <div className='border-r border-border bg-surface-subtle/60 p-2'><p className='px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-text-tertiary'>病棟</p>{wards.map((ward) => <button type='button' key={ward.id} onClick={() => { setSelectedWardId(ward.id); setSelectedBedId(ward.beds[0]?.id); }} className={cn('flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[12px] font-bold', selectedWard?.id === ward.id ? 'bg-white text-brand shadow-sm' : 'text-text-secondary hover:bg-white/70')}><span>{ward.name}<small className='ms-1 font-normal text-text-tertiary'>{ward.floor}</small></span><span>{ward.beds.length}</span></button>)}</div>
          <div className='overflow-y-auto border-r border-border p-2'><p className='px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-text-tertiary'>病室・病床</p>{selectedWard?.beds.map((bed) => { const admission = admissionByBed.get(bed.id); const shownStatus = effectiveStatus(bed); return <button type='button' key={bed.id} onClick={() => setSelectedBedId(bed.id)} className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left', selectedBed?.id === bed.id ? 'bg-brand-tint' : 'hover:bg-surface-subtle')}><span className={cn('size-2 rounded-full', shownStatus === 'available' ? 'bg-emerald-500' : shownStatus === 'occupied' ? 'bg-slate-500' : shownStatus === 'cleaning' ? 'bg-amber-500' : 'bg-rose-500')} /><span className='min-w-0 flex-1'><b className='block text-[12px]'>{bed.bedLabel}</b><small className='block truncate text-[10px] text-text-tertiary'>{admission?.patientName ?? statusLabel[shownStatus]}</small></span></button>; })}</div>
          <div className='p-5'>{selectedBed ? <><div className='flex items-start justify-between gap-3 border-b border-border pb-4'><div><p className='text-[11px] font-bold text-text-tertiary'>{selectedBed.wardName} · {selectedBed.roomNumber}号室</p><h3 className='mt-1 text-[22px] font-bold text-text-primary'>{selectedBed.bedLabel}</h3></div><span className={cn('rounded-md border px-2 py-1 text-[11px] font-bold', statusClass[selectedBed.status])}>{statusLabel[selectedBed.status]}</span></div>{selectedAdmission ? <div className='pt-5'><div className='flex flex-wrap items-start justify-between gap-3'><div><h4 className='text-[20px] font-bold text-text-primary'>{selectedAdmission.patientName}</h4><p className='mt-1 text-[12px] text-text-secondary'>{selectedAdmission.age} · {selectedAdmission.sex} · 入院{selectedAdmission.stayDays}日目</p></div>{assignmentButton(selectedAdmission)}</div><dl className='mt-5 grid grid-cols-[6rem_1fr] gap-y-3 text-[12px]'><dt className='text-text-tertiary'>主病名</dt><dd className='font-bold'>{selectedAdmission.primaryDiagnosis ?? '未設定'}</dd><dt className='text-text-tertiary'>主担当</dt><dd>{selectedAdmission.attendingDoctor}</dd><dt className='text-text-tertiary'>チーム</dt><dd>{selectedAdmission.team ?? '—'}</dd><dt className='text-text-tertiary'>空床見込</dt><dd>{selectedAdmission.status === 'discharge_permitted' ? '退院許可済み' : 'なし'}</dd></dl><div className='mt-6 flex gap-2'><Button onClick={() => onSelect(selectedAdmission.id)} size='xs' type='button'>病棟詳細</Button><Button onClick={() => onOpenChart(selectedAdmission.patientId)} size='xs' type='button' variant='outline'>カルテ</Button></div></div> : <div className='pt-5'><p className='text-[14px] font-bold text-text-primary'>患者なし</p><p className='mt-1 text-[12px] text-text-tertiary'>{selectedBed.note || '入床可能です。'}</p><div className='mt-5 flex gap-2'>{selectedBed.status === 'cleaning' ? <Button onClick={() => onBedStatus(selectedBed, 'available')} size='xs' type='button'>清掃完了</Button> : null}{selectedBed.status === 'available' ? <Button onClick={() => onBedStatus(selectedBed, 'blocked')} size='xs' type='button' variant='outline'>使用停止</Button> : null}{selectedBed.status === 'blocked' ? <Button onClick={() => onBedStatus(selectedBed, 'available')} size='xs' type='button' variant='outline'>再開</Button> : null}</div></div>}</> : <p className='text-[13px] text-text-tertiary'>病床を選択してください。</p>}</div>
        </div>
      ) : null}
      <p className='px-1 text-[10px] text-text-tertiary'>担当登録: {currentUser.displayName} 個人の「自分の患者」に保存され、登録・解除は入院イベントと監査ログに記録されます。</p>
    </section>
  );
}
