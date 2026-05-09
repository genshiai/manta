import { useEffect, useMemo, useState } from 'react';
import { Activity, Bed, CheckCircle2, ClipboardList, FilePenLine, MoveRight, UserRoundCheck } from 'lucide-react';
import {
  createNursingNote,
  getInpatientProgress,
  isUnauthorizedError,
  listInpatientAdmissions,
  listInpatientBeds,
  listInpatientInstructions,
  listNursingNotes,
  transferInpatientAdmission,
  updateInpatientBedStatus,
  updateInpatientInstructionStatus,
} from '../lib/api';
import { cn } from '../lib/cn';
import type { InpatientAdmission, InpatientBed, InpatientInstruction, InpatientProgress, NursingNote } from '../types/workflow';
import { Button } from './ui/button';
import { Input } from './ui/input';

type WardWorkspaceProps = {
  admissions: InpatientAdmission[];
  onAuthExpired: () => void;
  onOpenChart: (patientId: string) => void;
  onRefreshAdmissions: (admissions: InpatientAdmission[]) => void;
};

const statusLabels: Record<InpatientInstruction['status'], string> = {
  pending: '未実施',
  done: '実施済',
  cancelled: '中止',
};

const statusClasses: Record<InpatientInstruction['status'], string> = {
  pending: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  done: 'border-green-200 bg-green-50 text-green-900',
  cancelled: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const bedStatusLabels: Record<InpatientBed['status'], string> = {
  available: '空床',
  occupied: '使用中',
  cleaning: '清掃中',
  blocked: '使用不可',
};

const bedStatusClasses: Record<InpatientBed['status'], string> = {
  available: 'border-green-200 bg-green-50 text-green-900',
  occupied: 'border-blue-200 bg-blue-50 text-blue-900',
  cleaning: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  blocked: 'border-red-200 bg-red-50 text-red-1000',
};

const emptyNoteForm = {
  focus: '',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
};

export const WardWorkspace = ({
  admissions,
  onAuthExpired,
  onOpenChart,
  onRefreshAdmissions,
}: WardWorkspaceProps) => {
  const [selectedAdmissionId, setSelectedAdmissionId] = useState<number | null>(admissions[0]?.id ?? null);
  const [instructions, setInstructions] = useState<InpatientInstruction[]>([]);
  const [nursingNotes, setNursingNotes] = useState<NursingNote[]>([]);
  const [progress, setProgress] = useState<InpatientProgress | null>(null);
  const [beds, setBeds] = useState<InpatientBed[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedAdmissionId !== null && admissions.some((admission) => admission.id === selectedAdmissionId)) {
      return;
    }
    setSelectedAdmissionId(admissions[0]?.id ?? null);
  }, [admissions, selectedAdmissionId]);

  const selectedAdmission = useMemo(
    () => admissions.find((admission) => admission.id === selectedAdmissionId) ?? admissions[0] ?? null,
    [admissions, selectedAdmissionId],
  );

  useEffect(() => {
    if (!selectedAdmission) {
      setInstructions([]);
      setNursingNotes([]);
      setProgress(null);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setErrorMessage(null);
      try {
        const [nextInstructions, nextNotes, nextProgress] = await Promise.all([
          listInpatientInstructions(selectedAdmission.id),
          listNursingNotes(selectedAdmission.id),
          getInpatientProgress(selectedAdmission.id),
        ]);
        if (cancelled) {
          return;
        }
        setInstructions(nextInstructions);
        setNursingNotes(nextNotes);
        setProgress(nextProgress);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '病棟詳細の取得に失敗しました。');
      } finally {
        if (!cancelled) {
          setIsLoadingDetail(false);
        }
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired, selectedAdmission]);

  useEffect(() => {
    let cancelled = false;

    const loadBeds = async () => {
      try {
        const nextBeds = await listInpatientBeds();
        if (!cancelled) {
          setBeds(nextBeds);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          onAuthExpired();
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : '病床一覧の取得に失敗しました。');
      }
    };

    loadBeds();

    return () => {
      cancelled = true;
    };
  }, [onAuthExpired]);

  const refreshAdmissions = async () => {
    const [nextAdmissions, nextBeds] = await Promise.all([
      listInpatientAdmissions({ status: 'active' }),
      listInpatientBeds(),
    ]);
    onRefreshAdmissions(nextAdmissions);
    setBeds(nextBeds);
  };

  const handleInstructionStatus = async (
    instruction: InpatientInstruction,
    status: InpatientInstruction['status'],
  ) => {
    try {
      const updated = await updateInpatientInstructionStatus(instruction.id, status);
      setInstructions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '指示の更新に失敗しました。');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedAdmission || isSavingNote) {
      return;
    }

    setIsSavingNote(true);
    setErrorMessage(null);
    try {
      const note = await createNursingNote(selectedAdmission.id, noteForm);
      setNursingNotes((current) => [note, ...current]);
      setProgress(await getInpatientProgress(selectedAdmission.id));
      setNoteForm(emptyNoteForm);
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '看護記録の保存に失敗しました。');
    } finally {
      setIsSavingNote(false);
    }
  };

  const pendingInstructions = instructions.filter((instruction) => instruction.status === 'pending');
  const progressRows = progress?.rows ?? [];
  const bedsByWard = useMemo(() => {
    const grouped = new Map<string, InpatientBed[]>();
    beds.forEach((bed) => {
      const key = `${bed.wardId}:${bed.wardName}`;
      grouped.set(key, [...(grouped.get(key) ?? []), bed]);
    });
    return Array.from(grouped.entries()).map(([key, wardBeds]) => ({
      key,
      wardName: wardBeds[0]?.wardName ?? '病棟未設定',
      beds: wardBeds,
    }));
  }, [beds]);
  const bedCounts = beds.reduce(
    (counts, bed) => {
      counts[bed.status] += 1;
      return counts;
    },
    { available: 0, occupied: 0, cleaning: 0, blocked: 0 } as Record<InpatientBed['status'], number>,
  );

  const handleTransfer = async (bed: InpatientBed) => {
    if (!selectedAdmission || bed.status !== 'available' || isTransferring) {
      return;
    }

    setIsTransferring(true);
    setErrorMessage(null);
    try {
      const updated = await transferInpatientAdmission(selectedAdmission.id, {
        wardId: bed.wardId,
        bedId: bed.id,
        note: `${bed.wardName} ${bed.bedLabel} へ転床`,
      });
      onRefreshAdmissions(admissions.map((admission) => (admission.id === updated.id ? updated : admission)));
      setSelectedAdmissionId(updated.id);
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '転床に失敗しました。');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleBedStatus = async (bed: InpatientBed, status: InpatientBed['status']) => {
    try {
      const updated = await updateInpatientBedStatus(bed.id, status, bed.note);
      setBeds((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await refreshAdmissions();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '病床状態の更新に失敗しました。');
    }
  };

  return (
    <main className='mx-auto w-full max-w-[1440px] space-y-5 px-4 py-6 lg:px-6'>
      <section className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-[28px] font-bold leading-tight text-text-primary'>病棟ワークスペース</h1>
          <p className='mt-1 text-[14px] text-text-tertiary'>
            入院患者、未実施指示、看護記録を同じ画面で確認します。
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-3 text-[13px] text-text-secondary'>
          <span>入院中 {admissions.length}</span>
          <span>未実施 {admissions.reduce((sum, item) => sum + item.pendingInstructionCount, 0)}</span>
          <span>空床 {bedCounts.available}</span>
          <span>清掃中 {bedCounts.cleaning}</span>
        </div>
      </section>

      {errorMessage ? (
        <section className='rounded-8 border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-900'>
          {errorMessage}
        </section>
      ) : null}

      <div className='grid gap-4 xl:grid-cols-[minmax(20rem,0.75fr)_minmax(0,1.2fr)_minmax(22rem,0.9fr)]'>
        <section className='overflow-hidden rounded-8 border border-border bg-card'>
          <div className='border-b border-border px-4 py-3'>
            <div className='flex items-center gap-2'>
              <Bed size={17} className='text-brand' />
              <h2 className='text-[16px] font-bold text-text-primary'>病棟患者</h2>
            </div>
          </div>
          <div className='divide-y divide-border'>
            {admissions.map((admission) => (
              <button
                className={cn(
                  'w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-surface-subtle',
                  selectedAdmission?.id === admission.id ? 'bg-blue-50' : 'bg-card',
                )}
                key={admission.id}
                onClick={() => setSelectedAdmissionId(admission.id)}
                type='button'
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='truncate text-[15px] font-bold text-text-primary'>{admission.patientName}</p>
                    <p className='mt-1 text-[12px] text-text-tertiary'>
                      {admission.wardName ?? '病棟未定'} {admission.bedLabel ?? ''} · {admission.stayDays}日目
                    </p>
                  </div>
                  <span className='rounded-md border border-border bg-white px-2 py-1 text-[12px] font-bold text-text-secondary'>
                    {admission.pendingInstructionCount}
                  </span>
                </div>
                <p className='mt-2 line-clamp-2 text-[13px] leading-normal text-text-secondary'>
                  {admission.primaryDiagnosis ?? admission.note ?? '入院目的未設定'}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className='space-y-4'>
          {selectedAdmission ? (
            <>
              <section className='rounded-8 border border-border bg-card p-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div>
                    <div className='flex items-center gap-2'>
                      <UserRoundCheck size={18} className='text-brand' />
                      <h2 className='text-[18px] font-bold text-text-primary'>{selectedAdmission.patientName}</h2>
                    </div>
                    <p className='mt-1 text-[13px] text-text-secondary'>
                      {selectedAdmission.wardName ?? '病棟未定'} {selectedAdmission.bedLabel ?? '病床未定'} · {selectedAdmission.attendingDoctor}
                    </p>
                    <p className='mt-2 text-[14px] leading-normal text-text-primary'>
                      {selectedAdmission.primaryDiagnosis ?? '主病名未設定'}
                    </p>
                  </div>
                  <Button onClick={() => onOpenChart(selectedAdmission.patientId)} size='sm' type='button' variant='outline'>
                    カルテを開く
                  </Button>
                </div>
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <Activity size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>経過表</h2>
                  </div>
                  <span className='text-[12px] text-text-tertiary'>{progressRows.length}日分</span>
                </div>
                <div className='overflow-auto'>
                  <div className='min-w-[760px]'>
                    <div className='grid grid-cols-[7rem_repeat(5,minmax(8rem,1fr))] border-b border-border bg-surface-subtle px-4 py-2 text-[12px] font-bold text-text-tertiary'>
                      <span>日付</span>
                      <span>バイタル</span>
                      <span>検査</span>
                      <span>処方</span>
                      <span>指示</span>
                      <span>看護記録</span>
                    </div>
                    <div className='divide-y divide-border'>
                      {progressRows.slice(0, 8).map((row) => (
                        <div
                          className='grid grid-cols-[7rem_repeat(5,minmax(8rem,1fr))] gap-2 px-4 py-3 text-[12px] leading-normal text-text-secondary'
                          key={row.date}
                        >
                          <span className='font-bold text-text-primary'>{row.date}</span>
                          <div className='space-y-1'>{row.vitals.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
                          <div className='space-y-1'>
                            {[...row.labs.slice(0, 3), ...row.labOrders.slice(0, 1)].map((item) => <p key={item}>{item}</p>)}
                          </div>
                          <div className='space-y-1'>{row.prescriptions.slice(0, 2).map((item) => <p key={item}>{item}</p>)}</div>
                          <div className='space-y-1'>{row.instructions.slice(0, 3).map((item) => <p key={item}>{item}</p>)}</div>
                          <div className='space-y-1'>{row.nursingNotes.slice(0, 2).map((item) => <p key={item}>{item}</p>)}</div>
                        </div>
                      ))}
                    </div>
                    {progressRows.length === 0 ? (
                      <div className='px-4 py-6 text-[13px] text-text-tertiary'>経過表に表示できる記録がありません。</div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <ClipboardList size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>指示簿</h2>
                  </div>
                  <span className='text-[12px] text-text-tertiary'>未実施 {pendingInstructions.length}</span>
                </div>
                <div className='divide-y divide-border'>
                  {instructions.map((instruction) => (
                    <div className='grid gap-3 px-4 py-3 lg:grid-cols-[7rem_minmax(0,1fr)_7rem_11rem]' key={instruction.id}>
                      <span className='text-[13px] font-bold text-text-secondary'>{instruction.category}</span>
                      <div>
                        <p className='text-[14px] font-bold text-text-primary'>{instruction.title}</p>
                        <p className='mt-1 text-[12px] text-text-tertiary'>{instruction.dueAt ?? instruction.createdAt}</p>
                      </div>
                      <span className={cn('inline-flex h-7 w-fit items-center rounded-md border px-2 text-[12px] font-bold', statusClasses[instruction.status])}>
                        {statusLabels[instruction.status]}
                      </span>
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          disabled={instruction.status === 'done'}
                          onClick={() => handleInstructionStatus(instruction, 'done')}
                          size='xs'
                          type='button'
                          variant='outline'
                        >
                          実施
                        </Button>
                        <Button
                          disabled={instruction.status === 'cancelled'}
                          onClick={() => handleInstructionStatus(instruction, 'cancelled')}
                          size='xs'
                          type='button'
                          variant='ghost'
                        >
                          中止
                        </Button>
                      </div>
                    </div>
                  ))}
                  {isLoadingDetail ? (
                    <div className='px-4 py-6 text-[14px] text-text-tertiary'>読み込み中</div>
                  ) : null}
                </div>
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex items-center gap-2 border-b border-border px-4 py-3'>
                  <FilePenLine size={17} className='text-brand' />
                  <h2 className='text-[16px] font-bold text-text-primary'>看護記録</h2>
                </div>
                <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]'>
                  <div className='space-y-3'>
                    {nursingNotes.map((note) => (
                      <article className='rounded-md border border-border bg-surface-subtle p-3' key={note.id}>
                        <div className='flex items-start justify-between gap-3'>
                          <h3 className='text-[14px] font-bold text-text-primary'>{note.focus ?? note.noteType}</h3>
                          <span className='text-[11px] text-text-tertiary'>{note.recordedAt}</span>
                        </div>
                        <p className='mt-2 text-[13px] leading-normal text-text-secondary'>{note.assessment}</p>
                        <p className='mt-1 text-[12px] text-text-tertiary'>{note.recordedBy}</p>
                      </article>
                    ))}
                  </div>
                  <div className='space-y-2'>
                    <Input
                      aria-label='フォーカス'
                      onChange={(event) => setNoteForm((current) => ({ ...current, focus: event.target.value }))}
                      placeholder='フォーカス'
                      value={noteForm.focus}
                    />
                    {(['subjective', 'objective', 'assessment', 'plan'] as const).map((key) => (
                      <textarea
                        className='min-h-20 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        key={key}
                        onChange={(event) => setNoteForm((current) => ({ ...current, [key]: event.target.value }))}
                        placeholder={key.toUpperCase()}
                        value={noteForm[key]}
                      />
                    ))}
                    <Button disabled={isSavingNote} onClick={handleSaveNote} size='sm' type='button'>
                      <CheckCircle2 size={15} />
                      保存
                    </Button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className='rounded-8 border border-border bg-card p-6 text-[14px] text-text-secondary'>
              入院中の患者がいません。
            </section>
          )}
        </section>

        <section className='space-y-4'>
          <section className='rounded-8 border border-border bg-card'>
            <div className='flex items-center justify-between gap-3 border-b border-border px-4 py-3'>
              <div className='flex items-center gap-2'>
                <Bed size={17} className='text-brand' />
                <h2 className='text-[16px] font-bold text-text-primary'>病床ボード</h2>
              </div>
              {selectedAdmission ? (
                <span className='text-[12px] text-text-tertiary'>{selectedAdmission.patientName} を選択中</span>
              ) : null}
            </div>
            <div className='max-h-[calc(100vh-13rem)] space-y-4 overflow-auto p-4'>
              {bedsByWard.map((group) => (
                <div className='space-y-2' key={group.key}>
                  <h3 className='text-[13px] font-bold text-text-secondary'>{group.wardName}</h3>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    {group.beds.map((bed) => {
                      const canTransfer = Boolean(selectedAdmission) && bed.status === 'available';
                      return (
                        <div
                          className={cn(
                            'rounded-md border p-3',
                            selectedAdmission?.bedId === bed.id ? 'border-brand bg-blue-50' : 'border-border bg-surface-subtle',
                          )}
                          key={bed.id}
                        >
                          <div className='flex items-start justify-between gap-2'>
                            <div>
                              <p className='text-[14px] font-bold text-text-primary'>{bed.bedLabel}</p>
                              <p className='mt-1 text-[12px] text-text-tertiary'>{bed.currentPatientName ?? bed.note ?? '利用可能'}</p>
                            </div>
                            <span className={cn('rounded-md border px-2 py-1 text-[11px] font-bold', bedStatusClasses[bed.status])}>
                              {bedStatusLabels[bed.status]}
                            </span>
                          </div>
                          <div className='mt-3 flex flex-wrap gap-2'>
                            <Button
                              disabled={!canTransfer || isTransferring}
                              onClick={() => handleTransfer(bed)}
                              size='xs'
                              type='button'
                              variant='outline'
                            >
                              <MoveRight size={13} />
                              転床
                            </Button>
                            {bed.status === 'cleaning' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'available')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                空床化
                              </Button>
                            ) : null}
                            {bed.status === 'available' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'blocked')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                停止
                              </Button>
                            ) : null}
                            {bed.status === 'blocked' ? (
                              <Button
                                onClick={() => handleBedStatus(bed, 'available')}
                                size='xs'
                                type='button'
                                variant='ghost'
                              >
                                再開
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
};
