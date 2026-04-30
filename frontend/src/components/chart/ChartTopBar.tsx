import { ArrowLeft, FlaskConical, Save } from 'lucide-react';
import { Button } from '../ui/button';
import type { PatientRecord } from '../../data/chartMock';
import type { UserSession } from '../../types/workflow';

type ChartTopBarProps = {
  patient: PatientRecord;
  currentUser: UserSession;
  isDirty: boolean;
  isMutating: boolean;
  saveMessage: string;
  lastSavedAt: string | null;
  version: number;
  abnormalLabCount: number;
  onSave: () => void;
  onReturnReception: () => void;
  onFinishVisit: () => void;
  onOpenLabs: () => void;
};

/**
 * カルテ画面のトップバー。
 * - 患者基本情報・保存状態を 1 行で
 * - 受付へ戻る / 保存 / 診察終了
 * - 左/中央/右ペインの上に sticky で常時表示
 */
export const ChartTopBar = ({
  patient,
  currentUser,
  isDirty,
  isMutating,
  saveMessage,
  lastSavedAt,
  version,
  abnormalLabCount,
  onSave,
  onReturnReception,
  onFinishVisit,
  onOpenLabs,
}: ChartTopBarProps) => (
  <div className="flex items-center gap-4 px-6 py-3">
    <button
      type="button"
      onClick={onReturnReception}
      className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-text-secondary hover:bg-surface-subtle hover:text-text-primary"
    >
      <ArrowLeft size={16} />
      ホーム
    </button>

    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-tint text-[14px] font-bold text-brand">
        {patient.name.slice(0, 1)}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[16px] font-bold leading-snug text-text-primary">{patient.name}</p>
          <span className="text-[13px] text-text-tertiary">
            {patient.age} {patient.sex} / ID: {patient.id}
          </span>
        </div>
        <p className="text-[12px] text-text-tertiary">
          {patient.department} ・ 担当: {patient.doctor} ・ v{version}
          {lastSavedAt ? ` ・ 最終保存 ${lastSavedAt}` : ''}
        </p>
      </div>
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
