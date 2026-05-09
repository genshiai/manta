import { useEffect, useMemo, useState } from 'react';
import { Bed, CheckCircle2, ClipboardList, FilePenLine, UserRoundCheck } from 'lucide-react';
import {
  createNursingNote,
  isUnauthorizedError,
  listInpatientAdmissions,
  listInpatientInstructions,
  listNursingNotes,
  updateInpatientInstructionStatus,
} from '../lib/api';
import { cn } from '../lib/cn';
import type { InpatientAdmission, InpatientInstruction, NursingNote } from '../types/workflow';
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
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
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
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setErrorMessage(null);
      try {
        const [nextInstructions, nextNotes] = await Promise.all([
          listInpatientInstructions(selectedAdmission.id),
          listNursingNotes(selectedAdmission.id),
        ]);
        if (cancelled) {
          return;
        }
        setInstructions(nextInstructions);
        setNursingNotes(nextNotes);
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

  const refreshAdmissions = async () => {
    const nextAdmissions = await listInpatientAdmissions({ status: 'active' });
    onRefreshAdmissions(nextAdmissions);
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

  return (
    <main className='mx-auto w-full max-w-[1440px] space-y-5 px-4 py-6 lg:px-6'>
      <section className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='text-[28px] font-bold leading-tight text-text-primary'>病棟ワークスペース</h1>
          <p className='mt-1 text-[14px] text-text-tertiary'>
            入院患者、未実施指示、看護記録を同じ画面で確認します。
          </p>
        </div>
        <div className='flex items-center gap-3 text-[13px] text-text-secondary'>
          <span>入院中 {admissions.length}</span>
          <span>未実施 {admissions.reduce((sum, item) => sum + item.pendingInstructionCount, 0)}</span>
        </div>
      </section>

      {errorMessage ? (
        <section className='rounded-8 border border-red-200 bg-red-50 px-4 py-3 text-[14px] font-bold text-red-900'>
          {errorMessage}
        </section>
      ) : null}

      <div className='grid gap-4 xl:grid-cols-[minmax(22rem,0.85fr)_minmax(0,1.45fr)]'>
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
      </div>
    </main>
  );
};
