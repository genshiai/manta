import { Fragment, useMemo, useState } from 'react';
import type {
  ImagingOrderEntry,
  InpatientDocument,
  LabLongTrendItem,
  LabResultEntry,
  PrescriptionEntry,
  PrescriptionTimelineGroup,
  ProcedureOrderEntry,
} from '../../../types/workflow';
import { cn } from '../../ui/utils';
import type { Lens } from './streamModel';

type LabOrderLike = {
  id: number;
  category: string;
  status: 'done' | 'pending' | 'cancelled';
  urgency?: '通常' | '至急';
  items: string[];
  createdAt?: string;
};

type ClinicalLensViewProps = {
  lens: Lens;
  patientId: string;
  labTrends: LabLongTrendItem[];
  labResults: LabResultEntry[];
  prescriptions: PrescriptionEntry[];
  prescriptionTimeline: PrescriptionTimelineGroup[];
  labOrders: LabOrderLike[];
  imagingOrders: ImagingOrderEntry[];
  procedureOrders: ProcedureOrderEntry[];
  documents: InpatientDocument[];
  isMutating: boolean;
  onCompose: (query?: string) => void;
  onRepeatAll: () => void;
  onRepeatMedication: (medication: PrescriptionEntry) => void;
  onInsertLabs: (snapshots: string[]) => void;
};

type Flag = 'high' | 'low' | 'normal';
type MatrixPoint = { date: string; value: string; flag: Flag };
type MatrixRow = {
  name: string;
  unit: string;
  reference: string;
  starred: boolean;
  group: string;
  points: MatrixPoint[];
};

const cleanValue = (value?: string) => (value || '—').replace(/\s+None\b/g, '').trim();

