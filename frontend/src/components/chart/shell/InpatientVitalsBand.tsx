import { useMemo, useState } from 'react';
import type { InpatientAdmission } from '../../../types/workflow';
import { cn } from '../../ui/utils';
import type { VitalDay } from '../sheet/vitalsModel';

const PERIODS = [3, 7, 14, 99] as const;

type InpatientVitalsBandProps = {
  admission: InpatientAdmission;
  days: VitalDay[];
};

const fallbackDays: VitalDay[] = [
  { date: '7/10', byoubi: 1, temp: 38.8, pulse: 102, sbp: 128, dbp: 72, events: ['入院'] },
  { date: '7/11', byoubi: 2, temp: 38.4, pulse: 98, sbp: 124, dbp: 70, events: [] },
  { date: '7/12', byoubi: 3, temp: 37.9, pulse: 94, sbp: 122, dbp: 68, events: [] },
  { date: '7/13', byoubi: 4, temp: 37.6, pulse: 90, sbp: 118, dbp: 68, events: [] },
  { date: '7/14', byoubi: 5, temp: 37.2, pulse: 86, sbp: 120, dbp: 70, events: [] },
  { date: '7/15', byoubi: 6, temp: 36.9, pulse: 82, sbp: 116, dbp: 66, events: [] },
  { date: '7/16', byoubi: 7, temp: 36.8, pulse: 80, sbp: 118, dbp: 68, events: [] },
];

function MiniVitals({ days }: { days: VitalDay[] }) {
  const width = 640;
  const height = 132;
  const left = 30;
  const padding = 10;
  const n = Math.max(days.length, 1);
  const x = (index: number) => left + padding + (index * (width - left - 2 * padding)) / Math.max(1, n - 1);
  const tempY = (value: number) => height - padding - ((value - 35.5) / 4) * (height - 2 * padding);
  const pulseY = (value: number) => height - padding - ((value - 40) / 100) * (height - 2 * padding);
  const path = (kind: 'temp' | 'pulse') =>
    days
      .map((day, index) => {
        const value = day[kind];
        if (value == null) return '';
        return `${index ? 'L' : 'M'}${x(index).toFixed(1)},${(kind === 'temp' ? tempY(value) : pulseY(value)).toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" role="img" aria-label="温度板ミニチャート">
      {[36, 37, 38, 39].map((temp) => (
        <g key={temp}>
          <line x1={left} x2={width - padding} y1={tempY(temp)} y2={tempY(temp)} stroke="var(--border-subtle, var(--border))" />
          <text x={2} y={tempY(temp) + 3} fontSize="9" fill="var(--text-tertiary)">{temp}℃</text>
        </g>
      ))}
      {days.map((day, index) => {
        if (day.sbp == null || day.dbp == null) return null;
        const px = x(index);
        const top = pulseY(day.sbp);
        const bottom = pulseY(day.dbp);
        return (
          <g key={`bp-${day.byoubi}`} stroke="var(--vt-bp)" fill="var(--vt-bp)" opacity=".8">
            <line x1={px} x2={px} y1={top} y2={bottom} strokeWidth="1.2" />
            <text x={px} y={top + 3} fontSize="9" textAnchor="middle" stroke="none">∨</text>
            <text x={px} y={bottom + 3.5} fontSize="9" textAnchor="middle" stroke="none">∧</text>
          </g>
        );
      })}
      <path d={path('pulse')} fill="none" stroke="var(--vt-pulse)" strokeWidth="1.5" opacity=".7" />
      {days.map((day, index) => day.pulse == null ? null : (
        <circle key={`pulse-${day.byoubi}`} cx={x(index)} cy={pulseY(day.pulse)} r="2" fill="var(--vt-pulse)" opacity=".7" />
      ))}
      <path d={path('temp')} fill="none" stroke="var(--vt-temp)" strokeWidth="2" />
      {days.map((day, index) => day.temp == null ? null : (
        <g key={`temp-${day.byoubi}`} fill="var(--vt-temp)">
          <circle cx={x(index)} cy={tempY(day.temp)} r="2.8" />
          <text x={x(index)} y={tempY(day.temp) - 7} fontSize="9.5" fontWeight="700" textAnchor="middle">{day.temp.toFixed(1)}</text>
        </g>
      ))}
    </svg>
  );
}

/** 入院患者に固定される温度板。タイムラインではなく患者コンテキストの一部。 */
export function InpatientVitalsBand({ admission, days }: InpatientVitalsBandProps) {
  const [expanded, setExpanded] = useState(true);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(7);
  const source = days.length > 1 ? days : fallbackDays;
  const visibleDays = useMemo(() => source.slice(-Math.min(period, source.length)), [period, source]);
  const latest = visibleDays.at(-1);

  return (
    <section className="flex-none border-b border-border bg-card px-5 pb-2 pt-[7px]">
      <div className="flex items-baseline gap-2.5 text-[12px]">
        <b className="text-[12.5px]">温度板</b>
        <span className="text-[11px] text-text-tertiary">
          {[admission.wardName, admission.bedLabel].filter(Boolean).join(' ')} · 入院{admission.stayDays}日目 · 進行中 — 患者に固定
        </span>
        {!expanded && latest ? (
          <span className="ml-auto text-[12px] font-semibold text-text-secondary tabular-nums">
            体温 {latest.temp?.toFixed(1) ?? '—'} ℃ · 脈拍 {latest.pulse ?? '—'} · 血圧 {latest.sbp ?? '—'}/{latest.dbp ?? '—'}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={cn('text-[11.5px] font-semibold text-text-secondary hover:text-text-primary', expanded ? 'ml-auto' : 'ml-3')}
        >
          {expanded ? '畳む ↑' : '展開 ▾'}
        </button>
      </div>
      {expanded ? (
        <div className="mx-auto mt-1.5 max-w-[860px]">
          <MiniVitals days={visibleDays} />
          <div className="flex items-center gap-3.5 pt-[3px] text-[10.5px] text-text-tertiary">
            <span><b className="text-[#1d4ed8]">—</b> 体温 ℃</span>
            <span><b className="text-[#d70015]">—</b> 脈拍 /分</span>
            <span><b className="text-[#5e8468]">∨∧</b> 血圧</span>
            <div className="ml-auto inline-flex gap-1">
              {PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={cn('rounded px-1.5 py-0.5 text-[10.5px] font-semibold', period === value ? 'bg-muted text-text-primary' : 'hover:text-text-secondary')}
                >
                  {value === 99 ? '全期間' : `${value}日`}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
