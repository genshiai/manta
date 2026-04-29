import type {
  ChartVersion,
  LabResultEntry,
  PrescriptionTimelineEntry,
} from '../../types/workflow';

type PastChartItemProps = {
  version: ChartVersion;
  /** その日の受診情報 (科・タイトル) - chartHistory から関連付け */
  visit?: { department: string; title?: string };
  prescriptions?: PrescriptionTimelineEntry[];
  labResults?: LabResultEntry[];
};

const formatDateHeader = (savedAt: string): string => {
  // savedAt 例: "2026/04/12 14:30:00" or ISO
  const datePart = savedAt.includes('T') ? savedAt.split('T')[0] : savedAt.split(' ')[0];
  if (!datePart) return savedAt;
  // YYYY/MM/DD or YYYY-MM-DD → 2026年4月12日
  const m = datePart.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return datePart;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  const dow = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${y}年${Number(mo)}月${Number(d)}日（${dow}）`;
};

const SoapSection = ({ label, title, content }: { label: string; title: string; content: string }) =>
  content.trim().length === 0 ? null : (
    <section className="mt-4 first:mt-0">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          {label}
        </span>
        <span className="text-[11px] text-text-tertiary">{title}</span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-[1.7] text-text-primary">{content}</p>
    </section>
  );

/**
 * 過去カルテ 1 件のブロック表示。
 * 主表示: 日付ヘッダー + S/O/A/P + 処方 + 検査 (すべて常時可視)
 * Notion ドキュメントの段組みのように、ブロック間は十分な余白で区切る。
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 4 / memory: feedback_chart_block_view
 */
export const PastChartItem = ({
  version,
  visit,
  prescriptions,
  labResults,
}: PastChartItemProps) => (
  <article className="border-b border-border py-10 last:border-b-0">
    {/* 日付ヘッダー */}
    <header className="mb-6 flex items-baseline gap-3">
      <h3 className="text-[20px] font-bold leading-snug text-text-primary">
        {formatDateHeader(version.savedAt)}
      </h3>
      {visit?.department ? (
        <span className="text-[13px] text-text-tertiary">{visit.department}</span>
      ) : null}
      <span className="ml-auto text-[12px] text-text-tertiary">
        v{version.version} ・ {version.savedBy}
      </span>
    </header>

    {/* SOAP 本文 */}
    <div>
      <SoapSection label="S" title="主訴・自覚症状" content={version.subjective} />
      <SoapSection label="O" title="所見・バイタル・検査" content={version.objective} />
      <SoapSection label="A" title="アセスメント" content={version.assessment} />
      <SoapSection label="P" title="プラン" content={version.plan} />
    </div>

    {/* 処方 (主表示) */}
    {prescriptions && prescriptions.length > 0 ? (
      <section className="mt-6">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          処方
        </h4>
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {prescriptions.map((item, idx) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: prescription items are append-only with stable order
              key={`${item.drugName}-${item.dosage}-${idx}`}
              className="flex items-baseline justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-[14px] text-text-primary">{item.drugName}</span>
              <span className="text-[13px] text-text-tertiary">
                {item.dosage} ・ {item.days}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null}

    {/* 検査 (主表示) */}
    {labResults && labResults.length > 0 ? (
      <section className="mt-6">
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
          検査結果
        </h4>
        <ul className="divide-y divide-border/60 rounded-lg border border-border">
          {labResults.map((lab) => (
            <li
              key={lab.item}
              className="flex items-baseline justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-[14px] text-text-primary">{lab.item}</span>
              <span
                className={`text-[14px] tabular-nums ${
                  lab.flag === 'high' ? 'font-bold text-warning' : 'text-text-secondary'
                }`}
              >
                {lab.result}
              </span>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
  </article>
);
