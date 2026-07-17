import type { PatientRecord } from '../../../data/chartMock';
import { Kbd } from '../primitives/Kbd';

type PatientBarProps = {
  patient: PatientRecord;
  metaLine: string;
  admissionLabel?: string;
  problemLine?: string;
  saveDot: 'ok' | 'warn' | 'bad';
  saveText: string;
  finishLabel: string;
  writeMode: boolean;
  isMutating: boolean;
  onStartWrite: () => void;
  onOpenOrder: () => void;
  onFinishVisit: () => void;
  onFinishWriting: () => void;
  onManageSafety: () => void;
};

/** PatientBar 50px。氏名・カナ・メタ・アレルギー・保存状態・CTA。KARTE_UI_SPEC §3 */
export function PatientBar({
  patient,
  metaLine,
  admissionLabel,
  problemLine,
  saveDot: _saveDot,
  saveText,
  finishLabel,
  writeMode,
  isMutating,
  onStartWrite,
  onOpenOrder,
  onFinishVisit,
  onFinishWriting,
  onManageSafety,
}: PatientBarProps) {
  const safetyAlerts = patient.alerts.filter((alert) =>
    /(アレルギ|同姓同名|副反応|禁忌|回避|リスク|転倒|感染|隔離|妊娠|抗凝固|透析|ペースメーカー)/.test(alert.label),
  );
  return (
    <>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="text-[16px] font-bold tracking-[-0.01em] text-text-primary">{patient.name}</span>
        <span className="text-[10.5px] font-medium text-text-tertiary">{patient.kana}</span>
        <span className="text-[12px] text-text-tertiary tabular-nums">{metaLine}</span>
      </div>

      {admissionLabel ? (
        <span className="rounded-[5px] bg-brand-tint px-[7px] py-px text-[10.5px] font-bold text-brand">{admissionLabel}</span>
      ) : null}

      {safetyAlerts.slice(0, 2).map((alert) => (
        <button
          type='button'
          key={alert.label}
          onClick={onManageSafety}
          className="whitespace-nowrap rounded-[5px] border border-[#ecd6d1] bg-[#faf0ee] px-[7px] py-[1.5px] text-[11.5px] font-semibold text-[#a8453d]"
          title="患者安全情報。処方・検査時に必ず確認"
        >
          {alert.label}
        </button>
      ))}
      {safetyAlerts.length > 2 ? (
        <button type='button' onClick={onManageSafety} className="text-[10.5px] font-semibold text-text-tertiary hover:text-text-primary">ほか {safetyAlerts.length - 2}</button>
      ) : null}
      {!safetyAlerts.length ? <button type='button' onClick={onManageSafety} className='whitespace-nowrap text-[10.5px] font-semibold text-text-tertiary hover:text-text-primary'>安全情報</button> : null}

      {problemLine ? <span className="min-w-0 truncate text-[12px] text-text-tertiary">{problemLine}</span> : null}

      <div className="ms-auto flex items-center gap-2">
        <span className="me-0.5 whitespace-nowrap text-[11.5px] text-text-tertiary">{saveText}</span>

        {writeMode ? (
        <button
          type="button"
          onClick={onFinishWriting}
          disabled={isMutating}
          className="inline-flex items-center gap-[7px] rounded-lg border border-brand bg-brand px-3 py-[6.5px] text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          書き終える <Kbd className="border-white/50 bg-transparent text-white">⌘⏎</Kbd>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onOpenOrder}
            className="inline-flex items-center gap-[7px] rounded-lg border border-border-strong bg-card px-3 py-[6.5px] text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-surface-page"
          >
            ＋ オーダー <Kbd>⌘O</Kbd>
          </button>
          <button
            type="button"
            onClick={onStartWrite}
            className="inline-flex items-center gap-[7px] rounded-lg border border-border-strong bg-card px-3 py-[6.5px] text-[12.5px] font-semibold text-text-secondary transition-colors hover:bg-surface-page"
          >
            ＋ 本日の記載 <Kbd>E</Kbd>
          </button>
          <button
            type="button"
            onClick={onFinishVisit}
            disabled={isMutating}
            className="inline-flex items-center rounded-lg border border-brand bg-brand px-3 py-[6.5px] text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {finishLabel}
          </button>
        </>
      )}
      </div>
    </>
  );
}
