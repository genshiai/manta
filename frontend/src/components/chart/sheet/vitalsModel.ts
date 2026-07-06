/**
 * 温度板（VitalsBoard）のデータモデルとスケール（KARTE_UI_SPEC §8.2）。
 * inpatient progress の vitals 文字列（例: "体温 38.9℃" "血圧 132/78"）を時系列点に整形する。
 * 標準配色: 体温=青(--vt-temp) / 脈拍=赤(--vt-pulse) / 血圧=∨∧(--vt-bp)（看護教材準拠・変更禁止）。
 */
import type { InpatientProgress, InpatientProgressRow } from '../../../types/workflow';

export type VitalDay = {
  date: string;
  byoubi: number;
  temp?: number;
  pulse?: number;
  sbp?: number;
  dbp?: number;
  spo2?: number;
  o2?: string;
  abx?: string;
  meal?: string;
  events: string[];
};

function findVital(vitals: string[], keywords: string[]): string | undefined {
  const matched = vitals.find((v) => keywords.some((k) => v.includes(k)));
  if (!matched) return undefined;
  return matched.replace(/^(体温|脈拍|血圧|SpO2|SPO2|BT|HR|Pulse|BP|酸素飽和度|酸素)\s*[:：]?\s*/i, '').trim();
}

function num(value?: string): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function shortDate(raw: string): string {
  const d = new Date(raw.replace(/\//g, '-').split(/[ T]/)[0]);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function rowEvents(row: InpatientProgressRow): string[] {
  const events: string[] = [];
  const all = [...row.labOrders, ...row.instructions, ...row.nursingNotes].join(' ');
  if (/入院/.test(all)) events.push('入院');
  if (/血液培養|血培/.test(all)) events.push('血培');
  if (/(XP|X線|レントゲン|CT)/i.test(all)) events.push('XP');
  if (/内服(へ|切替|スイッチ)/.test(all)) events.push('内服へ');
  if (/退院/.test(all)) events.push('退院決定');
  return events;
}

/** progress → 温度板の日次点。 */
export function buildVitalDays(progress: InpatientProgress): VitalDay[] {
  return progress.rows.map((row, i) => {
    const bp = findVital(row.vitals, ['血圧', 'BP']);
    const [sbpStr, dbpStr] = (bp ?? '').split('/');
    const abx = row.prescriptions.find((p) => /(CTRX|AMPC|CVA|セフ|ペニシリン|抗菌|注射)/i.test(p));
    const meal = findVital(row.vitals, ['食事', '食']);
    return {
      date: shortDate(row.date),
      byoubi: i + 1,
      temp: num(findVital(row.vitals, ['体温', 'BT'])),
      pulse: num(findVital(row.vitals, ['脈拍', 'HR', 'Pulse'])),
      sbp: num(sbpStr),
      dbp: num(dbpStr),
      spo2: num(findVital(row.vitals, ['SpO2', 'SPO2'])),
      o2: findVital(row.vitals, ['酸素']),
      abx: abx ? abx.replace(/\s*\d+日.*$/, '') : undefined,
      meal,
      events: rowEvents(row),
    };
  });
}

// === SVG スケール（viewBox 1032 x 316） ===
export const VT = {
  viewW: 1032,
  viewH: 316,
  left: 80,
  right: 980,
  gridTop: 20,
  gridBottom: 264,
};

/** i 番目（0..n-1）の x 座標 */
export function vtX(i: number, n: number): number {
  if (n <= 1) return (VT.left + VT.right) / 2;
  return VT.left + (i * (VT.right - VT.left)) / (n - 1);
}

/** 体温 → y（左軸 35–40℃、40=上） */
export function tempY(t: number): number {
  return VT.gridTop + (40 - t) * ((VT.gridBottom - VT.gridTop) / 5);
}

/** 脈拍 → y（右軸 40–140、140=上） */
export function pulseY(p: number): number {
  return VT.gridTop + (140 - p) * ((VT.gridBottom - VT.gridTop) / 100);
}

/** 血圧 → y（60–180mmHg を帯の中に。値が高いほど上） */
export function bpY(v: number): number {
  const y = 90 + (180 - v) * (170 / 120);
  return Math.max(28, Math.min(300, y));
}
