import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type {
  ChartHistoryEntry,
  LabResultEntry,
  PrescriptionTimelineGroup,
} from '../../types/workflow';

type PastChartItemProps = {
  entry: ChartHistoryEntry;
  prescriptions?: PrescriptionTimelineGroup[];
  labResults?: LabResultEntry[];
};

/**
 * 過去カルテ 1 件の表示。
 * 主情報 (常時表示): 受診日 + タイトル + 記述本文サマリ
 * 副情報 (折り畳み・デフォルト閉じ): 薬剤・検査・PMDA 等
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 4
 */
export const PastChartItem = ({ entry, prescriptions, labResults }: PastChartItemProps) => {
  const [expanded, setExpanded] = useState(false);

  const subInfoCounts: string[] = [];
  if (prescriptions && prescriptions.length > 0) {
    const total = prescriptions.reduce((sum, g) => sum + g.items.length, 0);
    subInfoCounts.push(`処方 ${total}剤`);
  }
  if (labResults && labResults.length > 0) {
    const abnormal = labResults.filter((r) => r.flag === 'high').length;
    subInfoCounts.push(`検査 ${labResults.length}件${abnormal > 0 ? ` (異常${abnormal})` : ''}`);
  }

  return (
    <article className="border-b border-border py-5">
      {/* 主情報 */}
      <header className="mb-2 flex items-baseline gap-3">
        <time className="text-[14px] font-bold text-text-primary">{entry.date}</time>
        <span className="text-[12px] text-text-tertiary">{entry.department}</span>
      </header>
      <h3 className="mb-2 text-[16px] font-bold leading-snug text-text-primary">{entry.title}</h3>
      <p className="text-[14px] leading-normal text-text-secondary">{entry.summary}</p>

      {/* 副情報トグル (折り畳み) */}
      {subInfoCounts.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 rounded text-[13px] font-medium text-text-tertiary hover:text-text-primary"
            aria-expanded={expanded}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {subInfoCounts.join(' / ')}
          </button>

          {expanded ? (
            <div className="mt-2 space-y-3 rounded-md bg-surface-subtle p-3">
              {prescriptions && prescriptions.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    処方
                  </h4>
                  <ul className="space-y-1">
                    {prescriptions.flatMap((group) =>
                      group.items.map((item, idx) => (
                        <li
                          // biome-ignore lint/suspicious/noArrayIndexKey: prescription items in a group are append-only with stable order
                          key={`${group.date}-${item.drugName}-${item.dosage}-${idx}`}
                          className="flex items-baseline justify-between gap-2 text-[13px]"
                        >
                          <span className="text-text-primary">{item.drugName}</span>
                          <span className="text-text-tertiary">
                            {item.dosage} ・ {item.days}
                          </span>
                        </li>
                      )),
                    )}
                  </ul>
                </section>
              ) : null}

              {labResults && labResults.length > 0 ? (
                <section>
                  <h4 className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-text-tertiary">
                    検査結果
                  </h4>
                  <ul className="space-y-1">
                    {labResults.map((lab) => (
                      <li
                        key={lab.item}
                        className="flex items-baseline justify-between gap-2 text-[13px]"
                      >
                        <span className="text-text-primary">{lab.item}</span>
                        <span
                          className={
                            lab.flag === 'high' ? 'font-bold text-warning' : 'text-text-tertiary'
                          }
                        >
                          {lab.result}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
};
