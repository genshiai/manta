import { PinOff, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import type { PatientRecord } from '../../../data/chartMock';
import type { PatientProfileEntry, ProblemListItem } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import type { SummaryContract } from '../summary/summaryModel';

type StoryboardPanelProps = {
  patient: PatientRecord;
  profile: PatientProfileEntry[];
  problems: ProblemListItem[];
  summary: SummaryContract;
  visitDates: string[];
  month: { year: number; month: number };
  today: string;
  onAddProblem: () => void;
  onExpandSummary: () => void;
  onJumpDate: (date: string) => void;
  onUnpin: () => void;
};

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];

function buildCalendar(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const cells: Array<{ day: number; iso: string; muted: boolean }> = [];
  const prevDays = new Date(year, month - 1, 0).getDate();
  for (let i = lead - 1; i >= 0; i--) {
    cells.push({ day: prevDays - i, iso: '', muted: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, iso, muted: false });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length, iso: '', muted: true });
  }
  return cells;
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0">{children}</div>;
}

function Label({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-text-tertiary">
      {children}
      <span className="flex-1" />
      {action}
    </div>
  );
}

/** 左ストーリーボード（患者基本・AI全文・アレルギー・プロブレム・暦）。KARTE_UI_SPEC §7 */
export function StoryboardPanel({
  patient,
  profile,
  problems,
  summary,
  visitDates,
  month,
  today,
  onAddProblem,
  onExpandSummary,
  onJumpDate,
  onUnpin,
}: StoryboardPanelProps) {
  const dob = profile.find((p) => /生年月日|誕生|DOB/i.test(p.label))?.value;
  const blood = profile.find((p) => /血液|血液型/i.test(p.label))?.value;
  const doctor = patient.doctor;
  const visitSet = new Set(visitDates);
  const cells = buildCalendar(month.year, month.month);
  const activeProblems = problems.filter((p) => p.status !== 'resolved');

  return (
    <aside className="flex h-full w-[296px] flex-none flex-col overflow-y-auto border-r border-border bg-card">
      <Section>
        <div className="flex items-center gap-3">
          <span className="grid size-[38px] flex-none place-items-center rounded-full bg-brand-tint text-[15px] font-bold text-brand">
            {patient.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-[1.3] text-text-primary">{patient.name}</div>
            <div className="text-[11.5px] text-text-tertiary tabular-nums">
              {[dob, `${patient.age}歳`, patient.sex, blood, doctor].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" aria-label="ピンを外す" onClick={onUnpin} className="ms-auto text-text-tertiary hover:text-text-secondary">
            <PinOff size={13} strokeWidth={1.7} />
          </button>
        </div>
      </Section>

      <Section>
        <div className="flex flex-col gap-1.5 rounded-[9px] border border-border bg-surface-subtle px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-brand">
            <Sparkles size={12} strokeWidth={1.8} /> AIサマリー
            <span className="ms-auto font-medium text-text-tertiary tabular-nums">{summary.generatedAt} 更新</span>
          </div>
          <p className="text-[12.5px] leading-[1.7] text-text-primary">{summary.paragraphs[0]}</p>
          <div className="flex gap-2 text-[10.5px] text-text-tertiary">
            <span>{summary.generatedFrom}生成</span>
            <button type="button" onClick={onExpandSummary} className="text-brand">
              根拠 ›
            </button>
          </div>
        </div>
      </Section>

      {patient.alerts.length > 0 ? (
        <Section>
          <Label>アレルギー・注意</Label>
          {patient.alerts.map((a) => (
            <div
              key={a.label}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] leading-[1.5] text-destructive"
              style={{ borderColor: 'color-mix(in srgb, var(--destructive) 32%, transparent)', background: 'var(--destructive-bg)' }}
            >
              <TriangleAlert size={14} strokeWidth={1.8} className="flex-none" />
              <span>{a.label}</span>
            </div>
          ))}
        </Section>
      ) : null}

      <Section>
        <Label
          action={
            <button type="button" aria-label="病名を追加" onClick={onAddProblem} className="text-text-tertiary hover:text-brand">
              <Plus size={13} strokeWidth={1.9} />
            </button>
          }
        >
          プロブレム
        </Label>
        {activeProblems.map((p) => (
          <div key={p.name} className="flex flex-col gap-0.5 rounded-[7px] px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
              <span className="size-1.5 rounded-full bg-brand" />
              {p.name}
              {p.icd10Code ? (
                <span className="rounded bg-muted px-1.5 text-[10px] font-semibold text-text-secondary">{p.icd10Code}</span>
              ) : null}
            </div>
            <div className="pl-[13px] text-[11px] text-text-tertiary tabular-nums">
              {p.since} 〜{p.diagnosisType === 'principal' ? ' · 主病名' : ''}
            </div>
          </div>
        ))}
      </Section>

      <Section>
        <Label action={<span className="text-[11px] text-text-tertiary">‹ ›</span>}>
          {month.year}年{month.month}月
        </Label>
        <div className="grid grid-cols-7 gap-px text-center text-[10px] text-text-tertiary tabular-nums">
          {WEEK.map((w) => (
            <span key={w} className="py-0.5 font-semibold">
              {w}
            </span>
          ))}
          {cells.map((cell, i) => {
            const hasVisit = cell.iso && visitSet.has(cell.iso);
            const isToday = cell.iso === today;
            return (
              <button
                key={cell.iso || `blank-${i}`}
                type="button"
                disabled={!cell.iso || !hasVisit}
                onClick={() => cell.iso && onJumpDate(cell.iso)}
                className={cn(
                  'relative rounded-[5px] py-[3px]',
                  cell.muted && 'text-text-disabled',
                  isToday && 'bg-brand font-bold text-white',
                  hasVisit && !isToday && 'font-semibold text-text-primary',
                )}
              >
                {cell.day}
                {hasVisit && !isToday ? (
                  <span className="absolute bottom-0 left-1/2 size-[3px] -translate-x-1/2 rounded-full bg-brand" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1">
          {[month.year, month.year - 1, month.year - 2].map((y, idx) => (
            <span
              key={y}
              className={cn(
                'flex-1 rounded-md border py-0.5 text-center text-[10.5px] font-semibold',
                idx === 0 ? 'border-brand bg-brand-tint text-brand' : 'border-border text-text-tertiary',
              )}
            >
              {y}
            </span>
          ))}
        </div>
      </Section>
    </aside>
  );
}
