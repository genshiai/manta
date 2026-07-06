import { TriangleAlert } from 'lucide-react';
import type { PatientRecord } from '../../../data/chartMock';
import { cn } from '../../ui/utils';
import { Kbd } from '../primitives/Kbd';

type PatientBarProps = {
  patient: PatientRecord;
  metaLine: string;
  saveDot: 'ok' | 'warn' | 'bad';
  saveText: string;
  finishLabel: string;
  writeMode: boolean;
  isMutating: boolean;
  onStartWrite: () => void;
  onFinishVisit: () => void;
  onFinishWriting: () => void;
};

const chipStyle: Record<'bad' | 'warn' | 'mut', string> = {
  bad: 'bg-destructive-bg text-destructive',
  warn: 'bg-warning-bg text-warning',
  mut: 'bg-muted text-text-secondary',
};

function alertVariant(color: string): 'bad' | 'warn' | 'mut' {
  if (['red', 'magenta', 'purple'].includes(color)) return 'bad';
  if (['orange', 'yellow', 'lime'].includes(color)) return 'warn';
  return 'mut';
}

const dotStyle: Record<'ok' | 'warn' | 'bad', string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-destructive',
};

/** PatientBar 50px。氏名・カナ・メタ・アレルギー・保存状態・CTA。KARTE_UI_SPEC §3 */
export function PatientBar({
  patient,
  metaLine,
  saveDot,
  saveText,
  finishLabel,
  writeMode,
  isMutating,
  onStartWrite,
  onFinishVisit,
  onFinishWriting,
}: PatientBarProps) {
  return (
    <>
      <div className="flex items-baseline gap-2.5 whitespace-nowrap">
        <span className="text-[16px] font-bold tracking-[-0.01em] text-text-primary">{patient.name}</span>
        <span className="text-[10.5px] font-medium text-text-tertiary">{patient.kana}</span>
        <span className="text-[12px] text-text-tertiary tabular-nums">{metaLine}</span>
      </div>

      {patient.alerts.map((alert) => {
        const variant = alertVariant(alert.color);
        return (
          <span
            key={alert.label}
            className={cn(
              'inline-flex h-[21px] items-center gap-1 rounded-md px-2 text-[11px] font-semibold whitespace-nowrap',
              chipStyle[variant],
            )}
          >
            {variant === 'bad' ? <TriangleAlert size={12} strokeWidth={1.9} /> : null}
            {alert.label}
          </span>
        );
      })}

      <div className="flex-1" />

      <span className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-text-tertiary">
        <span className={cn('size-1.5 rounded-full', dotStyle[saveDot])} />
        {saveText}
      </span>

      {writeMode ? (
        <button
          type="button"
          onClick={onFinishWriting}
          disabled={isMutating}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
        >
          書き終える <Kbd className="border-white/50 bg-transparent text-white">⌘⏎</Kbd>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onStartWrite}
            className="inline-flex h-7 items-center gap-1.5 rounded-[7px] border border-border bg-card px-2.5 text-[12px] font-semibold text-text-primary transition-colors hover:bg-surface-subtle"
          >
            ＋ 本日の記載 <Kbd>E</Kbd>
          </button>
          <button
            type="button"
            onClick={onFinishVisit}
            disabled={isMutating}
            className="inline-flex h-8 items-center rounded-full bg-brand px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            {finishLabel}
          </button>
        </>
      )}
    </>
  );
}
