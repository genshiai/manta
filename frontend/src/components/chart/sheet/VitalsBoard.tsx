import { cn } from '../../ui/utils';
import { bpY, pulseY, tempY, type VitalDay, VT, vtX } from './vitalsModel';

const PERIODS = ['3日', '7日', '14日', '全期間'] as const;
export type VitalsPeriod = (typeof PERIODS)[number];

type VitalsBoardProps = {
  days: VitalDay[];
  rangeLabel: string;
  subLabel: string;
  period: VitalsPeriod;
  onPrev: () => void;
  onNext: () => void;
  onPeriodChange: (period: VitalsPeriod) => void;
};

/** 温度板（SVG）。KARTE_UI_SPEC §8.2。体温=青・脈拍=赤・血圧=∨∧（標準配色・変更禁止）。 */
export function VitalsBoard({
  days,
  rangeLabel,
  subLabel,
  period,
  onPrev,
  onNext,
  onPeriodChange,
}: VitalsBoardProps) {
  const n = days.length;
  const gridLinesY = [20, 69, 118, 166, 215, 264];
  const leftAxis = ['40', '39', '38', '37', '36', '35'];
  const rightAxis = ['140', '120', '100', '80', '60', '40'];

  const tempPts = days.map((d, i) => (d.temp != null ? `${vtX(i, n)},${tempY(d.temp)}` : null));
  const pulsePts = days.map((d, i) => (d.pulse != null ? `${vtX(i, n)},${pulseY(d.pulse)}` : null));
  const tempLine = tempPts.filter(Boolean).join(' ');
  const pulseLine = pulsePts.filter(Boolean).join(' ');

  return (
    <div className="overflow-hidden rounded-[10px] border border-border">
      {/* toolbar */}
      <div className="flex items-center gap-2.5 border-b border-border bg-card px-3.5 py-2.5">
        <button type="button" onClick={onPrev} aria-label="前の期間" className="grid size-7 place-items-center rounded-lg border border-border text-text-secondary">
          ‹
        </button>
        <div>
          <div className="text-[14px] font-bold text-text-primary tabular-nums">{rangeLabel}</div>
          <div className="text-[10.5px] text-text-tertiary">{subLabel}</div>
        </div>
        <button type="button" onClick={onNext} aria-label="次の期間" className="grid size-7 place-items-center rounded-lg border border-border text-text-secondary">
          ›
        </button>
        <span className="flex-1" />
        <div className="inline-flex gap-0.5 rounded-lg bg-[var(--seg-bg,rgba(0,0,0,.05))] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={cn(
                'rounded-md px-2.5 py-0.5 text-[11px] font-semibold',
                period === p ? 'bg-card text-text-primary shadow-[var(--shadow-popover)]' : 'text-text-secondary',
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="flex items-center gap-3.5 border-b border-border bg-surface-subtle px-3.5 py-2 text-[11px] text-text-secondary">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span className="h-[3px] w-3.5 rounded-sm" style={{ background: 'var(--vt-temp)' }} /> 体温 ℃（左軸）
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span className="h-[3px] w-3.5 rounded-sm" style={{ background: 'var(--vt-pulse)' }} /> 脈拍 /分（右軸）
        </span>
        <span className="font-semibold" style={{ color: 'var(--vt-bp)' }}>
          ∨∧ 血圧
        </span>
        <span className="ms-auto text-text-tertiary">標準配色: 体温=青・脈拍=赤・血圧=∨∧（看護教材準拠）</span>
      </div>

      {/* svg */}
      <svg viewBox={`0 0 ${VT.viewW} ${VT.viewH}`} className="block h-auto w-full bg-card" role="img" aria-label="温度板: 体温・脈拍・血圧の推移">
        <g stroke="var(--border)" strokeWidth="1">
          {gridLinesY.map((y) => (
            <line key={`h${y}`} x1={52} y1={y} x2={1000} y2={y} />
          ))}
          {days.map((d, i) => {
            const x = vtX(i, n);
            return <line key={`v${d.byoubi}`} x1={x} y1={14} x2={x} y2={268} />;
          })}
        </g>
        <g fontSize="11" fill="var(--text-tertiary)" fontFamily="inherit">
          {leftAxis.map((label, i) => (
            <text key={`la${label}`} x={44} y={gridLinesY[i] + 4} textAnchor="end">
              {label}
            </text>
          ))}
          {rightAxis.map((label, i) => (
            <text key={`ra${label}`} x={1008} y={gridLinesY[i] + 4} textAnchor="start">
              {label}
            </text>
          ))}
        </g>

        {/* 前期間の続きヒント */}
        {n > 0 && days[0].temp != null ? (
          <>
            <polyline points={`18,${tempY(days[0].temp) - 18} ${vtX(0, n)},${tempY(days[0].temp)}`} fill="none" stroke="var(--vt-temp)" strokeWidth="2" strokeDasharray="3 5" opacity="0.3" />
            <circle cx={18} cy={tempY(days[0].temp) - 18} r={2.8} fill="var(--vt-temp)" opacity="0.3" />
          </>
        ) : null}

        {/* 血圧 ∨∧ */}
        <g stroke="var(--vt-bp)" strokeWidth="1.6" opacity="0.9" fill="none">
          {days.map((d, i) => {
            if (d.sbp == null || d.dbp == null) return null;
            const x = vtX(i, n);
            const sy = bpY(d.sbp);
            const dy = bpY(d.dbp);
            return (
              <g key={`bp${d.byoubi}`}>
                <line x1={x} y1={sy} x2={x} y2={dy} />
                <path d={`M${x - 5} ${sy - 5} ${x} ${sy} ${x + 5} ${sy - 5}M${x - 5} ${dy + 5} ${x} ${dy} ${x + 5} ${dy + 5}`} />
              </g>
            );
          })}
        </g>

        {/* 脈拍（赤） */}
        {pulseLine ? <polyline points={pulseLine} fill="none" stroke="var(--vt-pulse)" strokeWidth="2" /> : null}
        <g fill="var(--vt-pulse)">
          {days.map((d, i) => (d.pulse != null ? <circle key={`p${d.byoubi}`} cx={vtX(i, n)} cy={pulseY(d.pulse)} r={3} /> : null))}
        </g>

        {/* 体温（青）+ 数値直書き */}
        {tempLine ? <polyline points={tempLine} fill="none" stroke="var(--vt-temp)" strokeWidth="2.6" /> : null}
        <g fill="var(--vt-temp)">
          {days.map((d, i) => (d.temp != null ? <circle key={`t${d.byoubi}`} cx={vtX(i, n)} cy={tempY(d.temp)} r={3.6} /> : null))}
        </g>
        <g fontSize="11.5" fill="var(--vt-temp)" fontFamily="inherit" textAnchor="middle" fontWeight="700">
          {days.map((d, i) => (d.temp != null ? <text key={`tv${d.byoubi}`} x={vtX(i, n)} y={tempY(d.temp) - 12}>{d.temp.toFixed(1)}</text> : null))}
        </g>

        {/* x軸: 暦日 + 病日 */}
        <g fontSize="12" fill="var(--text)" fontFamily="inherit" textAnchor="middle" fontWeight="600">
          {days.map((d, i) => (
            <text key={`dt${d.byoubi}`} x={vtX(i, n)} y={292}>
              {d.date}
            </text>
          ))}
        </g>
        <g fontSize="10" fill="var(--text-tertiary)" fontFamily="inherit" textAnchor="middle">
          {days.map((d, i) => (
            <text key={`by${d.byoubi}`} x={vtX(i, n)} y={308}>
              {i === 0 ? `病日${d.byoubi}` : d.byoubi}
            </text>
          ))}
        </g>
      </svg>

      {/* 下段グリッド */}
      <div
        className="grid border-t border-border text-[11px] tabular-nums"
        style={{ gridTemplateColumns: `88px repeat(${n}, minmax(0, 1fr))` }}
      >
        <VitalRow label="体温 ℃" values={days.map((d) => (d.temp != null ? d.temp.toFixed(1) : '—'))} />
        <VitalRow label="脈拍" values={days.map((d) => (d.pulse != null ? String(d.pulse) : '—'))} />
        <VitalRow label="血圧" values={days.map((d) => (d.sbp != null && d.dbp != null ? `${d.sbp}/${d.dbp}` : '—'))} />
        <VitalRow label="SpO₂ %" values={days.map((d) => (d.spo2 != null ? String(d.spo2) : '—'))} />
        <VitalRow label="酸素" values={days.map((d) => d.o2 || '—')} />
        <VitalRow label="抗菌薬" values={days.map((d) => d.abx || '')} abx />
        <VitalRow label="食事" values={days.map((d) => d.meal || '—')} />
        <EventsRow label="イベント" days={days} last />
      </div>
    </div>
  );
}

