import { useEffect, useMemo, useState } from 'react';
import { Activity, Bed, CheckCircle2, ClipboardList, FilePenLine, FileText, MoveRight, UserRoundCheck } from 'lucide-react';
import {
  createInpatientDocument,
  createInpatientPathway,
  createInpatientSummaryReview,
  createNursingNote,
  getInpatientPathway,
  getInpatientDischargePlan,
  getInpatientProgress,
  getInpatientSummaryDraft,
  isUnauthorizedError,
  listInpatientAdmissions,
  listInpatientBeds,
  listInpatientDocuments,
  listInpatientEvents,
  listInpatientInstructions,
  listInpatientPathwayMasters,
  listNursingNotes,
  listInpatientSummaryReviews,
  transferInpatientAdmission,
  updateInpatientBedStatus,
  updateInpatientDocument,
  updateInpatientDischargePlan,
  updateInpatientInstructionStatus,
  updateInpatientPathwayTask,
} from '../lib/api';
import { cn } from '../lib/cn';
import type {
  InpatientAdmission,
  InpatientAiSummaryReview,
  InpatientBed,
  InpatientDocument,
  InpatientDocumentType,
  InpatientDischargePlan,
  InpatientEvent,
  InpatientInstruction,
  InpatientPathway,
  InpatientPathwayMaster,
  InpatientPathwayTask,
  InpatientProgress,
  InpatientSummaryDraft,
  NursingNote,
} from '../types/workflow';
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

const documentTypeLabels: Record<InpatientDocumentType, string> = {
  admission_care_plan: '入院診療計画書',
  discharge_summary: '退院サマリ',
  discharge_instruction: '退院時指導文書',
};

const documentStatusLabels: Record<InpatientDocument['status'], string> = {
  draft: '下書き',
  signed: '署名済',
  archived: '保管',
};

const documentStatusClasses: Record<InpatientDocument['status'], string> = {
  draft: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  signed: 'border-green-200 bg-green-50 text-green-900',
  archived: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
};

const pathwayStatusLabels: Record<InpatientPathwayTask['status'], string> = {
  pending: '未実施',
  done: '完了',
  variance: '逸脱',
  skipped: '除外',
};

