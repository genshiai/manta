/**
 * シートのストリームモデル。
 * ChartWorkspace が保持する既存データ（SOAP・オーダー・検査・履歴）を、
 * 1本のスクロール文書＝時系列ブロック列 (StreamBlock[]) に組み立てる。
 *
 * 仕様: docs/KARTE_UI_SPEC.md §4（View）
 */
import type {
  ChartHistoryEntry,
  ImagingOrderEntry,
  LabResultEntry,
  PrescriptionEntry,
  PrescriptionTimelineGroup,
  ProcedureOrderEntry,
  VitalEntry,
} from '../../../types/workflow';
import type { VitalDay } from './vitalsModel';

export type Lens = 'all' | 'exam' | 'lab' | 'rx' | 'imaging';

export const LENSES: Array<{ value: Lens; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'exam', label: '診察' },
  { value: 'lab', label: '検査' },
  { value: 'rx', label: '処方' },
  { value: 'imaging', label: '画像・文書' },
];

/** 行為列の 1 行（薬剤・検査・画像・処置） */
export type ActKind = 'rx' | 'lab' | 'imaging' | 'procedure';

export type SheetAct = {
  id: string;
  kind: ActKind;
  name: string;
  usage?: string;
  /** ⚠ 警告行（PMDA・腎機能など） */
  warn?: string;
  /** 本日新規追加分 */
  isNew?: boolean;
};

export type BillingLine = { label: string; points: number };
export type BillingPreview = { lines: BillingLine[]; total: number } | null;

export type SoapText = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

/** 赤入れ（差分）セグメント。eq=そのまま / ins=追加(緑) / del=削除(赤・取消線)。P2（KARTE_UX_IMPROVEMENTS 論点②） */
export type RedlineSeg = { t: 'eq' | 'ins' | 'del'; text: string };
/** プレーン文字列 または 赤入れセグメント列。P2 */
export type RichText = string | RedlineSeg[];
/** 確定後の追記（誰・いつ・本文）。本文は赤入れ可。P2 */
export type Amendment = { author: string; at: string; body: RichText };

type BaseBlock = {
  id: string;
  /** 生の日付文字列（ジャンプ用キー） */
  dateKey: string;
  /** 表示用ヘッダ（M/D（曜）） */
  dateLabel: string;
  time?: string;
  meta: string;
  /** このブロックが属するレンズカテゴリ */
  categories: Lens[];
};

export type TodayBlock = BaseBlock & {
  kind: 'today';
  soap: SoapText;
  vitals: VitalEntry[];
  acts: SheetAct[];
  billing: BillingPreview;
  version: number;
  /** 版確定（ロック）済みなら確定時刻と版。未確定は undefined。P2 */
  finalized?: { at: string; version: number };
  /** 確定後の追記（時系列）。P2 */
  amendments?: Amendment[];
};

export type VisitBlock = BaseBlock & {
  kind: 'visit';
  /** 常時表示する A/P 要約 */
  assessment: string;
  soap?: SoapText;
  acts: SheetAct[];
  billing: BillingPreview;
  foldLabel: string;
};

export type LabBlock = BaseBlock & {
  kind: 'lab';
  results: LabResultEntry[];
};

export type AdmissionBlockData = BaseBlock & {
  kind: 'admission';
  headerRange: string;
  diagnosis: string;
  location: string;
  days: VitalDay[];
  rangeLabel: string;
  rangeSubLabel: string;
  abstract: string;
  documents: Array<{ name: string; status: string; ok?: boolean }>;
  billingLabel: string;
  foldLabel: string;
};