function Cell({ children, header, abx, className }: { children?: React.ReactNode; header?: boolean; abx?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        'border-b border-r border-border px-2 py-[5px] text-center last:border-r-0',
        header ? 'text-left text-[10.5px] font-semibold text-text-tertiary' : 'text-text-primary',
        abx && children ? 'bg-brand-tint text-[10px] font-bold text-brand' : '',
        className,
      )}
    >
      {children}
    </div>
  );
}

function VitalRow({ label, values, abx, last }: { label: string; values: string[]; abx?: boolean; last?: boolean }) {
  return (
    <>
      <Cell header className={last ? 'border-b-0' : ''}>
        {label}
      </Cell>
      {values.map((v, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 列位置が識別子（値は重複しうる）
        <Cell key={`${label}-${i}`} abx={abx} className={last ? 'border-b-0' : ''}>
          {v}
        </Cell>
      ))}
    </>
  );
}

function EventsRow({ label, days, last }: { label: string; days: VitalDay[]; last?: boolean }) {
  return (
    <>
      <Cell header className={last ? 'border-b-0' : ''}>
        {label}
      </Cell>
      {days.map((d) => (
        <Cell key={`ev-${d.byoubi}`} className={last ? 'border-b-0' : ''}>
          {d.events.map((e) => (
            <span key={e} className="mx-px inline-flex rounded bg-muted px-1 text-[9.5px] font-semibold text-text-secondary">
              {e}
            </span>
          ))}
        </Cell>
      ))}
    </>
  );
}