const pathwayStatusClasses: Record<InpatientPathwayTask['status'], string> = {
  pending: 'border-yellow-200 bg-yellow-50 text-yellow-1100',
  done: 'border-green-200 bg-green-50 text-green-900',
  variance: 'border-red-200 bg-red-50 text-red-1000',
  skipped: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-700',
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
  const [documents, setDocuments] = useState<InpatientDocument[]>([]);
  const [progress, setProgress] = useState<InpatientProgress | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<InpatientSummaryDraft | null>(null);
  const [events, setEvents] = useState<InpatientEvent[]>([]);
  const [pathway, setPathway] = useState<InpatientPathway | null>(null);
  const [pathwayMasters, setPathwayMasters] = useState<InpatientPathwayMaster[]>([]);
  const [selectedPathwayMasterId, setSelectedPathwayMasterId] = useState('');
  const [summaryReviews, setSummaryReviews] = useState<InpatientAiSummaryReview[]>([]);
  const [dischargePlan, setDischargePlan] = useState<InpatientDischargePlan | null>(null);
  const [beds, setBeds] = useState<InpatientBed[]>([]);
  const [noteForm, setNoteForm] = useState(emptyNoteForm);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCreatingDocument, setIsCreatingDocument] = useState(false);
  const [isStartingPathway, setIsStartingPathway] = useState(false);
  const [isReviewingSummary, setIsReviewingSummary] = useState(false);
  const [isSavingDischargePlan, setIsSavingDischargePlan] = useState(false);
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
      setDocuments([]);
      setProgress(null);
      setSummaryDraft(null);
      setEvents([]);
      setPathway(null);
      setSummaryReviews([]);
      setDischargePlan(null);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setIsLoadingDetail(true);
      setErrorMessage(null);
      try {
        const [
          nextInstructions,
          nextNotes,
          nextDocuments,
          nextProgress,
          nextSummaryDraft,
          nextEvents,
          nextPathway,
          nextPathwayMasters,
          nextSummaryReviews,
          nextDischargePlan,
        ] = await Promise.all([
          listInpatientInstructions(selectedAdmission.id),
          listNursingNotes(selectedAdmission.id),
          listInpatientDocuments(selectedAdmission.id),
          getInpatientProgress(selectedAdmission.id),
          getInpatientSummaryDraft(selectedAdmission.id),
          listInpatientEvents(selectedAdmission.id),
          getInpatientPathway(selectedAdmission.id),
          listInpatientPathwayMasters(),
          listInpatientSummaryReviews(selectedAdmission.id),
          getInpatientDischargePlan(selectedAdmission.id),
        ]);
        if (cancelled) {
          return;
        }
        setInstructions(nextInstructions);
        setNursingNotes(nextNotes);
        setDocuments(nextDocuments);
        setProgress(nextProgress);
        setSummaryDraft(nextSummaryDraft);
        setEvents(nextEvents);
        setPathway(nextPathway);
        setPathwayMasters(nextPathwayMasters);
        setSelectedPathwayMasterId(nextPathway?.pathwayMasterId ?? nextPathwayMasters[0]?.id ?? '');
        setSummaryReviews(nextSummaryReviews);
        setDischargePlan(nextDischargePlan);
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

  const handleCreateDocument = async (documentType: InpatientDocumentType) => {
    if (!selectedAdmission || isCreatingDocument) {
      return;
    }

    setIsCreatingDocument(true);
    setErrorMessage(null);
    try {
      const document = await createInpatientDocument(selectedAdmission.id, { documentType });
      setDocuments((current) => [document, ...current]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の作成に失敗しました。');
    } finally {
      setIsCreatingDocument(false);
    }
  };

  const handleSignDocument = async (document: InpatientDocument) => {
    if (document.status === 'signed') {
      return;
    }

    try {
      const updated = await updateInpatientDocument(document.id, { status: 'signed' });
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '入退院文書の署名に失敗しました。');
    }
  };

  const handleCreateSummaryDocument = async () => {
    if (!selectedAdmission || !summaryDraft || isCreatingDocument) {
      return;
    }

    setIsCreatingDocument(true);
    setErrorMessage(null);
    try {
      const document = await createInpatientDocument(selectedAdmission.id, {
        documentType: 'discharge_summary',
        title: '退院サマリ',
        body: summaryDraft.body,
      });
      setDocuments((current) => [document, ...current]);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '要約案の文書化に失敗しました。');
    } finally {
      setIsCreatingDocument(false);
    }
  };

  const refreshEvents = async () => {
    if (!selectedAdmission) {
      return;
    }
    setEvents(await listInpatientEvents(selectedAdmission.id));
  };

  const handleStartPathway = async () => {
    if (!selectedAdmission || isStartingPathway) {
      return;
    }

    setIsStartingPathway(true);
    setErrorMessage(null);
    try {
      const selectedMaster = pathwayMasters.find((master) => master.id === selectedPathwayMasterId);
      const nextPathway = await createInpatientPathway(selectedAdmission.id, {
        pathwayMasterId: selectedMaster?.id,
        pathwayName: selectedMaster?.name ?? '標準入院パス',
      });
      setPathway(nextPathway);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'クリティカルパスの開始に失敗しました。');
    } finally {
      setIsStartingPathway(false);
    }
  };

  const handlePathwayTaskStatus = async (
    task: InpatientPathwayTask,
    status: InpatientPathwayTask['status'],
  ) => {
    try {
      const updated = await updateInpatientPathwayTask(task.id, {
        status,
        varianceNote: status === 'variance' ? `${task.title} の逸脱を記録` : undefined,
      });
      setPathway((current) => current ? {
        ...current,
        tasks: current.tasks.map((item) => (item.id === updated.id ? updated : item)),
      } : current);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : 'パスタスクの更新に失敗しました。');
    }
  };

  const handleSummaryReview = async (status: InpatientAiSummaryReview['status']) => {
    if (!selectedAdmission || !summaryDraft || isReviewingSummary) {
      return;
    }

    setIsReviewingSummary(true);
    setErrorMessage(null);
    try {
      const review = await createInpatientSummaryReview(selectedAdmission.id, {
        summaryTitle: summaryDraft.title,
        summaryBody: summaryDraft.body,
        status,
        sourceCounts: summaryDraft.sourceCounts,
        reviewNote: status === 'accepted' ? '退院サマリ作成候補として採用' : '記載内容を再確認',
      });
      setSummaryReviews((current) => [review, ...current]);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '要約レビューの保存に失敗しました。');
    } finally {
      setIsReviewingSummary(false);
    }
  };

  const handleSaveDischargePlan = async (status: InpatientDischargePlan['status']) => {
    if (!selectedAdmission || !dischargePlan || isSavingDischargePlan) {
      return;
    }

    setIsSavingDischargePlan(true);
    setErrorMessage(null);
    try {
      const updated = await updateInpatientDischargePlan(selectedAdmission.id, {
        status,
        dischargeMedicationNote: dischargePlan.dischargeMedicationNote,
        billingCandidates: dischargePlan.billingCandidates,
        followUpNote: dischargePlan.followUpNote,
      });
      setDischargePlan(updated);
      await refreshEvents();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onAuthExpired();
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : '退院計画の保存に失敗しました。');
    } finally {
      setIsSavingDischargePlan(false);
    }
  };

  const pendingInstructions = instructions.filter((instruction) => instruction.status === 'pending');
  const progressRows = progress?.rows ?? [];
  const pathwayTaskCounts = pathway?.tasks.reduce(
    (counts, task) => {
      counts[task.status] += 1;
      return counts;
    },
    { pending: 0, done: 0, variance: 0, skipped: 0 } as Record<InpatientPathwayTask['status'], number>,
  );
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
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <FileText size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>入退院文書</h2>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {(Object.keys(documentTypeLabels) as InpatientDocumentType[]).map((documentType) => (
                      <Button
                        disabled={isCreatingDocument}
                        key={documentType}
                        onClick={() => handleCreateDocument(documentType)}
                        size='xs'
                        type='button'
                        variant='outline'
                      >
                        {documentTypeLabels[documentType]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className='divide-y divide-border'>
                  {documents.slice(0, 4).map((document) => (
                    <article className='px-4 py-3' key={document.id}>
                      <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <h3 className='text-[14px] font-bold text-text-primary'>{document.title}</h3>
                            <span className={cn('rounded-md border px-2 py-1 text-[11px] font-bold', documentStatusClasses[document.status])}>
                              {documentStatusLabels[document.status]}
                            </span>
                          </div>
                          <p className='mt-1 text-[12px] text-text-tertiary'>
                            {document.createdBy} · 更新 {document.updatedAt}
                          </p>
                        </div>
                        <Button
                          disabled={document.status === 'signed'}
                          onClick={() => handleSignDocument(document)}
                          size='xs'
                          type='button'
                          variant='ghost'
                        >
                          署名
                        </Button>
                      </div>
                      <pre className='mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle p-3 text-[12px] leading-relaxed text-text-secondary'>
                        {document.body}
                      </pre>
                    </article>
                  ))}
                  {documents.length === 0 && !isLoadingDetail ? (
                    <div className='px-4 py-6 text-[13px] text-text-tertiary'>入退院文書はまだありません。</div>
                  ) : null}
                </div>
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <Activity size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>入院経過要約案</h2>
                  </div>
                  <Button
                    disabled={!summaryDraft || isCreatingDocument}
                    onClick={handleCreateSummaryDocument}
                    size='xs'
                    type='button'
                    variant='outline'
                  >
                    退院サマリ化
                  </Button>
                  <Button
                    disabled={!summaryDraft || isReviewingSummary}
                    onClick={() => handleSummaryReview('accepted')}
                    size='xs'
                    type='button'
                    variant='ghost'
                  >
                    採用
                  </Button>
                  <Button
                    disabled={!summaryDraft || isReviewingSummary}
                    onClick={() => handleSummaryReview('rejected')}
                    size='xs'
                    type='button'
                    variant='ghost'
                  >
                    差戻し
                  </Button>
                </div>
                {summaryDraft ? (
                  <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_14rem]'>
                    <pre className='max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-surface-subtle p-3 text-[12px] leading-relaxed text-text-secondary'>
                      {summaryDraft.body}
                    </pre>
                    <div className='space-y-3 text-[12px] text-text-secondary'>
                      <div>
                        <p className='font-bold text-text-primary'>{summaryDraft.periodLabel}</p>
                        <p className='mt-1 text-text-tertiary'>生成 {summaryDraft.generatedAt}</p>
                      </div>
                      <div className='grid grid-cols-2 gap-2'>
                        <span>看護 {summaryDraft.sourceCounts.nursingNotes}</span>
                        <span>観察 {summaryDraft.sourceCounts.observations}</span>
                        <span>処方 {summaryDraft.sourceCounts.prescriptions}</span>
                        <span>指示 {summaryDraft.sourceCounts.instructions}</span>
                      </div>
                      <div className='space-y-1'>
                        {summaryDraft.keyEvents.slice(0, 4).map((event) => (
                          <p key={event}>{event}</p>
                        ))}
                      </div>
                      {summaryReviews[0] ? (
                        <div className='rounded-md border border-border bg-white p-2'>
                          <p className='font-bold text-text-primary'>
                            最新レビュー: {summaryReviews[0].status === 'accepted' ? '採用' : '差戻し'}
                          </p>
                          <p className='mt-1 text-text-tertiary'>{summaryReviews[0].createdAt}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className='px-4 py-6 text-[13px] text-text-tertiary'>要約できる入院記録がありません。</div>
                )}
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <ClipboardList size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>クリティカルパス</h2>
                  </div>
                  {pathway ? (
                    <span className='text-[12px] text-text-tertiary'>
                      未実施 {pathwayTaskCounts?.pending ?? 0} · 逸脱 {pathwayTaskCounts?.variance ?? 0}
                    </span>
                  ) : (
                    <div className='flex flex-wrap gap-2'>
                      <select
                        className='h-8 rounded-md border border-border bg-white px-2 text-[12px] font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        onChange={(event) => setSelectedPathwayMasterId(event.target.value)}
                        value={selectedPathwayMasterId}
                      >
                        {pathwayMasters.map((master) => (
                          <option key={master.id} value={master.id}>
                            {master.name}
                          </option>
                        ))}
                      </select>
                      <Button disabled={isStartingPathway} onClick={handleStartPathway} size='xs' type='button' variant='outline'>
                        パス開始
                      </Button>
                    </div>
                  )}
                </div>
                {pathway ? (
                  <div className='divide-y divide-border'>
                    <div className='px-4 py-3 text-[12px] text-text-tertiary'>
                      {pathway.pathwayName} · 開始日 {pathway.startedOn}
                    </div>
                    {pathway.tasks.map((task) => (
                      <div className='grid gap-3 px-4 py-3 lg:grid-cols-[4rem_7rem_minmax(0,1fr)_6rem_10rem]' key={task.id}>
                        <span className='text-[13px] font-bold text-text-secondary'>Day {task.dayOffset}</span>
                        <div className='text-[12px] text-text-secondary'>
                          <p className='font-bold'>{task.category}</p>
                          <p className='mt-1 text-text-tertiary'>{task.role ?? '担当未設定'}</p>
                        </div>
                        <div>
                          <p className='text-[14px] font-bold text-text-primary'>{task.title}</p>
                          <p className='mt-1 text-[12px] text-text-tertiary'>
                            {task.dueOn ?? '予定日未設定'} {task.dueTime ?? ''}
                          </p>
                          {task.varianceNote ? <p className='mt-1 text-[12px] text-red-900'>{task.varianceNote}</p> : null}
                        </div>
                        <span className={cn('inline-flex h-7 w-fit items-center rounded-md border px-2 text-[12px] font-bold', pathwayStatusClasses[task.status])}>
                          {pathwayStatusLabels[task.status]}
                        </span>
                        <div className='flex flex-wrap gap-2'>
                          <Button disabled={task.status === 'done'} onClick={() => handlePathwayTaskStatus(task, 'done')} size='xs' type='button' variant='outline'>
                            完了
                          </Button>
                          <Button disabled={task.status === 'variance'} onClick={() => handlePathwayTaskStatus(task, 'variance')} size='xs' type='button' variant='ghost'>
                            逸脱
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className='px-4 py-6 text-[13px] text-text-tertiary'>この入院にはクリティカルパスが開始されていません。</div>
                )}
              </section>

              <section className='rounded-8 border border-border bg-card'>
                <div className='flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3'>
                  <div className='flex items-center gap-2'>
                    <FilePenLine size={17} className='text-brand' />
                    <h2 className='text-[16px] font-bold text-text-primary'>退院計画・会計候補</h2>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      disabled={!dischargePlan || isSavingDischargePlan}
                      onClick={() => handleSaveDischargePlan('reviewed')}
                      size='xs'
                      type='button'
                      variant='outline'
                    >
                      レビュー済
                    </Button>
                    <Button
                      disabled={!dischargePlan || isSavingDischargePlan}
                      onClick={() => handleSaveDischargePlan('ready')}
                      size='xs'
                      type='button'
                      variant='ghost'
                    >
                      退院準備完了
                    </Button>
                  </div>
                </div>
                {dischargePlan ? (
                  <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.75fr)]'>
                    <div className='space-y-3'>
                      <textarea
                        className='min-h-32 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        onChange={(event) => setDischargePlan((current) => current ? { ...current, dischargeMedicationNote: event.target.value } : current)}
                        value={dischargePlan.dischargeMedicationNote}
                      />
                      <textarea
                        className='min-h-24 w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] leading-normal text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15'
                        onChange={(event) => setDischargePlan((current) => current ? { ...current, followUpNote: event.target.value } : current)}
                        value={dischargePlan.followUpNote}
                      />
                    </div>
                    <div className='space-y-2'>
                      <span className={cn('inline-flex rounded-md border px-2 py-1 text-[12px] font-bold', dischargePlan.status === 'ready' ? 'border-green-200 bg-green-50 text-green-900' : 'border-yellow-200 bg-yellow-50 text-yellow-1100')}>
                        {dischargePlan.status === 'ready' ? '退院準備完了' : dischargePlan.status === 'reviewed' ? 'レビュー済' : '下書き'}
                      </span>
                      {dischargePlan.billingCandidates.map((candidate) => (
                        <div className='rounded-md border border-border bg-surface-subtle p-2' key={`${candidate.category}-${candidate.label}`}>
                          <div className='flex items-start justify-between gap-2'>
                            <p className='text-[12px] font-bold text-text-primary'>{candidate.category}</p>
                            <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-bold', candidate.status === 'needs_review' ? 'border-yellow-200 bg-yellow-50 text-yellow-1100' : 'border-green-200 bg-green-50 text-green-900')}>
                              {candidate.status === 'needs_review' ? '要確認' : '候補'}
                            </span>
                          </div>
                          <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{candidate.label}</p>
                          {candidate.evidence ? (
                            <p className='mt-2 border-t border-border pt-2 text-[11px] leading-normal text-text-tertiary'>
                              根拠: {candidate.evidence}
                            </p>
                          ) : null}
                          <p className='mt-1 text-[11px] text-text-tertiary'>
                            {candidate.source} · {candidate.confidence ?? 'medium'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className='px-4 py-6 text-[13px] text-text-tertiary'>退院計画を読み込み中です。</div>
                )}
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
                <Activity size={17} className='text-brand' />
                <h2 className='text-[16px] font-bold text-text-primary'>入院イベント</h2>
              </div>
              <span className='text-[12px] text-text-tertiary'>{events.length}件</span>
            </div>
            <div className='max-h-80 divide-y divide-border overflow-auto'>
              {events.slice(0, 12).map((event) => (
                <article className='px-4 py-3' key={`${event.id}-${event.occurredAt}`}>
                  <div className='flex items-start justify-between gap-3'>
                    <h3 className='text-[13px] font-bold text-text-primary'>{event.title}</h3>
                    <span className='shrink-0 text-[11px] text-text-tertiary'>{event.occurredAt}</span>
                  </div>
                  {event.detail ? <p className='mt-1 text-[12px] leading-normal text-text-secondary'>{event.detail}</p> : null}
                  <p className='mt-1 text-[11px] text-text-tertiary'>{event.actor}</p>
                </article>
              ))}
              {events.length === 0 ? (
                <div className='px-4 py-6 text-[13px] text-text-tertiary'>イベント履歴はまだありません。</div>
              ) : null}
            </div>
          </section>

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