function dateValue(raw: string): number {
  const parsed = new Date(raw.replace(/\//g, '-'));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function dateParts(raw: string, patientId: string) {
  const parsed = new Date(raw.replace(/\//g, '-'));
  if (Number.isNaN(parsed.getTime())) return { year: '', short: raw, tag: '' };
  const iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  const wardTags: Record<string, string> = {
    '2026-07-10': '入院時',
    '2026-07-11': '病日2',
    '2026-07-13': '病日4',
  };
  return {
    year: String(parsed.getFullYear()),
    short: `${parsed.getMonth() + 1}/${parsed.getDate()}`,
    tag: patientId === '0004120388' ? wardTags[iso] || '' : '',
  };
}

function unitFromValue(value: string) {
  const match = cleanValue(value).match(/[0-9.,]+\s*(.*)$/);
  return match?.[1]?.trim() || '';
}

function labGroup(name: string): string {
  if (/CRP|WBC|白血球/i.test(name)) return '炎症';
  if (/Hb$|Hgb|PLT|血小板|Ht/i.test(name)) return '血算';
  if (/TP$|Alb|AST|ALT|LDH|γ|ALP|Bil/i.test(name)) return '蛋白・肝機能';
  if (/BUN|Cr$|Cre|eGFR|Na$|K$|Cl$/i.test(name)) return '腎機能・電解質';
  if (/血糖|HbA1c|GLU/i.test(name)) return '糖代謝';
  if (/BNP|トロポニン|CK/i.test(name)) return '循環器';
  return 'その他';
}

function buildMatrixRows(trends: LabLongTrendItem[], results: LabResultEntry[]): MatrixRow[] {
  const byName = new Map<string, MatrixRow>();
  const ensure = (name: string, reference = '', latest = '') => {
    const current = byName.get(name);
    if (current) return current;
    const row: MatrixRow = {
      name,
      unit: unitFromValue(latest),
      reference,
      starred: /^(CRP|WBC|eGFR|BNP|トロポニン I|LDL-C)$/i.test(name),
      group: labGroup(name),
      points: [],
    };
    byName.set(name, row);
    return row;
  };

  for (const result of results) {
    const row = ensure(result.item, result.baseline, result.result);
    for (const point of result.history) {
      row.points.push({ date: point.date, value: cleanValue(point.value), flag: point.flag });
    }
    if (result.reportedAt && !row.points.some((point) => point.date === result.reportedAt)) {
      row.points.push({ date: result.reportedAt, value: cleanValue(result.result), flag: result.flag });
    }
  }

  for (const trend of trends) {
    const row = ensure(trend.item, trend.baseline || '', trend.latestValue || '');
    const resultCutoff = row.points.length ? Math.max(...row.points.map((point) => dateValue(point.date))) : 0;
    for (const point of trend.points) {
      if ((!resultCutoff || dateValue(point.date) <= resultCutoff) && !row.points.some((existing) => existing.date === point.date)) {
        row.points.push({ date: point.date, value: cleanValue(point.value), flag: point.flag });
      }
    }
  }

  return Array.from(byName.values())
    .map((row) => ({ ...row, points: row.points.sort((a, b) => dateValue(a.date) - dateValue(b.date)) }))
    .sort((a, b) => {
      const order = ['炎症', '血算', '蛋白・肝機能', '腎機能・電解質', '糖代謝', '循環器', 'その他'];
      const itemOrder = ['CRP', 'WBC', 'Hb', 'PLT', 'TP', 'Alb', 'AST', 'ALT', 'LDH', 'BUN', 'Cr', 'eGFR', 'Na', 'K', 'Cl', '血糖（随時）'];
      return order.indexOf(a.group) - order.indexOf(b.group)
        || itemOrder.indexOf(a.name) - itemOrder.indexOf(b.name)
        || a.name.localeCompare(b.name, 'ja');
    });
}

function Sparkline({ points }: { points: MatrixPoint[] }) {
  const values = points.map((point) => Number.parseFloat(point.value.replace(/,/g, ''))).filter(Number.isFinite);
  if (values.length < 2) return <span className="spark-empty">·</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 64;
  const height = 16;
  const x = (index: number) => 2 + (index * (width - 6)) / (values.length - 1);
  const y = (value: number) => height - 2.5 - ((value - min) / range) * (height - 5);
  const polyline = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="matrix-spark">
      <polyline points={polyline} fill="none" stroke="var(--brand)" strokeWidth="1.3" opacity=".7" />
      <circle cx={x(last)} cy={y(values[last])} r="1.9" fill="var(--brand)" />
    </svg>
  );
}

function TrendChart({ row, patientId }: { row: MatrixRow; patientId: string }) {
  const [scope, setScope] = useState<'all' | 'year' | 'admission'>('all');
  const allPoints = row.points;
  const latest = allPoints.at(-1)?.date ? dateValue(allPoints.at(-1)?.date || '') : 0;
  const points = allPoints.filter((point) => {
    if (scope === 'year') return dateValue(point.date) >= latest - 366 * 86_400_000;
    if (scope === 'admission') return dateValue(point.date) >= dateValue('2026-07-10');
    return true;
  });
  if (points.length < 2) {
    return <div className="trend-wrap"><div className="trend-head"><b>{row.name}</b></div><div className="lv-note">この期間には数値が2点未満です — スコープを広げてください。</div></div>;
  }
  const numbers = points.map((point) => Number.parseFloat(point.value.replace(/,/g, ''))).filter(Number.isFinite);
  const rangeMatch = row.reference.match(/([\d.]+)\s*[–〜~-]\s*([\d.]+)/);
  const highMatch = row.reference.match(/[≤<]\s*([\d.]+)/);
  const lowMatch = row.reference.match(/[≥>]\s*([\d.]+)/);
  const band = rangeMatch
    ? { low: Number(rangeMatch[1]), high: Number(rangeMatch[2]) }
    : highMatch
      ? { low: undefined, high: Number(highMatch[1]) }
      : lowMatch
        ? { low: Number(lowMatch[1]), high: undefined }
        : null;
  let domainLow = Math.min(...numbers);
  let domainHigh = Math.max(...numbers);
  if (band?.low != null) domainLow = Math.min(domainLow, band.low);
  if (band?.high != null) domainHigh = Math.max(domainHigh, band.high);
  const padding = (domainHigh - domainLow) * 0.15 || 1;
  const low = domainLow - padding;
  const high = domainHigh + padding;
  const width = 760;
  const height = 150;
  const left = 26;
  const right = 26;
  const top = 18;
  const bottom = 26;
  const x = (index: number) => left + (index * (width - left - right)) / (points.length - 1);
  const y = (value: number) => top + (height - top - bottom) * (1 - (value - low) / (high - low));
  const color = (flag: Flag) => flag === 'high' ? 'var(--lens-lab-high)' : flag === 'low' ? 'var(--lens-lab-low)' : 'var(--brand)';
  const line = points.map((point, index) => `${x(index).toFixed(1)},${y(Number.parseFloat(point.value.replace(/,/g, ''))).toFixed(1)}`).join(' ');
  return (
    <div className="trend-wrap">
      <div className="trend-head">
        <b>{row.name}</b><span>{row.unit}</span><span className="trend-ref">基準 {row.reference || '—'}（緑帯）</span>
        <span className="tscope-row">
          <button type="button" className={cn('tscope', scope === 'all' && 'active')} onClick={(event) => { event.stopPropagation(); setScope('all'); }}>全期間</button>
          <button type="button" className={cn('tscope', scope === 'year' && 'active')} onClick={(event) => { event.stopPropagation(); setScope('year'); }}>直近1年</button>
          {patientId === '0004120388' ? <button type="button" className={cn('tscope', scope === 'admission' && 'active')} onClick={(event) => { event.stopPropagation(); setScope('admission'); }}>この入院</button> : null}
        </span>
        <span className="trend-count">{points.length} 時点{scope === 'all' ? ' — 列の表示モードに関わらず全データ' : ''}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-svg" role="img" aria-label={`${row.name}の推移`}>
        {band ? (() => {
          const bandTop = band.high == null ? top : y(band.high);
          const bandBottom = band.low == null ? height - bottom : y(band.low);
          return (
            <>
              <rect x={left} y={Math.min(bandTop, bandBottom)} width={width - left - right} height={Math.abs(bandBottom - bandTop)} fill="#edf3ea" opacity=".85" />
              {band.high == null ? null : <line x1={left} x2={width - right} y1={bandTop} y2={bandTop} stroke="#9db894" strokeDasharray="3 3" />}
              {band.low == null ? null : <line x1={left} x2={width - right} y1={bandBottom} y2={bandBottom} stroke="#9db894" strokeDasharray="3 3" />}
            </>
          );
        })() : null}
        <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="1.8" opacity=".8" />
        {points.map((point, index) => {
          const value = Number.parseFloat(point.value.replace(/,/g, ''));
          const date = dateParts(point.date, patientId);
          return (
            <Fragment key={`${point.date}-${point.value}`}>
              <circle cx={x(index)} cy={y(value)} r="3.2" fill={color(point.flag)} />
              <text x={x(index)} y={y(value) - 8} fontSize="10" fontWeight="700" textAnchor="middle" fill={color(point.flag)}>{cleanValue(point.value).split(' ')[0]}</text>
              <text x={x(index)} y={height - 8} fontSize="9" textAnchor="middle" fill="var(--text-tertiary)">{date.year.slice(2)}/{date.short}{date.tag ? `·${date.tag}` : ''}</text>
            </Fragment>
          );
        })}
      </svg>
    </div>
  );
}

function LabLens({ patientId, trends, results, onInsert }: { patientId: string; trends: LabLongTrendItem[]; results: LabResultEntry[]; onInsert: (snapshots: string[]) => void }) {
  const [starOnly, setStarOnly] = useState(false);
  const [allColumns, setAllColumns] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => buildMatrixRows(trends, results), [results, trends]);
  const dates = useMemo(() => Array.from(new Set(rows.flatMap((row) => row.points.map((point) => point.date)))).sort((a, b) => dateValue(a) - dateValue(b)), [rows]);
  const visibleDates = allColumns || dates.length <= 6 ? dates : dates.slice(-6);
  const visibleRows = rows.filter((row) => !starOnly || row.starred);
  const groups = Array.from(new Set(visibleRows.map((row) => row.group)));
  const pointAt = (row: MatrixRow, date: string) => row.points.find((point) => point.date === date);
  const toggle = (name: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  return (
    <section className="lensview" aria-label="検査レンズ">
      <div className="lv-head">
        <span className="lv-title">検査 — 表ビュー（基本）</span>
        <span className="lv-sub">行=項目 × 列=時系列（左→右 = 古→新 · <b>右端が最新</b>）· <b>行クリックで推移を展開</b></span>
        <div className="lv-nav">
          {dates.length > 6 ? <button type="button" className="chip" onClick={() => setAllColumns((value) => !value)}>列: {allColumns ? 'すべて ✓' : '主要 ✓'}</button> : null}
          <button type="button" className="chip" onClick={() => setStarOnly((value) => !value)}>★のみ{starOnly ? ' ✓' : ''}</button>
          <button type="button" className="chip" title="さらに過去の列を読み込みます">‹ 前の期間</button>
          <button type="button" className="chip" onClick={() => onInsert(visibleRows.filter((row) => row.starred).map((row) => {
            const latest = row.points.at(-1);
            return `${row.name} ${latest?.value || '—'}（${latest ? dateParts(latest.date, patientId).short : '—'}）`;
          }))}>選択 → O欄へ差込</button>
        </div>
      </div>
      {visibleRows.length === 0 ? <div className="lv-note">この患者の検査データはまだありません。</div> : (
        <div className="matrix-wrap">
          <table className="matrix">
            <thead><tr><th className="matrix-item-head">項目</th><th className="refcol">基準値</th><th className="sparkhead">推移</th>{visibleDates.map((date) => { const info = dateParts(date, patientId); return <th key={date}><span className="yy">{info.year}</span>{info.short}{info.tag ? <span className="ctag">{info.tag}</span> : null}</th>; })}</tr></thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group}>
                  <tr className="gr"><th colSpan={3 + visibleDates.length}>{group}</th></tr>
                  {visibleRows.filter((row) => row.group === group).map((row) => (
                    <Fragment key={row.name}>
                      <tr className={cn(expanded.has(row.name) && 'trend-on')} data-trend={row.name} onClick={() => toggle(row.name)}>
                        <th>{row.starred ? '★ ' : ''}{row.name}<span className="uu"> {row.unit}</span></th>
                        <td className="refcol num">{row.reference || '—'}</td>
                        <td className="sparkcell"><Sparkline points={row.points} /></td>
                        {visibleDates.map((date) => { const point = pointAt(row, date); return <td key={date} className={point ? point.flag : 'na'}>{point ? <>{cleanValue(point.value).split(' ')[0]}{point.flag === 'high' ? ' ↑' : point.flag === 'low' ? ' ↓' : ''}</> : '—'}</td>; })}
                      </tr>
                      {expanded.has(row.name) ? <tr className="trendrow"><td colSpan={3 + visibleDates.length}><TrendChart row={row} patientId={patientId} /></td></tr> : null}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="lv-note">表がこのレンズの基本形。★=フォロー項目 — 出どころは ①プロブレム既定セット ②医師のピン（行頭 ★ をクリック） ③<b>新規異常・前回比悪化</b>（デルタチェック。慢性の既知異常は騒がずプロブレム枠で定点観測、自動浮上は上限3件）。ストリーム側は「★3〜5項目＋ほか n項目 折畳」に圧縮されます。</div>
    </section>
  );
}

function PrescriptionLens({ prescriptions, timeline, isMutating, onCompose, onRepeatAll, onRepeatMedication }: Pick<ClinicalLensViewProps, 'prescriptions' | 'isMutating' | 'onCompose' | 'onRepeatAll' | 'onRepeatMedication'> & { timeline: PrescriptionTimelineGroup[] }) {
  const active = prescriptions.filter((medication) => medication.type !== '注射');
  const history = timeline.filter((group) => !group.isToday);
  return (
    <section className="lensview" aria-label="処方レンズ">
      <div className="lv-head"><span className="lv-title">処方</span><div className="lv-nav">{active.length ? <button type="button" className="chip" disabled={isMutating} onClick={onRepeatAll}>まとめて前回 Do（{active.length}剤）</button> : null}<button type="button" className="chip" onClick={() => onCompose('')}>＋ 新規処方 <span className="kbd">⌘O</span></button></div></div>
      {active.length ? <><div className="tl-sec"><span className="secdot dm-med" />現在の処方（継続中） · {active.length}</div><div className="tl">{active.map((medication) => <div className="tlrow" key={`${medication.drugName}-${medication.createdAt ?? medication.dosage}`}><span className="d num">{medication.drugName.includes('持参薬') ? '入院時 継続' : medication.createdAt?.slice(0, 10).replace(/-/g, '/') || '本日'}</span><span className="w"><span className="ocat-chip dm-med">{medication.type || '内服'}</span>{medication.drugName}<span className="sub">{medication.dosage} — {medication.days}</span></span><span className="st"><button type="button" className="btn sm" disabled={isMutating} onClick={() => onRepeatMedication(medication)}>前回 Do</button></span></div>)}</div></> : <div className="lv-note">継続中の処方はありません。</div>}
      {history.length ? <><div className="tl-sec">開始・変更・Do の履歴</div><div className="tl">{history.flatMap((group) => group.items.map((medication) => <div className={cn('tlrow', !group.copyable && 'ghost')} key={`${group.date}-${medication.drugName}-${medication.dosage}`}><span className="d num">{group.date.replace(/-/g, '/')}</span><span className="w">{medication.drugName}<span className="sub">{medication.dosage} · {medication.days}</span></span><span className="st" /></div>))}</div></> : null}
    </section>
  );
}

type OrderCategory = 'すべて' | '薬剤' | '検査・画像' | '治療・処置' | 'リハビリ' | '食事・指示';
type OrderRow = { id: string; section: OrderCategory; cat: string; domain: string; date: string; title: string; course?: string; sub: string; status: string; state: string };

const YAMAMOTO_ORDER_ROWS: OrderRow[] = [
  { id: 'ward-rx-ctrx', section: '薬剤', cat: '注射', domain: 'dm-med', date: '7/10 開始', title: 'セフトリアキソン 2g · 1日1回', course: 'day 5/7 · 7/16 終了予定', sub: '本日分 14:00 — 未実施', status: '継続中', state: 'cont' },
  { id: 'ward-rx-amlodipine', section: '薬剤', cat: '内服', domain: 'dm-med', date: '7/10 継続', title: 'アムロジピン錠 5mg（持参薬継続）', sub: '1T · 分1 朝食後', status: '継続中', state: 'cont' },
  { id: 'ward-lab-next', section: '検査・画像', cat: '検査', domain: 'dm-test', date: '明朝 6:00', title: '採血（CRP · 血算）', sub: '定時採血', status: '予定', state: 'sched' },
  { id: 'ward-lab-713', section: '検査・画像', cat: '検査', domain: 'dm-test', date: '7/13', title: '採血（CRP · 血算 · 生化学）', sub: '院内検査室', status: '結果到着 ›', state: 'done' },
  { id: 'ward-culture-blood', section: '検査・画像', cat: '検査', domain: 'dm-test', date: '7/10 → 7/13', title: '血液培養 2セット', sub: '最終報告: 陰性', status: '結果到着 ›', state: 'done' },
  { id: 'ward-culture-sputum', section: '検査・画像', cat: '検査', domain: 'dm-test', date: '7/10 → 7/12', title: '喀痰培養', sub: '中間報告: 常在菌叢 — 最終報告待ち', status: '中間報告', state: 'wait' },
  { id: 'ward-xray-next', section: '検査・画像', cat: '画像', domain: 'dm-img', date: '7/16 予定', title: '胸部X線 2方向', sub: '退院前フォロー', status: '予定', state: 'sched' },
  { id: 'ward-xray-entry', section: '検査・画像', cat: '画像', domain: 'dm-img', date: '7/10', title: '胸部X線 2方向', sub: '右下肺浸潤影 — 読影確定', status: 'レポート到着 ›', state: 'done' },
  { id: 'ward-o2', section: '治療・処置', cat: '処置', domain: 'dm-proc', date: '7/10 → 7/13', title: '酸素投与 1L 鼻カニュラ', sub: 'SpO2 安定のため離脱', status: '中止（離脱）', state: 'stop' },
  { id: 'ward-suction', section: '治療・処置', cat: '処置', domain: 'dm-proc', date: '7/10 開始', title: '喀痰吸引 適宜', sub: '夜間中心 · 看護実施', status: '継続中', state: 'cont' },
  { id: 'ward-st', section: 'リハビリ', cat: 'リハビリ', domain: 'dm-reha', date: '本日 依頼', title: 'ST 嚥下評価・訓練', sub: '本日午後 初回 — 結果で食形態を判断', status: '依頼済', state: 'wait' },
  { id: 'ward-pt', section: 'リハビリ', cat: 'リハビリ', domain: 'dm-reha', date: '7/12 開始', title: 'PT 離床・歩行訓練', course: '週5回', sub: '病棟内 · 転倒注意', status: '継続中', state: 'cont' },
  { id: 'ward-diet', section: '食事・指示', cat: '食事', domain: '', date: '7/11 開始', title: 'きざみ食＋とろみ', sub: 'ST 評価後に形態を再評価', status: '継続中', state: 'cont' },
  { id: 'ward-rest', section: '食事・指示', cat: '指示', domain: '', date: '7/13 改訂', title: '安静度: 病棟内フリー · バイタル 1日2検', sub: '転倒注意は継続', status: '継続中', state: 'cont' },
  { id: 'ward-standing', section: '食事・指示', cat: '指示', domain: '', date: '7/10 設定', title: '入院時指示セット v2（頓用・コール基準 6項目）', sub: '発熱時・不眠時・疼痛時・SpO2・血圧・血糖 — 詳細は補助情報に常設', status: '継続中', state: 'cont' },
];

function OrderLens({ patientId, prescriptions, labOrders, imagingOrders, procedureOrders, onCompose }: Pick<ClinicalLensViewProps, 'patientId' | 'prescriptions' | 'labOrders' | 'imagingOrders' | 'procedureOrders' | 'onCompose'>) {
  const [category, setCategory] = useState<OrderCategory>('すべて');
  const apiRows: OrderRow[] = [
    ...prescriptions.map((item, index) => ({ id: `rx-${index}-${item.drugName}`, section: '薬剤' as const, cat: item.type || '内服', domain: 'dm-med', date: item.createdAt?.slice(0, 10).replace(/-/g, '/') || '本日', title: item.drugName, sub: `${item.dosage} · ${item.days}`, status: '継続中', state: 'cont' })),
    ...labOrders.filter((item) => item.status !== 'cancelled').map((item) => ({ id: `lab-${item.id}`, section: '検査・画像' as const, cat: '検査', domain: 'dm-test', date: item.createdAt?.slice(0, 10).replace(/-/g, '/') || '本日', title: item.category, sub: item.items.join(' · '), status: item.status === 'done' ? '結果到着' : item.urgency === '至急' ? '至急 · 結果待ち' : '予定', state: item.status === 'done' ? 'done' : 'sched' })),
    ...imagingOrders.filter((item) => item.status !== 'cancelled').map((item, index) => ({ id: `img-${item.id ?? index}`, section: '検査・画像' as const, cat: '画像', domain: 'dm-img', date: item.scheduledAt || '未定', title: item.category, sub: item.note || '所見未登録', status: item.status === 'scheduled' ? '予約済' : '下書き', state: item.status === 'scheduled' ? 'sched' : 'wait' })),
    ...procedureOrders.filter((item) => item.status !== 'cancelled').map((item, index) => ({ id: `proc-${item.id ?? index}`, section: '治療・処置' as const, cat: '処置', domain: 'dm-proc', date: '本日', title: item.title, sub: item.note || '詳細未登録', status: item.status === 'done' ? '実施済' : '予定', state: item.status === 'done' ? 'done' : 'sched' })),
  ];
  const rows = patientId === '0004120388'
    ? [
        ...YAMAMOTO_ORDER_ROWS,
        ...apiRows.filter((row) => !/セフトリアキソン|アムロジピン|採血フォロー|胸部X線|嚥下評価/.test(`${row.title} ${row.sub}`)),
      ]
    : apiRows;
  const sections: Array<{ key: OrderCategory; label: string; domain: string }> = [
    { key: '薬剤', label: '薬剤（内服・注射）', domain: 'dm-med' },
    { key: '検査・画像', label: '検査・画像', domain: 'dm-test' },
    { key: '治療・処置', label: '治療・処置', domain: 'dm-proc' },
    { key: 'リハビリ', label: 'リハビリ', domain: 'dm-reha' },
    { key: '食事・指示', label: '食事・指示', domain: '' },
  ];
  const visible = rows.filter((row) => category === 'すべて' || row.section === category);
  return (
    <section className="lensview" aria-label="オーダーレンズ">
      <div className="lv-head"><span className="lv-title">オーダー — 発行 → 実施 → 結果</span><span className="lv-sub">継続中のものは終了予定つき</span><div className="lv-nav"><button type="button" className="chip" onClick={() => onCompose()}>＋ 新規オーダー <span className="kbd">⌘O</span></button></div></div>
      <div className="ocat-row">{(['すべて', '薬剤', '検査・画像', '治療・処置', 'リハビリ', '食事・指示'] as const).map((item) => <button type="button" className={cn('ocat', category === item && 'active')} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
      {visible.length ? sections.map((section) => { const sectionRows = visible.filter((row) => row.section === section.key); return sectionRows.length ? <Fragment key={section.key}><div className="tl-sec"><span className={cn('secdot', section.domain)} />{section.label} · {sectionRows.length}</div><div className="tl">{sectionRows.map((row) => <div className="tlrow" key={row.id}><span className="d num">{row.date}</span><span className="w"><span className={cn('ocat-chip', row.domain)}>{row.cat}</span>{row.title}{row.course ? <span className="tag num">{row.course}</span> : null}<span className="sub">{row.sub}</span></span><span className={cn('st', row.state)}>{row.status}</span></div>)}</div></Fragment> : null; }) : <div className="lv-note">該当するオーダーはありません。</div>}
      <div className="lv-note">結果の到着は<b>キューと連絡に通知</b>されます — 開いて確認しに行く必要はありません。継続オーダーは<b>終了予定と day n/m</b>を常に表示します。</div>
    </section>
  );
}

function ImagingDocumentLens({ documents }: Pick<ClinicalLensViewProps, 'documents'>) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  if (!documents.length) return <section className="lensview" aria-label="画像・文書レンズ"><div className="lv-note">画像・文書はまだありません。</div></section>;
  return (
    <section className="mock-document-stream" aria-label="画像・文書レンズ">
      {documents.map((document) => {
        const isOpen = open.has(document.id);
        const parsed = new Date(document.updatedAt);
        return <article className="dayblock" key={document.id}><div className="gut"><span className="gd">{Number.isNaN(parsed.getTime()) ? '文書' : `${parsed.getMonth() + 1}/${parsed.getDate()}`}</span><span className="gy">{Number.isNaN(parsed.getTime()) ? '' : parsed.getFullYear()}</span><span className="gk">文書</span></div><div className="bd"><div className="evrow"><span className="ev-text">{document.title} · {document.status === 'signed' ? '署名済' : document.status === 'draft' ? '下書き' : '取消'}</span><button type="button" className="ev-link" onClick={() => setOpen((current) => { const next = new Set(current); if (next.has(document.id)) next.delete(document.id); else next.add(document.id); return next; })}>{isOpen ? '原本を閉じる' : '原本を開く'} ›</button></div>{isOpen ? <pre className="document-original">{document.body}</pre> : null}</div></article>;
      })}
    </section>
  );
}

export function ClinicalLensView(props: ClinicalLensViewProps) {
  if (props.lens === 'lab') return <LabLens patientId={props.patientId} trends={props.labTrends} results={props.labResults} onInsert={props.onInsertLabs} />;
  if (props.lens === 'rx') return <PrescriptionLens prescriptions={props.prescriptions} timeline={props.prescriptionTimeline} isMutating={props.isMutating} onCompose={props.onCompose} onRepeatAll={props.onRepeatAll} onRepeatMedication={props.onRepeatMedication} />;
  if (props.lens === 'order') return <OrderLens patientId={props.patientId} prescriptions={props.prescriptions} labOrders={props.labOrders} imagingOrders={props.imagingOrders} procedureOrders={props.procedureOrders} onCompose={props.onCompose} />;
  if (props.lens === 'imaging') return <ImagingDocumentLens documents={props.documents} />;
  return null;
}