export type StreamBlock = TodayBlock | VisitBlock | LabBlock | AdmissionBlockData;

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** "2026-07-04" / "2026/07/04" / "7/4" 等を M/D（曜） に整形。失敗時は原文。 */
export function formatDayHeader(raw: string): { label: string; time?: string } {
  if (!raw) return { label: '—' };
  const [datePart, timePartRaw] = raw.trim().split(/[ T]/);
  const time = timePartRaw ? timePartRaw.slice(0, 5) : undefined;
  const parsed = new Date(datePart.replace(/\//g, '-'));
  if (Number.isNaN(parsed.getTime())) {
    return { label: raw };
  }
  const label = `${parsed.getMonth() + 1}/${parsed.getDate()}（${WEEKDAYS[parsed.getDay()]}）`;
  return { label, time };
}

/** 月フロート用ラベル（YYYY年M月）。失敗時は空。 */
export function formatMonthFloat(raw: string): string {
  if (!raw) return '';
  const [datePart] = raw.trim().split(/[ T]/);
  const parsed = new Date(datePart.replace(/\//g, '-'));
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月`;
}

function prescriptionToAct(rx: PrescriptionEntry, idx: number, isNew: boolean): SheetAct {
  const usageParts = [rx.dosage, rx.days ? `${rx.days}` : ''].filter(Boolean);
  return {
    id: `rx-${idx}-${rx.drugName}`,
    kind: 'rx',
    name: rx.drugName,
    usage: usageParts.join(' · '),
    warn: rx.warnings && rx.warnings.length > 0 ? `⚠ ${rx.warnings[0]}` : undefined,
    isNew,
  };
}

type BuildTodayArgs = {
  patientDepartment: string;
  doctor: string;
  soap: SoapText;
  version: number;
  savedAt: string | null;
  vitals: VitalEntry[];
  prescriptions: PrescriptionEntry[];
  labOrders: Array<{ category: string; status: string; items: string[]; urgency?: string }>;
  imagingOrders: ImagingOrderEntry[];
  procedureOrders: ProcedureOrderEntry[];
  billing: BillingPreview;
  reason?: string;
  /** 今セッションで追加した行為の名称。新規 chip 判定に使う。 */
  newlyAddedNames?: Set<string>;
};

export function buildTodayBlock(args: BuildTodayArgs): TodayBlock {
  const { label, time } = formatDayHeader(args.savedAt ?? new Date().toISOString());
  const added = args.newlyAddedNames ?? new Set<string>();
  const acts: SheetAct[] = [];
  args.prescriptions.forEach((rx, idx) => {
    acts.push(prescriptionToAct(rx, idx, added.has(rx.drugName)));
  });
  args.labOrders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o, idx) => {
      acts.push({
        id: `lab-${idx}-${o.category}`,
        kind: 'lab',
        name: o.category,
        usage: o.items.slice(0, 3).join('・') || (o.urgency === '至急' ? '至急' : '通常'),
        isNew: added.has(o.category),
      });
    });
  args.imagingOrders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o, idx) => {
      acts.push({
        id: `img-${idx}-${o.category}`,
        kind: 'imaging',
        name: o.category,
        usage: o.scheduledAt || o.note || '本日',
        isNew: added.has(o.category),
      });
    });
  args.procedureOrders
    .filter((o) => o.status !== 'cancelled')
    .forEach((o, idx) => {
      acts.push({
        id: `proc-${idx}-${o.title}`,
        kind: 'procedure',
        name: o.title,
        usage: o.note || undefined,
        isNew: added.has(o.title),
      });
    });

  const categories: Lens[] = ['exam'];
  if (acts.some((a) => a.kind === 'rx')) categories.push('rx');
  if (acts.some((a) => a.kind === 'lab')) categories.push('lab');
  if (acts.some((a) => a.kind === 'imaging' || a.kind === 'procedure')) categories.push('imaging');

  const metaParts = [args.reason || '本日の診察', args.patientDepartment, args.doctor, `v${args.version}`].filter(
    Boolean,
  );

  return {
    kind: 'today',
    id: 'today',
    dateKey: args.savedAt ?? 'today',
    dateLabel: label,
    time: time ?? undefined,
    meta: metaParts.join(' · '),
    categories,
    soap: args.soap,
    vitals: args.vitals,
    acts,
    billing: args.billing,
    version: args.version,
  };
}

/** 過去受診ブロックを chartHistory + prescriptionTimeline から組み立てる */
export function buildVisitBlocks(
  chartHistory: ChartHistoryEntry[],
  prescriptionTimeline: PrescriptionTimelineGroup[],
): VisitBlock[] {
  const timelineByDate = new Map<string, PrescriptionTimelineGroup>();
  for (const group of prescriptionTimeline) {
    // 本日分は today ブロックに含めるので除外
    if (group.isToday) continue;
    timelineByDate.set(group.date, group);
  }

  return chartHistory.map((visit, idx) => {
    const { label } = formatDayHeader(visit.date);
    const group = timelineByDate.get(visit.date);
    const acts: SheetAct[] = [];
    if (group) {
      const count = group.itemCount;
      acts.push({
        id: `visit-${idx}-rx`,
        kind: 'rx',
        name: `内服 ${count}剤${group.copyable ? '（Do）' : ''}`,
        usage: group.items[0]?.days ? `${group.items[0].days}` : undefined,
      });
    }
    const categories: Lens[] = ['exam'];
    if (acts.length > 0) categories.push('rx');
    const foldParts = ['S/O 全文'];
    if (group) foldParts.push('処方詳細');
    return {
      kind: 'visit',
      id: `visit-${idx}-${visit.date}`,
      dateKey: visit.date,
      dateLabel: label,
      meta: [visit.title, visit.department].filter(Boolean).join(' · '),
      categories,
      assessment: visit.summary,
      acts,
      billing: null,
      foldLabel: foldParts.join(' · '),
    };
  });
}

/** 検査結果ブロック（現在の院内採血パネル） */
export function buildLabBlock(labResults: LabResultEntry[]): LabBlock | null {
  if (labResults.length === 0) return null;
  const reportedAt = labResults.find((r) => r.reportedAt)?.reportedAt ?? '';
  const { label, time } = formatDayHeader(reportedAt);
  return {
    kind: 'lab',
    id: 'lab-panel',
    dateKey: reportedAt || 'lab',
    dateLabel: reportedAt ? label : '検査結果',
    time,
    meta: '検査結果 · 院内採血',
    categories: ['lab'],
    results: labResults,
  };
}

/** レンズでブロックを絞り込む */
export function filterByLens(blocks: StreamBlock[], lens: Lens): StreamBlock[] {
  if (lens === 'all') return blocks;
  return blocks.filter((b) => b.categories.includes(lens));
}

/**
 * クライアント側の「概算」算定プレビュー（デモ用）。
 * 実際の診療報酬点数計算ではなく、再診/管理料/処方の代表点数を用いた粗い目安。
 * backend の billing-preview API は未実装のため、UI では必ず「概算」バッジを付けて表示する
 * （無印の点数表示にしない）。仕様: §12（未取得時は「—点」で診療を止めない → null 許容）。
 */
export function computeBillingPreview(args: {
  hasVisit: boolean;
  prescriptionCount: number;
  managedProblemCount: number;
}): BillingPreview {
  if (!args.hasVisit) return null;
  const lines: BillingLine[] = [];
  lines.push({ label: '再診', points: 75 });
  if (args.managedProblemCount >= 1) {
    lines.push({ label: '管理料', points: 225 });
  }
  if (args.prescriptionCount > 0) {
    lines.push({ label: '処方', points: 60 });
  }
  const total = lines.reduce((sum, l) => sum + l.points, 0);
  return { lines, total };
}
