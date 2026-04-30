import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, Clock3, FlaskConical, Save, Stethoscope, UsersRound } from 'lucide-react';
import { Button } from '../ui/button';
import type { PatientRecord } from '../../data/chartMock';
import type { UserSession } from '../../types/workflow';

const pressableTopBarClassName =
  'cursor-pointer transition-[background-color,border-color,box-shadow,transform,color] duration-150 ease-out hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:shadow-none';

type ChartTopBarProps = {
  patient: PatientRecord;
  availablePatients: PatientRecord[];
  recentPatients: PatientRecord[];
  currentUser: UserSession;
  isDirty: boolean;
  isMutating: boolean;
  saveMessage: string;
  lastSavedAt: string | null;
  version: number;
  abnormalLabCount: number;
  onOpenPatient: (patient: PatientRecord) => void;
  onSave: () => void;
  onReturnReception: () => void;
  onFinishVisit: () => void;
  onOpenLabs: () => void;
};

type PatientSwitchSection = {
  title: string;
  icon: typeof UsersRound;
  patients: PatientRecord[];
  emptyText: string;
};

const uniquePatients = (patients: PatientRecord[]) => {
  const seen = new Set<string>();

  return patients.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
};

const PatientSwitchItem = ({
  patient,
  currentPatientId,
  onSelect,
}: {
  patient: PatientRecord;
  currentPatientId: string;
  onSelect: (patient: PatientRecord) => void;
}) => {
  const isCurrent = patient.id === currentPatientId;

  return (
    <button
      className={`w-full rounded-md px-3 py-2 text-left ${
        isCurrent ? 'cursor-default bg-brand-tint text-brand' : `${pressableTopBarClassName} hover:bg-surface-subtle`
      }`}
      disabled={isCurrent}
      onClick={() => onSelect(patient)}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold">{patient.name}</span>
        <span className="shrink-0 text-[11px] text-text-tertiary">{isCurrent ? '表示中' : patient.status}</span>
      </div>
      <p className="mt-0.5 truncate text-[12px] text-text-tertiary">
        {patient.age} {patient.sex} / {patient.department} ・ 担当: {patient.doctor}
      </p>
    </button>
  );
};

/**
 * カルテ画面のトップバー。
 * - 患者基本情報・保存状態を 1 行で
 * - 受付へ戻る / 保存 / 診察終了
 * - 左/中央/右ペインの上に sticky で常時表示
 */
export const ChartTopBar = ({
  patient,
  availablePatients,
  recentPatients,
  currentUser,
  isDirty,
  isMutating,
  saveMessage,
  lastSavedAt,
  version,
  abnormalLabCount,
  onOpenPatient,
  onSave,
  onReturnReception,
  onFinishVisit,
  onOpenLabs,
}: ChartTopBarProps) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const patientSections = useMemo<PatientSwitchSection[]>(() => {
    const currentDepartmentPatients = availablePatients.filter(
      (item) => item.department === currentUser.department && item.doctor !== currentUser.displayName,
    );
    const assignedPatients = availablePatients.filter((item) => item.doctor === currentUser.displayName);
    const recentSwitchPatients = recentPatients.filter((item) => item.id !== patient.id);

    return [
      {
        title: '担当患者',
        icon: Stethoscope,
        patients: uniquePatients(assignedPatients),
        emptyText: '担当医が自分の患者はいません',
      },
      {
        title: '同じ診療科',
        icon: UsersRound,
        patients: uniquePatients(currentDepartmentPatients).slice(0, 5),
        emptyText: '同じ診療科の患者はいません',
      },
      {
        title: '最近開いた患者',
        icon: Clock3,
        patients: uniquePatients(recentSwitchPatients).slice(0, 5),
        emptyText: '最近開いた患者はまだありません',
      },
    ];
  }, [availablePatients, currentUser.department, currentUser.displayName, patient.id, recentPatients]);

  const handleSelectPatient = (nextPatient: PatientRecord) => {
    if (nextPatient.id === patient.id) {
      return;
    }

    if (isDirty && !window.confirm('未保存のカルテがあります。保存せずに患者を切り替えますか？')) {
      return;
    }

    setSwitcherOpen(false);
    onOpenPatient(nextPatient);
  };

  return (
  <div className="flex items-center gap-4 px-6 py-3">
    <button
      type="button"
      onClick={onReturnReception}
      className={`${pressableTopBarClassName} flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary`}
    >
      <ArrowLeft size={16} />
      ホーム
    </button>

    <div className="relative min-w-0 flex-1">
      <button
        className={`${pressableTopBarClassName} flex min-w-0 max-w-full items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-surface-subtle`}
        onClick={() => setSwitcherOpen((current) => !current)}
        type="button"
      >
        <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-tint text-[14px] font-bold text-brand">
          {patient.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[16px] font-bold leading-snug text-text-primary">{patient.name}</p>
            <span className="shrink-0 text-[13px] text-text-tertiary">
              {patient.age} {patient.sex}
            </span>
            <span className="shrink-0 rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[12px] font-medium text-text-secondary">
              ID {patient.id}
            </span>
          </div>
          <p className="truncate text-[12px] text-text-tertiary">
            {patient.department} ・ 担当: {patient.doctor} ・ v{version}
            {lastSavedAt ? ` ・ 最終保存 ${lastSavedAt}` : ''}
          </p>
        </div>
        <ChevronDown size={16} className="shrink-0 text-text-tertiary" />
      </button>

      {switcherOpen ? (
        <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-[28rem] max-w-[calc(100vw-2rem)] rounded-8 border border-border bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div>
              <p className="text-[13px] font-bold text-text-primary">患者を切り替え</p>
              <p className="mt-0.5 text-[12px] text-text-tertiary">担当患者、同じ診療科、最近開いた患者</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSwitcherOpen(false)}>
              閉じる
            </Button>
          </div>

          <div className="max-h-[32rem] space-y-3 overflow-y-auto">
            {patientSections.map((section) => {
              const Icon = section.icon;

              return (
                <section key={section.title}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[12px] font-bold text-text-secondary">
                    <Icon size={13} />
                    {section.title}
                  </div>
                  <div className="space-y-1">
                    {section.patients.length > 0 ? (
                      section.patients.map((item) => (
                        <PatientSwitchItem
                          currentPatientId={patient.id}
                          key={`${section.title}-${item.id}`}
                          onSelect={handleSelectPatient}
                          patient={item}
                        />
                      ))
                    ) : (
                      <p className="rounded-md bg-surface-subtle px-3 py-2 text-[12px] text-text-tertiary">
                        {section.emptyText}
                      </p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : null}
      </div>

    <div className="flex items-center gap-3">
      <span
        className={`text-[12px] font-medium ${
          isDirty ? 'text-warning' : 'text-text-tertiary'
        }`}
      >
        {isDirty ? '● 未保存' : saveMessage || '保存済み'}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenLabs}
        title="検査結果・トレンド"
        className="relative"
      >
        <FlaskConical size={16} />
        検査結果
        {abnormalLabCount > 0 ? (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-warning/20 px-1.5 text-[10px] font-bold text-warning">
            {abnormalLabCount}
          </span>
        ) : null}
      </Button>
      <Button variant="secondary" size="sm" onClick={onSave} disabled={isMutating || !isDirty}>
        <Save size={16} />
        保存
      </Button>
      <Button variant="default" size="sm" onClick={onFinishVisit} disabled={isMutating}>
        診察終了
      </Button>
      <span className="text-[12px] text-text-tertiary">{currentUser.displayName}</span>
    </div>
  </div>
  );
};
