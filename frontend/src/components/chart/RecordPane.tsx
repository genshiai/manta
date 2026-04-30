import { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { PastChartItem } from './PastChartItem';
import { TodayChartBlock } from './TodayChartBlock';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import type { SoapDraft } from './SoapEditor';
import type {
  ChartHistoryEntry,
  ChartTemplate,
  ChartVersion,
  ImagingOrderEntry,
  LabLongTrendItem,
  LabResultEntry,
  PrescriptionTimelineEntry,
  PrescriptionTimelineGroup,
  ReservationSlot,
  VitalEntry,
} from '../../types/workflow';

type ChartView = 'history' | 'calendar' | 'labs' | 'imaging' | 'documents' | 'reservations' | 'search';

type LabOrderRow = {
  category: string;
  status: 'done' | 'pending';
  urgency?: '通常' | '至急';
  items: string[];
  createdAt?: string;
};

type RecordPaneProps = {
  patientId: string;
  view: ChartView;
  draft: SoapDraft;
  isDirty: boolean;
  vitals: VitalEntry[];
  templates: ChartTemplate[];
  selectedTemplateId: string;
  isMutating: boolean;
  versions: ChartVersion[];
  chartHistory: ChartHistoryEntry[];
  prescriptionTimeline: PrescriptionTimelineGroup[];
  labResults: LabResultEntry[];
  labLongTrends: LabLongTrendItem[];
  labOrders: LabOrderRow[];
  imagingOrders: ImagingOrderEntry[];
  reservationSlots: ReservationSlot[];
  workspaceError: string | null;
  isLoading: boolean;
  onDraftChange: (next: SoapDraft) => void;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: () => void;
  onCopyPrevious: () => void;
};

const DEPT_ALL = 'all';

const viewTitle: Record<ChartView, string> = {
  history: '履歴',
  calendar: 'カレンダー',
  labs: '検査',
  imaging: '画像',
  documents: '文書',
  reservations: '予約',
  search: '検索',
};

const versionDate = (savedAt: string): string => {
  if (!savedAt) return '';
  if (savedAt.includes('T')) return savedAt.split('T')[0];
  return savedAt.split(' ')[0] ?? savedAt;
};

const normalizeDate = (date: string): string => date.replaceAll('-', '/');

const currentMonthDays = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
};

