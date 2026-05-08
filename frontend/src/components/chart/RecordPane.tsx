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
  ProcedureOrderEntry,
  PrescriptionTimelineEntry,
  PrescriptionTimelineGroup,
  ReservationSlot,
  VitalEntry,
} from '../../types/workflow';

type ChartView =
  | 'chart'
  | 'history'
  | 'calendar'
  | 'labs'
  | 'imaging'
  | 'documents'
  | 'reservations'
  | 'search';

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
  procedureOrders: ProcedureOrderEntry[];
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
  chart: '診療録',
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

const calendarDateKey = (date: string): string => normalizeDate(date.split(' ')[0] ?? date).replace(/（.+$/, '');

const currentMonthDays = (monthDate = new Date()) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
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

type TimelineKind = 'chart' | 'lab' | 'rx' | 'image' | 'procedure';

const timelineKindLabel: Record<TimelineKind, string> = {
  chart: '診療録',
  lab: '検査',
  rx: '処方',
  image: '画像',
  procedure: '処置',
};

const timelineKindClass: Record<TimelineKind, string> = {
  chart: 'bg-brand',
  lab: 'bg-success',
  rx: 'bg-warning',
  image: 'bg-chart-3',
  procedure: 'bg-text-tertiary',
};

const demoLabTimeline = [
  { date: '2026/04/30', item: 'HbA1c', result: '7.0%', baseline: '4.6-6.2', previous: '7.2%', flag: 'high' as const },
  { date: '2026/04/30', item: 'eGFR', result: '68', baseline: '60-', previous: '71', flag: 'normal' as const },
  { date: '2026/04/30', item: 'LDL-C', result: '118', baseline: '70-139', previous: '126', flag: 'normal' as const },
  { date: '2026/04/24', item: 'AST', result: '42 H', baseline: '13-30', previous: '35', flag: 'high' as const },
  { date: '2026/03/27', item: 'HbA1c', result: '7.2%', baseline: '4.6-6.2', previous: '7.4%', flag: 'high' as const },
  { date: '2026/02/28', item: 'HbA1c', result: '7.4%', baseline: '4.6-6.2', previous: '7.5%', flag: 'high' as const },
  { date: '2026/02/28', item: 'Cr', result: '0.91', baseline: '0.65-1.07', previous: '0.88', flag: 'normal' as const },
];

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
  procedureOrders,
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
  const [timelineKinds, setTimelineKinds] = useState<Set<TimelineKind>>(
    () => new Set(['chart', 'lab', 'rx', 'image', 'procedure']),
  );

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
    const map = new Map<string, Set<'chart' | 'lab' | 'rx' | 'image' | 'reservation'>>();
    const add = (date: string | undefined, kind: 'chart' | 'lab' | 'rx' | 'image' | 'reservation') => {
      if (!date) return;
      const key = calendarDateKey(date);
      const existing = map.get(key) ?? new Set<'chart' | 'lab' | 'rx' | 'image' | 'reservation'>();
      existing.add(kind);
      map.set(key, existing);
    };
    for (const v of versions) add(versionDate(v.savedAt), 'chart');
    for (const order of labOrders) add(order.createdAt ?? formatDateKey(new Date()), 'lab');
    for (const group of prescriptionTimeline) add(group.date, 'rx');
    for (const order of imagingOrders) add(order.scheduledAt || formatDateKey(new Date()), 'image');
    for (const slot of reservationSlots) add(slot.date, 'reservation');
    return map;
  }, [versions, labOrders, prescriptionTimeline, imagingOrders, reservationSlots]);

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

  const timelineItems = useMemo(() => {
    const items: Array<{
      id: string;
      date: string;
      kind: TimelineKind;
      title: string;
      body: string;
    }> = [];
    for (const version of versions) {
      items.push({
        id: `chart-${version.version}-${version.savedAt}`,
        date: versionDate(version.savedAt),
        kind: 'chart',
        title: `診療録 v${version.version}`,
        body: [version.subjective, version.assessment, version.plan].filter(Boolean).join(' / '),
      });
    }
    for (const order of labOrders) {
      items.push({
        id: `lab-${order.category}-${order.createdAt ?? 'today'}`,
        date: normalizeDate((order.createdAt ?? formatDateKey(new Date())).split(' ')[0] ?? ''),
        kind: 'lab',
        title: order.category,
        body: order.items.join('・') || '検査項目未設定',
      });
    }
    for (const group of prescriptionTimeline) {
      items.push({
        id: `rx-${group.date}`,
        date: normalizeDate(group.date),
        kind: 'rx',
        title: `処方 ${group.itemCount}件`,
        body: group.items.map((item) => item.drugName).join('、'),
      });
    }
    for (const order of imagingOrders) {
      items.push({
        id: `image-${order.category}-${order.scheduledAt}`,
        date: normalizeDate((order.scheduledAt || formatDateKey(new Date())).split(' ')[0] ?? ''),
        kind: 'image',
        title: order.category,
        body: order.note || '画像オーダ',
      });
    }
    for (const order of procedureOrders) {
      items.push({
        id: `procedure-${order.title}`,
        date: formatDateKey(new Date()),
        kind: 'procedure',
        title: order.title,
        body: order.note || (order.status === 'done' ? '完了' : '予定'),
      });
    }
    return items
      .filter((item) => timelineKinds.has(item.kind))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [versions, labOrders, prescriptionTimeline, imagingOrders, procedureOrders, timelineKinds]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-page">
      {/* sticky ヘッダー */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border bg-card px-8 py-3">
        <h2 className="text-[15px] font-bold leading-snug text-text-primary">
          {viewTitle[view]}
        </h2>
        <div className="flex items-center gap-2">
          {(view === 'chart' || view === 'search') && departments.length > 0 ? (
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

          {view === 'chart' ? (
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

          {view === 'history' ? (
            <section className="py-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {(Object.keys(timelineKindLabel) as TimelineKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setTimelineKinds((current) => {
                        const next = new Set(current);
                        if (next.has(kind)) {
                          next.delete(kind);
                        } else {
                          next.add(kind);
                        }
                        return next.size === 0 ? current : next;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${
                      timelineKinds.has(kind)
                        ? 'border-brand bg-brand-tint text-brand'
                        : 'border-border bg-card text-text-secondary'
                    }`}
                  >
                    <span className={`size-2 rounded-full ${timelineKindClass[kind]}`} />
                    {timelineKindLabel[kind]}
                  </button>
                ))}
              </div>

              {timelineItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-[13px] text-text-tertiary">
                  表示できる時系列イベントはありません
                </p>
              ) : (
                <ol className="relative border-l border-border pl-5">
                  {timelineItems.map((item) => (
                    <li key={item.id} className="relative mb-4 rounded-lg border border-border bg-card p-4 last:mb-0">
                      <span
                        className={`absolute -left-[27px] top-5 size-3 rounded-full border-2 border-card ${timelineKindClass[item.kind]}`}
                      />
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <p className="text-[14px] font-bold text-text-primary">{item.title}</p>
                        <span className="text-[12px] text-text-tertiary">{item.date}</span>
                      </div>
                      <p className="text-[12px] font-medium text-text-tertiary">
                        {timelineKindLabel[item.kind]}
                      </p>
                      {item.body ? (
                        <p className="mt-2 line-clamp-2 text-[13px] leading-normal text-text-secondary">
                          {item.body}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          {view === 'calendar' ? (
            <CalendarView eventsByDate={calendarEventsByDate} reservationSlots={reservationSlots} />
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

const eventDotClass: Record<'chart' | 'lab' | 'rx' | 'image' | 'reservation', string> = {
  chart: 'bg-brand',
  lab: 'bg-success',
  rx: 'bg-warning',
  image: 'bg-chart-3',
  reservation: 'bg-cyan-600',
};

const CalendarView = ({
  eventsByDate,
  reservationSlots,
}: {
  eventsByDate: Map<string, Set<'chart' | 'lab' | 'rx' | 'image' | 'reservation'>>;
  reservationSlots: ReservationSlot[];
}) => {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const days = currentMonthDays(visibleMonth);
  const todayKey = formatDateKey(new Date());
  const monthLabel = `${visibleMonth.getFullYear()}年 ${visibleMonth.getMonth() + 1}月`;
  const reservationSlotsByDate = useMemo(() => {
    const map = new Map<string, ReservationSlot[]>();
    for (const slot of reservationSlots) {
      const key = calendarDateKey(slot.date);
      map.set(key, [...(map.get(key) ?? []), slot]);
    }
    return map;
  }, [reservationSlots]);
  const moveMonth = (delta: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  return (
    <section className="py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="xs" onClick={() => moveMonth(-1)}>
            前月
          </Button>
          <h3 className="min-w-32 text-center text-[20px] font-bold text-text-primary">
            {monthLabel}
          </h3>
          <Button variant="ghost" size="xs" onClick={() => moveMonth(1)}>
            次月
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-text-secondary">
          <CalendarLegend className="bg-brand" label="診療録" />
          <CalendarLegend className="bg-success" label="検査" />
          <CalendarLegend className="bg-warning" label="処方" />
          <CalendarLegend className="bg-chart-3" label="画像" />
          <CalendarLegend className="bg-cyan-600" label="予約枠" />
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
          const slots = reservationSlotsByDate.get(key) ?? [];
          const isToday = key === todayKey;
          const muted = day.getMonth() !== visibleMonth.getMonth();
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
              {slots.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {slots.slice(0, 3).map((slot) => (
                    <li
                      key={slot.id}
                      className="truncate rounded-sm bg-surface-subtle px-1.5 py-1 text-[10px] text-text-secondary"
                    >
                      {slot.time} {slot.department}
                    </li>
                  ))}
                  {slots.length > 3 ? (
                    <li className="text-[10px] text-text-tertiary">他 {slots.length - 3} 件</li>
                  ) : null}
                </ul>
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
}) => {
  const timeline = results.length > 0
    ? [
        ...results.map((result) => ({
          date: result.reportedAt ? normalizeDate(result.reportedAt.split(' ')[0] ?? '') : '2026/04/30',
          item: result.item,
          result: result.result,
          baseline: result.baseline,
          previous: result.previous,
          flag: result.flag,
        })),
        ...demoLabTimeline,
      ]
    : demoLabTimeline;
  const items = Array.from(new Set(timeline.map((row) => row.item))).sort();
  const [selectedItem, setSelectedItem] = useState<string>('all');
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const filtered = timeline.filter((row) => {
    if (selectedItem !== 'all' && row.item !== selectedItem) return false;
    if (abnormalOnly && row.flag !== 'high') return false;
    return true;
  });

  return (
    <section className="py-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={selectedItem}
          onChange={(event) => setSelectedItem(event.target.value)}
          className="h-9 rounded-full border border-border bg-card px-3 text-[13px] text-text-primary focus:outline-none focus:ring-[3px] focus:ring-brand-focus-ring"
        >
          <option value="all">全項目</option>
          {items.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAbnormalOnly((current) => !current)}
          className={`h-9 rounded-full border px-3 text-[13px] font-medium ${
            abnormalOnly
              ? 'border-destructive bg-destructive-bg text-destructive'
              : 'border-border bg-card text-text-secondary'
          }`}
        >
          異常のみ
        </button>
        <span className="ml-auto text-[12px] text-text-tertiary">
          ダミー時系列を含む {filtered.length} 件
        </span>
      </div>

      <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-[11px] uppercase tracking-wide text-text-tertiary">
            <th className="px-3 py-2 text-left font-bold">日付</th>
            <th className="px-3 py-2 text-left font-bold">項目</th>
            <th className="px-3 py-2 text-right font-bold">値</th>
            <th className="px-3 py-2 text-right font-bold">基準</th>
            <th className="px-3 py-2 text-right font-bold">前回</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((result, index) => (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: static demo timeline fallback
              key={`${result.date}-${result.item}-${index}`}
              className="border-b border-border/60 last:border-b-0"
            >
              <td className="px-3 py-2.5 text-text-tertiary tabular-nums">{result.date}</td>
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

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {(trends.length > 0 ? trends : [
          { item: 'HbA1c', latestValue: '7.0%', deltaLabel: '-0.2%', abnormalCount: 4 },
          { item: 'eGFR', latestValue: '68', deltaLabel: '-3', abnormalCount: 0 },
          { item: 'LDL-C', latestValue: '118', deltaLabel: '-8', abnormalCount: 0 },
          { item: 'AST', latestValue: '42 H', deltaLabel: '+7', abnormalCount: 1 },
        ]).map((trend) => (
          <div key={trend.item} className="rounded-lg border border-border bg-card p-4">
            <p className="truncate text-[13px] font-bold text-text-primary">{trend.item}</p>
            <p className="mt-1 text-[12px] text-text-tertiary">
              最新 {trend.latestValue ?? '-'} ・ {trend.deltaLabel}
              {trend.abnormalCount > 0 ? ` ・ 異常${trend.abnormalCount}回` : ''}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

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
