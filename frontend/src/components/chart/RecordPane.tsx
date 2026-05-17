import type { PointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  FileText,
  FlaskConical,
  Pill,
  Plus,
  ScanLine,
  Search,
} from 'lucide-react';
import { PastChartItem } from './PastChartItem';
import { TodayChartBlock } from './TodayChartBlock';
import type { OrderTab } from './OrderPane';
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
  ScheduledVisit,
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

const parseLabBaselineRange = (baseline?: string) => {
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
  const range = parseLabBaselineRange(baseline);
  if (Number.isFinite(numericValue) && range) {
    if (range.min !== null && numericValue < range.min) return 'low';
    if (range.max !== null && numericValue > range.max) return 'high';
  }
  return flag === 'high' ? 'high' : 'normal';
};

const labToneClassName = (tone: 'high' | 'low' | 'normal') => {
  if (tone === 'high') return 'font-bold text-destructive';
  if (tone === 'low') return 'font-bold text-blue-700';
  return 'text-text-primary';
};

type RecordPaneProps = {
  patientId: string;
  view: ChartView;
  draft: SoapDraft;
  authorName: string;
  department: string;
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
  scheduledVisit: ScheduledVisit | null;
  reservationSlots: ReservationSlot[];
  workspaceError: string | null;
  isLoading: boolean;
  onDraftChange: (next: SoapDraft) => void;
  onSelectTemplate: (id: string) => void;
  onApplyTemplate: () => void;
  onCopyPrevious: () => void;
  onAddOrder?: (tab: OrderTab) => void;
  onOpenReservation?: () => void;
  onCancelReservation?: () => void;
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

type TimelineItem = {
  id: string;
  date: string;
  kind: TimelineKind;
  title: string;
  body: string;
};

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

const timelineKindIcon: Record<TimelineKind, typeof FileText> = {
  chart: FileText,
  lab: FlaskConical,
  rx: Pill,
  image: ScanLine,
  procedure: ClipboardCheck,
};

const timelineKindChipClass: Record<TimelineKind, string> = {
  chart: 'border-blue-100 bg-blue-50 text-brand',
  lab: 'border-green-100 bg-green-50 text-success',
  rx: 'border-yellow-100 bg-yellow-50 text-warning',
  image: 'border-purple-100 bg-purple-50 text-chart-3',
  procedure: 'border-solid-gray-200 bg-solid-gray-50 text-text-secondary',
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
  authorName,
  department,
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
  scheduledVisit,
  reservationSlots,
  workspaceError,
  isLoading,
  onDraftChange,
  onSelectTemplate,
  onApplyTemplate,
  onCopyPrevious,
  onAddOrder,
  onOpenReservation,
  onCancelReservation,
}: RecordPaneProps) => {
  const [departmentFilter, setDepartmentFilter] = useState<string>(DEPT_ALL);
  const [todayRecordOpen, setTodayRecordOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineKinds, setTimelineKinds] = useState<Set<TimelineKind>>(
    () => new Set(['chart', 'lab', 'rx', 'image', 'procedure']),
  );
  const [timelineYear, setTimelineYear] = useState('all');
  const [timelineMonth, setTimelineMonth] = useState('all');
  const todayRecordRef = useRef<HTMLDivElement | null>(null);
  const [pendingTodayScroll, setPendingTodayScroll] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    setTodayRecordOpen(false);
    setSearchQuery('');
    setDepartmentFilter(DEPT_ALL);
    setTimelineYear('all');
    setTimelineMonth('all');
    setPendingTodayScroll(false);
  }, [patientId]);

  useEffect(() => {
    if (!pendingTodayScroll || view !== 'chart' || !todayRecordOpen) return;
    const frame = window.requestAnimationFrame(() => {
      todayRecordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingTodayScroll(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingTodayScroll, todayRecordOpen, view]);

  const openTodayRecord = () => {
    setTodayRecordOpen(true);
    setPendingTodayScroll(true);
  };

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
    const map = new Map<string, CalendarEventDetail[]>();
    const add = (date: string | undefined, detail: CalendarEventDetail) => {
      if (!date) return;
      if (date === '日未定') return;
      const key = calendarDateKey(date);
      map.set(key, [...(map.get(key) ?? []), detail]);
    };
    for (const v of versions) {
      add(versionDate(v.savedAt), {
        id: `chart-${v.version}-${v.savedAt}`,
        kind: 'chart',
        title: `診療録 v${v.version}`,
        meta: v.savedAt,
        body: [v.assessment, v.plan].filter(Boolean).join(' / '),
      });
    }
    for (const order of labOrders) {
      add(order.createdAt ?? formatDateKey(new Date()), {
        id: `lab-${order.category}-${order.createdAt ?? 'today'}`,
        kind: 'lab',
        title: order.category,
        meta: `${order.urgency ?? '通常'} ・ ${order.status === 'done' ? '完了' : '依頼中'}`,
        body: order.items.join('・') || '検査項目未設定',
      });
    }
    for (const group of prescriptionTimeline) {
      add(group.date, {
        id: `rx-${group.date}`,
        kind: 'rx',
        title: `処方 ${group.itemCount}件`,
        meta: group.date,
        body: group.items.map((item) => item.drugName).join('、'),
      });
    }
    for (const order of imagingOrders) {
      add(order.scheduledAt || formatDateKey(new Date()), {
        id: `image-${order.category}-${order.scheduledAt || 'today'}`,
        kind: 'image',
        title: order.category,
        meta: order.scheduledAt || '日時未定',
        body: order.note || '画像オーダ',
      });
    }
    for (const slot of reservationSlots) {
      add(slot.date, {
        id: `slot-${slot.id}`,
        kind: 'reservation',
        title: `${slot.time} ${slot.department}`,
        meta: `${slot.doctor} ・ ${slot.state} ・ ${slot.bookedCount}/${slot.capacity}件`,
      });
    }
    if (scheduledVisit) {
      add(scheduledVisit.date, {
        id: `booking-${scheduledVisit.slotId ?? scheduledVisit.date}`,
        kind: 'booking',
        title: `次回予約: ${scheduledVisit.date}`,
        meta: scheduledVisit.department,
        body: scheduledVisit.note,
      });
    }
    return map;
  }, [versions, labOrders, prescriptionTimeline, imagingOrders, reservationSlots, scheduledVisit]);

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

  const allTimelineItems = useMemo(() => {
    const items: TimelineItem[] = [];
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
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [versions, labOrders, prescriptionTimeline, imagingOrders, procedureOrders]);

  const timelineYearOptions = useMemo(() => {
    return Array.from(new Set(allTimelineItems.map((item) => item.date.slice(0, 4)))).sort((a, b) => (a < b ? 1 : -1));
  }, [allTimelineItems]);

  const timelineMonthOptions = useMemo(() => {
    const scoped = timelineYear === 'all'
      ? allTimelineItems
      : allTimelineItems.filter((item) => item.date.slice(0, 4) === timelineYear);
    return Array.from(new Set(scoped.map((item) => item.date.slice(5, 7)))).sort((a, b) => (a < b ? 1 : -1));
  }, [allTimelineItems, timelineYear]);

  const timelineItems = useMemo(() => allTimelineItems.filter((item) => (
    timelineKinds.has(item.kind) &&
    (timelineYear === 'all' || item.date.slice(0, 4) === timelineYear) &&
    (timelineMonth === 'all' || item.date.slice(5, 7) === timelineMonth)
  )), [allTimelineItems, timelineKinds, timelineYear, timelineMonth]);

  const timelineGroups = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();
    for (const item of timelineItems) {
      groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
    }
    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }));
  }, [timelineItems]);

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
                <Button variant="default" size="sm" onClick={openTodayRecord}>
                  <Plus size={14} />
                  本日の記載へ
                </Button>
              </div>

              {todayRecordOpen ? (
                <div ref={todayRecordRef}>
                  <TodayChartBlock
                    draft={draft}
                    patientId={patientId}
                    authorName={authorName}
                    department={department}
                    vitals={vitals}
                    labResults={labResults}
                    recentVersions={versions}
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    isMutating={isMutating}
                    isDirty={isDirty}
                    onChange={onDraftChange}
                    onSelectTemplate={onSelectTemplate}
                    onApplyTemplate={onApplyTemplate}
                    onCopyPrevious={onCopyPrevious}
                  />
                </div>
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
              <div className="sticky top-0 z-10 mb-4 space-y-3 border-b border-border bg-surface-page/95 py-3 backdrop-blur">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(timelineKindLabel) as TimelineKind[]).map((kind) => {
                    const Icon = timelineKindIcon[kind];
                    const isActive = timelineKinds.has(kind);

                    return (
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
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-bold transition-colors ${
                          isActive
                            ? timelineKindChipClass[kind]
                            : 'border-border bg-card text-text-secondary opacity-60'
                        }`}
                      >
                        <span className={`inline-grid size-5 place-items-center rounded-full border ${isActive ? timelineKindChipClass[kind] : 'border-border bg-surface-subtle text-text-tertiary'}`}>
                          <Icon size={12} strokeWidth={2.2} />
                        </span>
                        {timelineKindLabel[kind]}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="履歴の年を絞り込む"
                      className="h-8 rounded-md border border-border bg-card px-2 text-[12px] font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                      onChange={(event) => {
                        setTimelineYear(event.target.value);
                        setTimelineMonth('all');
                      }}
                      value={timelineYear}
                    >
                      <option value="all">全期間</option>
                      {timelineYearOptions.map((year) => (
                        <option key={year} value={year}>{year}年</option>
                      ))}
                    </select>
                    <select
                      aria-label="履歴の月を絞り込む"
                      className="h-8 rounded-md border border-border bg-card px-2 text-[12px] font-bold text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                      onChange={(event) => setTimelineMonth(event.target.value)}
                      value={timelineMonth}
                    >
                      <option value="all">全月</option>
                      {timelineMonthOptions.map((month) => (
                        <option key={month} value={month}>{Number(month)}月</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-[12px] text-text-tertiary">{timelineItems.length}件</span>
                </div>
              </div>

              {timelineItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-[13px] text-text-tertiary">
                  表示できる時系列イベントはありません
                </p>
              ) : (
                <div className="space-y-5">
                  {timelineGroups.map((group) => (
                    <section className="relative pl-9" key={group.date}>
                      <div className="absolute bottom-0 left-3 top-8 w-px bg-border" />
                      <div className="sticky top-[5.5rem] z-[1] mb-2 inline-flex rounded-full border border-border bg-card px-3 py-1 text-[12px] font-bold text-text-primary shadow-sm">
                        {group.date}
                      </div>
                      <ol className="space-y-3">
                        {group.items.map((item) => {
                          const Icon = timelineKindIcon[item.kind];

                          return (
                            <li key={item.id} className="relative rounded-lg border border-border bg-card p-4">
                              <span
                                className={`absolute -left-[31px] top-5 inline-grid size-6 place-items-center rounded-full border-2 border-card ${timelineKindChipClass[item.kind]}`}
                              >
                                <Icon size={13} strokeWidth={2.2} />
                              </span>
                              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-[14px] font-bold text-text-primary">{item.title}</p>
                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${timelineKindChipClass[item.kind]}`}>
                                  {timelineKindLabel[item.kind]}
                                </span>
                              </div>
                              {item.body ? (
                                <p className="mt-2 line-clamp-2 text-[13px] leading-normal text-text-secondary">
                                  {item.body}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {view === 'calendar' ? (
            <CalendarView eventsByDate={calendarEventsByDate} />
          ) : null}

          {view === 'labs' ? (
            <LabsView onAddLab={() => onAddOrder?.('lab')} results={labResults} trends={labLongTrends} />
          ) : null}

          {view === 'imaging' ? (
            <OrderListView
              title="画像オーダ"
              empty="画像オーダはありません"
              actionLabel="画像を追加"
              onAction={() => onAddOrder?.('imaging')}
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
              actionLabel="本日の記載へ"
              onAction={openTodayRecord}
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
              title="予約"
              empty="予約枠はありません"
              actionLabel="予約を変更"
              onAction={onOpenReservation}
              secondaryActionLabel={scheduledVisit ? '予約取消' : undefined}
              onSecondaryAction={scheduledVisit ? onCancelReservation : undefined}
              items={[
                ...(scheduledVisit
                  ? [
                      {
                        key: `scheduled-${scheduledVisit.slotId ?? scheduledVisit.date}`,
                        title: `次回予約: ${scheduledVisit.date}`,
                        meta: scheduledVisit.department,
                        body: scheduledVisit.note,
                      },
                    ]
                  : []),
                ...reservationSlots.map((slot) => ({
                  key: slot.id,
                  title: `${slot.date} ${slot.time}`,
                  meta: `${slot.department} ・ ${slot.doctor} ・ ${slot.state} ・ ${slot.bookedCount}/${slot.capacity}件`,
                  body: '',
                })),
              ]}
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

type CalendarEventKind = 'chart' | 'lab' | 'rx' | 'image' | 'reservation' | 'booking';

type CalendarEventDetail = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  meta: string;
  body?: string;
};

const eventDotClass: Record<CalendarEventKind, string> = {
  chart: 'bg-brand',
  lab: 'bg-success',
  rx: 'bg-warning',
  image: 'bg-chart-3',
  reservation: 'bg-cyan-600',
  booking: 'bg-destructive',
};

const calendarLegendItems: Array<{
  kind: CalendarEventKind;
  label: string;
  icon: typeof FileText;
  className: string;
}> = [
  { kind: 'chart', label: '診療録', icon: FileText, className: 'border-blue-100 bg-blue-50 text-brand' },
  { kind: 'lab', label: '検査', icon: FlaskConical, className: 'border-green-100 bg-green-50 text-success' },
  { kind: 'rx', label: '処方', icon: Pill, className: 'border-yellow-100 bg-yellow-50 text-warning' },
  { kind: 'image', label: '画像', icon: ScanLine, className: 'border-purple-100 bg-purple-50 text-chart-3' },
  { kind: 'reservation', label: '予約枠', icon: CalendarClock, className: 'border-cyan-100 bg-cyan-50 text-cyan-700' },
  { kind: 'booking', label: '次回予約', icon: CalendarPlus, className: 'border-red-100 bg-red-50 text-destructive' },
];

const CalendarView = ({
  eventsByDate,
}: {
  eventsByDate: Map<string, CalendarEventDetail[]>;
}) => {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [visibleKinds, setVisibleKinds] = useState<Set<CalendarEventKind>>(
    () => new Set(calendarLegendItems.map((item) => item.kind)),
  );
  const [selectedDateKey, setSelectedDateKey] = useState(() => formatDateKey(new Date()));
  const days = currentMonthDays(visibleMonth);
  const todayKey = formatDateKey(new Date());
  const monthLabel = `${visibleMonth.getFullYear()}年 ${visibleMonth.getMonth() + 1}月`;
  const selectedDateEvents = (eventsByDate.get(selectedDateKey) ?? []).filter((event) => visibleKinds.has(event.kind));
  const moveMonth = (delta: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };
  const toggleKind = (kind: CalendarEventKind) => {
    setVisibleKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next.size === 0 ? current : next;
    });
  };

  return (
    <section className="py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
          {calendarLegendItems.map((item) => {
            const isActive = visibleKinds.has(item.kind);

            return (
              <CalendarLegend
                className={item.className}
                icon={item.icon}
                isActive={isActive}
                key={item.kind}
                label={item.label}
                onClick={() => toggleKind(item.kind)}
              />
            );
          })}
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
          const events = (eventsByDate.get(key) ?? []).filter((event) => visibleKinds.has(event.kind));
          const eventKinds = Array.from(new Set(events.map((event) => event.kind)));
          const previewEvents = events.filter((event) => event.kind === 'reservation' || event.kind === 'booking').slice(0, 3);
          const isToday = key === todayKey;
          const muted = day.getMonth() !== visibleMonth.getMonth();
          const isSelected = key === selectedDateKey;
          return (
            <button
              key={key}
              className={`min-h-24 border-b border-r border-border p-2 text-left last:border-r-0 ${
                isSelected
                  ? 'bg-blue-50 ring-2 ring-inset ring-brand'
                  : muted
                    ? 'bg-surface-subtle/60 text-text-tertiary'
                    : 'bg-card text-text-primary'
              }`}
              onClick={() => setSelectedDateKey(key)}
              type="button"
            >
              <div
                className={`mb-2 inline-grid size-7 place-items-center rounded-full text-[12px] ${
                  isToday ? 'bg-brand text-white' : ''
                }`}
              >
                {day.getDate()}
              </div>
              {eventKinds.length > 0 ? (
                <div className="flex gap-1">
                  {eventKinds.map((event) => (
                    <span key={event} className={`size-2 rounded-full ${eventDotClass[event]}`} />
                  ))}
                </div>
              ) : null}
              {previewEvents.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {previewEvents.map((event) => (
                    <li
                      key={event.id}
                      className="truncate rounded-sm bg-surface-subtle px-1.5 py-1 text-[10px] text-text-secondary"
                    >
                      {event.title}
                    </li>
                  ))}
                  {events.length > previewEvents.length ? (
                    <li className="text-[10px] text-text-tertiary">他 {events.length - previewEvents.length} 件</li>
                  ) : null}
                </ul>
              ) : null}
            </button>
          );
        })}
      </div>
      <section className="mt-4 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h3 className="text-[15px] font-bold text-text-primary">{selectedDateKey} の内容</h3>
          <span className="text-[12px] text-text-tertiary">{selectedDateEvents.length}件</span>
        </div>
        {selectedDateEvents.length > 0 ? (
          <div className="divide-y divide-border">
            {selectedDateEvents.map((event) => {
              const legend = calendarLegendItems.find((item) => item.kind === event.kind);
              const Icon = legend?.icon ?? FileText;

              return (
                <article className="px-4 py-3" key={event.id}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-grid size-7 shrink-0 place-items-center rounded-full border ${legend?.className ?? 'border-border bg-surface-subtle text-text-secondary'}`}>
                      <Icon size={14} strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[14px] font-bold text-text-primary">{event.title}</p>
                        <span className="text-[11px] font-bold text-text-tertiary">{legend?.label}</span>
                      </div>
                      <p className="mt-1 text-[12px] text-text-tertiary">{event.meta}</p>
                      {event.body ? <p className="mt-2 text-[13px] leading-normal text-text-secondary">{event.body}</p> : null}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-[13px] text-text-tertiary">表示対象の予定・記録はありません。</p>
        )}
      </section>
    </section>
  );
};

const CalendarLegend = ({
  className,
  icon: Icon,
  isActive,
  label,
  onClick,
}: {
  className: string;
  icon: typeof FileText;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    aria-pressed={isActive}
    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[12px] font-bold transition-colors ${
      isActive ? 'border-brand bg-white text-text-secondary' : 'border-border bg-surface-subtle text-text-tertiary opacity-60'
    }`}
    onClick={onClick}
    type="button"
  >
    <span className={`inline-grid size-5 place-items-center rounded-full border ${isActive ? className : 'border-border bg-white text-text-tertiary'}`}>
      <Icon size={12} strokeWidth={2.2} />
    </span>
    {label}
  </button>
);

const LabsView = ({
  onAddLab,
  results,
  trends,
}: {
  onAddLab?: () => void;
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
  const [selectedLabItems, setSelectedLabItems] = useState<Set<string>>(() => new Set());
  const [trendItems, setTrendItems] = useState<string[]>([]);
  const [isDraggingLabItems, setIsDraggingLabItems] = useState(false);
  const [labDragMode, setLabDragMode] = useState<'select' | 'deselect'>('select');
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const filtered = timeline.filter((row) => {
    if (selectedItem !== 'all' && row.item !== selectedItem) return false;
    if (abnormalOnly && labValueTone(row.result, row.baseline, row.flag) === 'normal') return false;
    return true;
  });
  const trendRowsToShow = trendItems
    .flatMap((item) => timeline.filter((row) => row.item === item))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  useEffect(() => {
    if (!isDraggingLabItems) {
      return undefined;
    }

    const stopDragging = () => setIsDraggingLabItems(false);
    window.addEventListener('pointerup', stopDragging);
    return () => window.removeEventListener('pointerup', stopDragging);
  }, [isDraggingLabItems]);

  const applyLabItemSelection = (item: string, mode: 'select' | 'deselect') => {
    setSelectedLabItems((current) => {
      const next = new Set(current);
      if (mode === 'select') {
        next.add(item);
      } else {
        next.delete(item);
      }
      return next;
    });
  };

  const handleLabPointerDown = (event: PointerEvent<HTMLTableRowElement>, item: string) => {
    if (event.button !== 0) {
      return;
    }

    const nextMode = selectedLabItems.has(item) ? 'deselect' : 'select';
    setLabDragMode(nextMode);
    setIsDraggingLabItems(true);
    applyLabItemSelection(item, nextMode);
  };

  const handleLabPointerEnter = (item: string) => {
    if (!isDraggingLabItems) {
      return;
    }
    applyLabItemSelection(item, labDragMode);
  };

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
          選択 {selectedLabItems.size}項目 ・ 表示 {filtered.length} 件
        </span>
        <Button onClick={onAddLab} size="xs" type="button" variant="outline">
          検査を追加
        </Button>
        <Button
          disabled={selectedLabItems.size === 0}
          onClick={() => setTrendItems(Array.from(selectedLabItems))}
          size="xs"
          type="button"
          variant="outline"
        >
          選択項目の推移
        </Button>
        <Button
          disabled={selectedLabItems.size === 0}
          onClick={() => {
            setSelectedLabItems(new Set());
            setTrendItems([]);
          }}
          size="xs"
          type="button"
          variant="ghost"
        >
          選択解除
        </Button>
        <Button variant="ghost" size="xs" onClick={() => window.print()}>
          印刷
        </Button>
      </div>

      <table className="w-full overflow-hidden rounded-lg border border-border bg-card text-[13px]">
        <thead>
          <tr className="border-b border-border bg-surface-subtle text-[11px] uppercase tracking-wide text-text-tertiary">
            <th className="w-10 px-3 py-2 text-left font-bold">選択</th>
            <th className="px-3 py-2 text-left font-bold">日付</th>
            <th className="px-3 py-2 text-left font-bold">項目</th>
            <th className="px-3 py-2 text-right font-bold">値</th>
            <th className="px-3 py-2 text-right font-bold">基準</th>
            <th className="px-3 py-2 text-right font-bold">前回</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((result, index) => {
            const isSelected = selectedLabItems.has(result.item);
            const tone = labValueTone(result.result, result.baseline, result.flag);

            return (
              <tr
                // biome-ignore lint/suspicious/noArrayIndexKey: static demo timeline fallback
                key={`${result.date}-${result.item}-${index}`}
                className={`cursor-pointer select-none border-b border-border/60 last:border-b-0 hover:bg-blue-50 ${isSelected ? 'bg-blue-50' : ''}`}
                onPointerDown={(event) => handleLabPointerDown(event, result.item)}
                onPointerEnter={() => handleLabPointerEnter(result.item)}
              >
                <td className="px-3 py-2.5">
                  <span className={`inline-grid size-5 place-items-center rounded border text-[11px] font-bold ${
                    isSelected ? 'border-brand bg-brand text-white' : 'border-border bg-white text-transparent'
                  }`}>
                    ✓
                  </span>
                </td>
                <td className="px-3 py-2.5 text-text-tertiary tabular-nums">{result.date}</td>
                <td className="px-3 py-2.5 font-bold text-text-primary">{result.item}</td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${labToneClassName(tone)}`}
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
            );
          })}
        </tbody>
      </table>

      {trendItems.length > 0 ? (
        <section className="mt-6 rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h3 className="text-[16px] font-bold text-text-primary">選択項目の推移</h3>
              <p className="mt-1 text-[12px] text-text-tertiary">
                行をドラッグまたはクリックして項目を選び、右上の共通アクションから表示します。
              </p>
            </div>
            <span className="text-[12px] font-bold text-text-secondary">{trendItems.length}項目</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-subtle text-[11px] uppercase tracking-wide text-text-tertiary">
                  <th className="px-3 py-2 text-left font-bold">日付</th>
                  <th className="px-3 py-2 text-left font-bold">項目</th>
                  <th className="px-3 py-2 text-right font-bold">値</th>
                  <th className="px-3 py-2 text-right font-bold">基準</th>
                  <th className="px-3 py-2 text-right font-bold">前回</th>
                  <th className="px-3 py-2 text-right font-bold">判定</th>
                </tr>
              </thead>
              <tbody>
                {trendRowsToShow.map((row, index) => {
                  const tone = labValueTone(row.result, row.baseline, row.flag);

                  return (
                    <tr
                      // biome-ignore lint/suspicious/noArrayIndexKey: static demo timeline fallback
                      className="border-b border-border/60 last:border-b-0"
                      key={`${row.date}-${row.item}-trend-${index}`}
                    >
                      <td className="px-3 py-2.5 font-bold text-text-primary">{row.date}</td>
                      <td className="px-3 py-2.5 text-text-primary">{row.item}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${labToneClassName(tone)}`}>{row.result}</td>
                      <td className="px-3 py-2.5 text-right text-text-tertiary tabular-nums">{row.baseline}</td>
                      <td className="px-3 py-2.5 text-right text-text-tertiary tabular-nums">{row.previous}</td>
                      <td className="px-3 py-2.5 text-right text-text-tertiary">
                        {tone === 'high' ? '高値' : tone === 'low' ? '低値' : '基準内'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
};

const OrderListView = ({
  actionLabel,
  secondaryActionLabel,
  title,
  empty,
  items,
  onAction,
  onSecondaryAction,
}: {
  actionLabel?: string;
  secondaryActionLabel?: string;
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; meta: string; body: string }>;
  onAction?: () => void;
  onSecondaryAction?: () => void;
}) => (
  <section className="py-5">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[18px] font-bold text-text-primary">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {secondaryActionLabel && onSecondaryAction ? (
          <Button onClick={onSecondaryAction} size="xs" type="button" variant="ghost">
            {secondaryActionLabel}
          </Button>
        ) : null}
        {actionLabel && onAction ? (
          <Button onClick={onAction} size="xs" type="button" variant="outline">
            <Plus size={13} />
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </div>
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
