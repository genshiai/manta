import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { Button } from '../ui/button';
import { useEffect, useMemo, useState } from 'react';
import type { LabLongTrendItem, LabResultEntry } from '../../types/workflow';

type LabsSheetProps = {
  open: boolean;
  onClose: () => void;
  results: LabResultEntry[];
  trends: LabLongTrendItem[];
};

const parseBaselineRange = (baseline?: string) => {
  if (!baseline) return null;
  const numbers = baseline.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length >= 2) return { min: numbers[0], max: numbers[1] };
  if (baseline.endsWith('-') && numbers.length === 1) return { min: numbers[0], max: null };
  return null;
};

const labValueTone = (
  value: string,
  baseline?: string,
  flag?: 'high' | 'normal',
): 'high' | 'low' | 'normal' => {
  const numericValue = Number(value.match(/-?\d+(?:\.\d+)?/)?.[0]);
  const range = parseBaselineRange(baseline);
  if (Number.isFinite(numericValue) && range) {
    if (range.min !== null && numericValue < range.min) return 'low';
    if (range.max !== null && numericValue > range.max) return 'high';
  }
  return flag === 'high' ? 'high' : 'normal';
};

const labToneClassName = (tone: 'high' | 'low' | 'normal') => {
  if (tone === 'high') return 'font-bold text-warning';
  if (tone === 'low') return 'font-bold text-blue-700';
  return 'text-text-primary';
};

const Sparkline = ({ trend }: { trend: LabLongTrendItem }) => {
  const points = trend.points.filter((p) => typeof p.numericValue === 'number');
  if (points.length < 2) return null;
  const values = points.map((p) => p.numericValue as number);
  const baseline = parseBaselineRange(trend.baseline);
  const min = Math.min(...values, baseline?.min ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...values, baseline?.max ?? Number.NEGATIVE_INFINITY);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const path = points
    .map((p, idx) => {
      const x = (idx / (points.length - 1)) * w;
      const y = h - (((p.numericValue as number) - min) / range) * h;
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lastIsAbnormal = points[points.length - 1]?.flag === 'high';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-24" preserveAspectRatio="none">
      <title>{`${trend.item} の推移`}</title>
      <path
        d={path}
        fill="none"
        stroke={lastIsAbnormal ? 'var(--warning)' : 'var(--brand)'}
        strokeWidth="1.5"
      />
      {baseline && baseline.max !== null ? (
        <rect
          x="0"
          y={h - ((baseline.max - min) / range) * h}
          width={w}
          height={Math.max((((baseline.max - baseline.min) / range) * h), 1)}
          fill="var(--success)"
          opacity="0.12"
        />
      ) : null}
      {points.map((p, idx) => {
        const x = (idx / (points.length - 1)) * w;
        const y = h - (((p.numericValue as number) - min) / range) * h;
        const isLast = idx === points.length - 1;
        return (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: stable order from API
            key={idx}
            cx={x}
            cy={y}
            r={isLast ? 1.8 : 1}
            fill={p.flag === 'high' ? 'var(--warning)' : 'var(--brand)'}
          />
        );
      })}
    </svg>
  );
};

/**
 * 検査結果の詳細・トレンドを右からスライドで表示する Sheet。
 * - 当日結果テーブル (項目・値・基準・前回・異常マーク)
 * - 長期トレンドのスパークライン (numericValue があるものだけ)
 */
export const LabsSheet = ({ open, onClose, results, trends }: LabsSheetProps) => {
  const trendByItem = useMemo(() => {
    const map = new Map<string, LabLongTrendItem>();
    for (const trend of trends) map.set(trend.item, trend);
    return map;
  }, [trends]);
  const [selectedTrendItem, setSelectedTrendItem] = useState<string | null>(() => results[0]?.item ?? trends[0]?.item ?? null);
  const selectedTrend = selectedTrendItem ? trendByItem.get(selectedTrendItem) : null;

  useEffect(() => {
    setSelectedTrendItem(results[0]?.item ?? trends[0]?.item ?? null);
  }, [results, trends]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center justify-between gap-3">
            <SheetTitle className="text-[20px] font-bold">検査結果</SheetTitle>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-border px-2.5 py-1.5 text-[12px] text-text-secondary hover:bg-surface-subtle"
            >
              印刷
            </button>
          </div>
        </SheetHeader>

        <div className="px-4 pb-8">
          {results.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-tertiary">
              検査結果はまだありません
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-text-tertiary">
                  <th className="py-2 text-left font-bold">項目</th>
                  <th className="py-2 text-right font-bold">値</th>
                  <th className="py-2 text-right font-bold">基準</th>
                  <th className="py-2 text-right font-bold">前回</th>
                  <th className="py-2 text-right font-bold">推移</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const trend = trendByItem.get(r.item);
                  const tone = labValueTone(r.result, r.baseline, r.flag);
                  return (
                    <tr
                      key={r.item}
                      className={`border-b border-border/60 ${selectedTrendItem === r.item ? 'bg-blue-50' : ''}`}
                    >
                      <td className="py-2.5 text-text-primary">{r.item}</td>
                      <td
                        className={`py-2.5 text-right tabular-nums ${labToneClassName(tone)}`}
                      >
                        {r.result}
                      </td>
                      <td className="py-2.5 text-right text-text-tertiary tabular-nums">
                        {r.baseline}
                      </td>
                      <td className="py-2.5 text-right text-text-tertiary tabular-nums">
                        {r.previous}
                      </td>
                      <td className="py-2.5 text-right">
                        {trend ? (
                          <Button
                            onClick={() => setSelectedTrendItem(r.item)}
                            size="xs"
                            type="button"
                            variant={selectedTrendItem === r.item ? 'default' : 'outline'}
                          >
                            推移を見る
                          </Button>
                        ) : (
                          <span className="text-[12px] text-text-tertiary">なし</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {selectedTrend ? (
            <section className="mt-6 rounded-md border border-border bg-surface-subtle p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[14px] font-bold text-text-primary">{selectedTrend.item} の時系列</h3>
                  <p className="mt-1 text-[12px] text-text-tertiary">
                    最新 {selectedTrend.latestValue ?? '-'}
                    {selectedTrend.deltaLabel ? ` ・ ${selectedTrend.deltaLabel}` : ''}
                    {selectedTrend.abnormalCount > 0 ? ` ・ 異常${selectedTrend.abnormalCount}回` : ''}
                  </p>
                </div>
                <Sparkline trend={selectedTrend} />
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-card">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-subtle text-text-tertiary">
                      <th className="px-2 py-1.5 text-left font-bold">日付</th>
                      <th className="px-2 py-1.5 text-right font-bold">値</th>
                      <th className="px-2 py-1.5 text-right font-bold">判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTrend.points.map((point) => {
                      const tone = labValueTone(point.value, selectedTrend.baseline, point.flag);

                      return (
                        <tr className="border-b border-border/60 last:border-b-0" key={point.observationId}>
                          <td className="px-2 py-1.5 text-text-secondary">{point.date}</td>
                          <td className={`px-2 py-1.5 text-right ${labToneClassName(tone)}`}>
                            {point.value}{point.unit ? ` ${point.unit}` : ''}
                          </td>
                          <td className="px-2 py-1.5 text-right text-text-tertiary">
                            {tone === 'high' ? '高値' : tone === 'low' ? '低値' : '基準内'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : trends.length > 0 ? (
            <p className="mt-6 rounded-md border border-dashed border-border bg-surface-subtle px-3 py-4 text-center text-[13px] text-text-tertiary">
              検査行の「推移を見る」から時系列を表示できます。
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
