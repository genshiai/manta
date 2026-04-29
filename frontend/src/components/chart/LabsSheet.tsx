import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import type { LabLongTrendItem, LabResultEntry } from '../../types/workflow';

type LabsSheetProps = {
  open: boolean;
  onClose: () => void;
  results: LabResultEntry[];
  trends: LabLongTrendItem[];
};

const Sparkline = ({ trend }: { trend: LabLongTrendItem }) => {
  const points = trend.points.filter((p) => typeof p.numericValue === 'number');
  if (points.length < 2) return null;
  const values = points.map((p) => p.numericValue as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
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
  const trendByItem = new Map<string, LabLongTrendItem>();
  for (const t of trends) trendByItem.set(t.item, t);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto bg-card sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-[20px] font-bold">検査結果</SheetTitle>
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
                  return (
                    <tr key={r.item} className="border-b border-border/60">
                      <td className="py-2.5 text-text-primary">{r.item}</td>
                      <td
                        className={`py-2.5 text-right tabular-nums ${
                          r.flag === 'high' ? 'font-bold text-warning' : 'text-text-primary'
                        }`}
                      >
                        {r.result}
                      </td>
                      <td className="py-2.5 text-right text-text-tertiary tabular-nums">
                        {r.baseline}
                      </td>
                      <td className="py-2.5 text-right text-text-tertiary tabular-nums">
                        {r.previous}
                      </td>
                      <td className="py-2.5 text-right">{trend ? <Sparkline trend={trend} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {trends.length > 0 ? (
            <section className="mt-8">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
                長期トレンド
              </h3>
              <ul className="space-y-3">
                {trends.map((t) => (
                  <li
                    key={t.item}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-text-primary">{t.item}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {t.latestValue ?? '—'}
                        {t.deltaLabel ? ` (${t.deltaLabel})` : ''}
                        {t.abnormalCount > 0 ? ` ・ 異常${t.abnormalCount}回` : ''}
                      </p>
                    </div>
                    <Sparkline trend={t} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