const formatDateKey = (date: Date): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}/${month}/${day}`;
};

/**
 * 中央ペイン (WHAT・記録)
 *
 * 構造 (上から):
 * - sticky ヘッダー: タイトル + 科フィルタ
 * - スクロール本体:
 *   - 本日のカルテブロック (TodayChartBlock; 編集 / 表示モード切替)
 *   - 過去のカルテブロック (PastChartItem; SOAP + 処方 + 検査)
 *
 * 設計指針: frontend/CHART-DESIGN.md / memory: feedback_chart_block_view
 */
export const RecordPane = ({
  patientId,
  view,
  draft,
  isDirty,
  vitals,
  templates,
  selectedTemplateId,
  isMutating,
  versions,
  chartHistory,
  prescriptionTimeline,
  labResults,
  labLongTrends,
  labOrders,
  imagingOrders,
  reservationSlots,
  workspaceError,
  isLoading,
  onDraftChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
}: RecordPaneProps) => {
  const [departmentFilter, setDepartmentFilter] = useState<string>(DEPT_ALL);
  const [todayRecordOpen, setTodayRecordOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!patientId) return;
    setTodayRecordOpen(false);
    setSearchQuery('');
    setDepartmentFilter(DEPT_ALL);
  }, [patientId]);

  // 科一覧 (受診履歴から)
  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const h of chartHistory) if (h.department) set.add(h.department);
    return Array.from(set).sort();
  }, [chartHistory]);

  // 受診日 → 科 / 処方 / 検査 のマップ
  const visitByDate = useMemo(() => {
    const map = new Map<string, ChartHistoryEntry>();
    for (const h of chartHistory) map.set(normalizeDate(h.date), h);
    return map;
  }, [chartHistory]);

  const prescriptionsByDate = useMemo(() => {
    const map = new Map<string, PrescriptionTimelineEntry[]>();
    for (const g of prescriptionTimeline) {
      if (g.isToday) continue;
      const key = normalizeDate(g.date);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, ...g.items]);
    }
    return map;
  }, [prescriptionTimeline]);

  // 過去版を新しい順にソート + フィルタ
  const filteredVersions = useMemo(() => {
    const sorted = [...versions].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    if (departmentFilter === DEPT_ALL) return sorted;
    return sorted.filter((v) => {
      const visit = visitByDate.get(versionDate(v.savedAt));
      return visit?.department === departmentFilter;
    });
  }, [versions, visitByDate, departmentFilter]);

  const calendarEventsByDate = useMemo(() => {
    const map = new Map<string, Set<'chart' | 'lab' | 'rx' | 'image'>>();
    const add = (date: string | undefined, kind: 'chart' | 'lab' | 'rx' | 'image') => {
      if (!date) return;
      const key = normalizeDate(date.split(' ')[0] ?? date);
      const existing = map.get(key) ?? new Set<'chart' | 'lab' | 'rx' | 'image'>();
      existing.add(kind);
      map.set(key, existing);
    };
    for (const v of versions) add(versionDate(v.savedAt), 'chart');
    for (const order of labOrders) add(order.createdAt ?? formatDateKey(new Date()), 'lab');
    for (const group of prescriptionTimeline) add(group.date, 'rx');
    for (const order of imagingOrders) add(order.scheduledAt || formatDateKey(new Date()), 'image');
    return map;
  }, [versions, labOrders, prescriptionTimeline, imagingOrders]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return filteredVersions.filter((version) => {
      const haystack = [
        version.subjective,
        version.objective,
        version.assessment,
        version.plan,
        version.savedBy,
        version.savedAt,
      ]
        .join('\n')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [filteredVersions, searchQuery]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-page">
      {/* sticky ヘッダー */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-8 py-3">
        <h2 className="text-[15px] font-bold leading-snug text-text-primary">
          {viewTitle[view]}
        </h2>
        <div className="flex items-center gap-2">
          {(view === 'history' || view === 'search') && departments.length > 0 ? (
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-[12px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value={DEPT_ALL}>全科</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-[12px] text-text-tertiary">
            {filteredVersions.length > 0 ? `${filteredVersions.length}件の記録` : ''}
          </span>
        </div>
      </div>

      {/* スクロール本体 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-8 pb-12">
          {workspaceError ? (
            <p className="mt-6 rounded-md bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              {workspaceError}
            </p>
          ) : null}

          {view === 'history' ? (
            <>
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface-page/95 py-4 backdrop-blur">
                <Button variant="default" size="sm" onClick={() => setTodayRecordOpen(true)}>
                  <Plus size={14} />
                  本日の記載
                </Button>
                <Button variant="secondary" size="sm" onClick={onApplyTemplate}>
                  テンプレート挿入
                </Button>
                <Button variant="ghost" size="sm" onClick={onCopyPrevious}>
                  前回複写
                </Button>
              </div>

              {todayRecordOpen ? (
                <TodayChartBlock
                  draft={draft}
                  vitals={vitals}
                  templates={templates}
                  selectedTemplateId={selectedTemplateId}
                  isMutating={isMutating}
                  isDirty={isDirty}
                  onChange={onDraftChange}
                  onSelectTemplate={onSelectTemplate}
                  onApplyTemplate={onApplyTemplate}
                  onCopyPrevious={onCopyPrevious}
                />
              ) : null}

              {isLoading && filteredVersions.length === 0 ? (
                <div className="py-16 text-center text-[13px] text-text-tertiary">読み込み中…</div>
              ) : filteredVersions.length === 0 ? (
                <div className="py-16 text-center text-[13px] text-text-tertiary">
                  {departmentFilter === DEPT_ALL
                    ? '過去のカルテはまだありません'
                    : `「${departmentFilter}」の記録はありません`}
                </div>
              ) : (
                filteredVersions.map((v, idx) => {
                  const visit = visitByDate.get(versionDate(v.savedAt));
                  return (
                    <PastChartItem
                      // biome-ignore lint/suspicious/noArrayIndexKey: append-only versioned list, idx + savedAt is stable
                      key={`${v.savedAt}-${v.version}-${idx}`}
                      version={v}
                      visit={visit ? { department: visit.department, title: visit.title } : undefined}
                      prescriptions={prescriptionsByDate.get(versionDate(v.savedAt))}
                      labResults={idx === 0 ? labResults : undefined}
                    />
                  );
                })
              )}
            </>
          ) : null}

          {view === 'calendar' ? (
            <CalendarView eventsByDate={calendarEventsByDate} />
          ) : null}

          {view === 'labs' ? (
            <LabsView results={labResults} trends={labLongTrends} />
          ) : null}

          {view === 'imaging' ? (
            <OrderListView
              title="画像オーダ"
              empty="画像オーダはありません"
              items={imagingOrders.map((order) => ({
                key: `${order.category}-${order.scheduledAt}-${order.note}`,
                title: order.category,
                meta: `${order.scheduledAt || '日時未定'} ・ ${order.status === 'scheduled' ? '予定' : '下書き'}`,
                body: order.note,
              }))}
            />
          ) : null}

          {view === 'documents' ? (
            <OrderListView
              title="文書"
              empty="文書はまだありません"
              items={versions.map((version) => ({
                key: `${version.version}-${version.savedAt}`,
                title: `カルテ v${version.version}`,
                meta: `${version.savedAt} ・ ${version.savedBy}`,
                body: [version.assessment, version.plan].filter(Boolean).join(' / '),
              }))}
            />
          ) : null}

          {view === 'reservations' ? (
            <OrderListView
              title="予約枠"
              empty="予約枠はありません"
              items={reservationSlots.map((slot) => ({
                key: slot.id,
                title: `${slot.date} ${slot.time}`,
                meta: `${slot.department} ・ ${slot.doctor} ・ ${slot.state}`,
                body: '',
              }))}
            />
          ) : null}

          {view === 'search' ? (
            <div className="py-5">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="SOAP、日付、担当者で検索"
                  className="pl-10"
                />
              </div>
              <div className="mt-5">
                {searchQuery.trim() === '' ? (
                  <p className="py-12 text-center text-[13px] text-text-tertiary">
                    検索語を入力してください
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="py-12 text-center text-[13px] text-text-tertiary">
                    該当する記録はありません
                  </p>
                ) : (
                  searchResults.map((version) => (
                    <PastChartItem key={`${version.version}-${version.savedAt}`} version={version} />
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const eventDotClass: Record<'chart' | 'lab' | 'rx' | 'image', string> = {
  chart: 'bg-brand',
  lab: 'bg-success',
  rx: 'bg-warning',
  image: 'bg-chart-3',
};

const CalendarView = ({
  eventsByDate,
}: {
  eventsByDate: Map<string, Set<'chart' | 'lab' | 'rx' | 'image'>>;
}) => {
  const days = currentMonthDays();
  const todayKey = formatDateKey(new Date());
  const monthLabel = `${new Date().getFullYear()}年 ${new Date().getMonth() + 1}月`;

  return (
    <section className="py-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[20px] font-bold text-text-primary">{monthLabel}</h3>
        <div className="flex gap-2 text-[11px] text-text-secondary">
          <CalendarLegend className="bg-brand" label="カルテ" />
          <CalendarLegend className="bg-success" label="検査" />
          <CalendarLegend className="bg-warning" label="処方" />
          <CalendarLegend className="bg-chart-3" label="画像" />
        </div>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border bg-card">
        {['日', '月', '火', '水', '木', '金', '土'].map((dow) => (
          <div
            key={dow}
            className="border-b border-border bg-surface-subtle py-2 text-center text-[11px] font-bold text-text-tertiary"
          >
            {dow}
          </div>
        ))}
        {days.map((day) => {
          const key = formatDateKey(day);
          const events = eventsByDate.get(key);
          const isToday = key === todayKey;
          const muted = day.getMonth() !== new Date().getMonth();
          return (
            <div
              key={key}
              className={`min-h-24 border-b border-r border-border p-2 last:border-r-0 ${
                muted ? 'bg-surface-subtle/60 text-text-tertiary' : 'bg-card text-text-primary'
              }`}
            >
              <div
                className={`mb-2 inline-grid size-7 place-items-center rounded-full text-[12px] ${
                  isToday ? 'bg-brand text-white' : ''
                }`}
              >
                {day.getDate()}
              </div>
              {events ? (
                <div className="flex gap-1">
                  {Array.from(events).map((event) => (
                    <span key={event} className={`size-2 rounded-full ${eventDotClass[event]}`} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const CalendarLegend = ({ className, label }: { className: string; label: string }) => (
  <span className="inline-flex items-center gap-1">
    <span className={`size-2 rounded-full ${className}`} />
    {label}
  </span>
);

const LabsView = ({
  results,
  trends,
}: {
  results: LabResultEntry[];
  trends: LabLongTrendItem[];
}) => (
  <section className="py-5">
    {results.length === 0 ? (
      <p className="py-12 text-center text-[13px] text-text-tertiary">検査結果はありません</p>
    ) : (
      <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-[11px] uppercase tracking-wide text-text-tertiary">
            <th className="px-3 py-2 text-left font-bold">項目</th>
            <th className="px-3 py-2 text-right font-bold">値</th>
            <th className="px-3 py-2 text-right font-bold">基準</th>
            <th className="px-3 py-2 text-right font-bold">前回</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.item} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2.5 text-text-primary">{result.item}</td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  result.flag === 'high' ? 'font-bold text-destructive' : 'text-text-primary'
                }`}
              >
                {result.result}
              </td>
              <td className="px-3 py-2.5 text-right text-text-tertiary tabular-nums">
                {result.baseline}
              </td>
              <td className="px-3 py-2.5 text-right text-text-tertiary tabular-nums">
                {result.previous}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}

    {trends.length > 0 ? (
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {trends.map((trend) => (
          <div key={trend.item} className="rounded-lg border border-border bg-card p-4">
            <p className="truncate text-[13px] font-bold text-text-primary">{trend.item}</p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              最新 {trend.latestValue ?? '-'} ・ {trend.deltaLabel}
              {trend.abnormalCount > 0 ? ` ・ 異常${trend.abnormalCount}回` : ''}
            </p>
          </div>
        ))}
      </div>
    ) : null}
  </section>
);

const OrderListView = ({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; meta: string; body: string }>;
}) => (
  <section className="py-5">
    <h3 className="mb-3 text-[18px] font-bold text-text-primary">{title}</h3>
    {items.length === 0 ? (
      <p className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-[13px] text-text-tertiary">
        {empty}
      </p>
    ) : (
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-border bg-card p-4">
            <p className="text-[14px] font-bold text-text-primary">{item.title}</p>
            <p className="mt-1 text-[12px] text-text-tertiary">{item.meta}</p>
            {item.body ? <p className="mt-2 text-[13px] text-text-secondary">{item.body}</p> : null}
          </li>
        ))}
      </ul>
    )}
  </section>
);
