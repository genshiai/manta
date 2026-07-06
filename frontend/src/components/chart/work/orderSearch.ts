/**
 * ⌘O コンポーザ / ／メニューの横断検索と発行前安全チェック。
 * 既存の個別カタログ（orderConfig）を 1 本に合成する（KARTE_UI_SPEC §6・§12）。
 * バックエンド `GET /karte/order-search` を待たず、ロード済みデータでクライアント検索する。
 */
import type { AlertItem, PatientRecord } from '../../../data/chartMock';
import type {
  ChartOrderConfig,
  LabResultEntry,
  LabSetOption,
  PrescriptionCatalogItem,
  PrescriptionSetMaster,
} from '../../../types/workflow';

export type OrderHitKind = 'drug' | 'labset' | 'rxset' | 'imaging' | 'procedure';

export type OrderHit =
  | { kind: 'drug'; id: string; label: string; meta: string; tail?: string; drug: PrescriptionCatalogItem }
  | { kind: 'labset'; id: string; label: string; meta: string; set: LabSetOption }
  | { kind: 'rxset'; id: string; label: string; meta: string; set: PrescriptionSetMaster }
  | { kind: 'imaging'; id: string; label: string; meta: string; category: string }
  | { kind: 'procedure'; id: string; label: string; meta: string; title: string };

const IMAGING_PRESETS = [
  '胸部XP 2方向',
  '腹部XP 臥位',
  '右膝XP 2方向',
  '左膝XP 2方向',
  '頸椎XP 2方向',
  '腰椎XP 2方向',
  '腹部エコー',
  '心エコー',
  '頭部CT 単純',
  '胸部CT 単純',
];

const PROCEDURE_PRESETS = ['創傷処置', '皮膚科軟膏処置', '関節腔内注射', 'ネブライザー', '静脈内注射', '筋肉内注射'];

const IMAGING_HINT = /(xp|x線|レントゲン|ct|mri|エコー|超音波|画像|撮影|レ線)/i;
const LAB_HINT = /(採血|生化学|血算|血糖|検査|hba1c|尿|培養)/i;
const PROC_HINT = /(処置|注射|注入|ネブ|point|軟膏|吸入)/i;

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}

function drugHaystack(drug: PrescriptionCatalogItem): string {
  return normalize(
    [drug.drugName, drug.genericName, drug.nameKana, ...(drug.aliases ?? [])].filter(Boolean).join(' '),
  );
}

/** 横断検索。型推論でカテゴリ順に並べる。 */
export function searchOrders(query: string, config: ChartOrderConfig, limit = 8): OrderHit[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: OrderHit[] = [];

  // 薬剤
  for (const drug of config.prescriptionCatalog) {
    if (drug.isActive === false) continue;
    if (drugHaystack(drug).includes(q)) {
      const priceLabel =
        drug.drugPrice != null && drug.drugPrice !== ''
          ? `薬価 ¥${drug.drugPrice}${typeof drug.drugPrice === 'number' ? '/錠' : ''}`
          : undefined;
      hits.push({
        kind: 'drug',
        id: drug.id,
        label: drug.drugName,
        meta: [drug.brandFlag === '後発' || drug.hasGeneric ? '後発' : undefined, drug.yjCode ? `YJ ${drug.yjCode}` : undefined, drug.category]
          .filter(Boolean)
          .join(' · '),
        tail: priceLabel,
        drug,
      });
    }
  }

  // 処方セット
  for (const set of config.prescriptionSets) {
    if (set.isActive === false) continue;
    if (normalize(`${set.label} ${set.relatedProblem ?? ''}`).includes(q)) {
      hits.push({
        kind: 'rxset',
        id: set.id,
        label: set.label,
        meta: `処方セット · ${set.items.length}剤`,
        set,
      });
    }
  }

  // 検査セット
  const labMatch = LAB_HINT.test(query);
  for (const set of config.labSetOptions) {
    if (set.isActive === false) continue;
    if (labMatch || normalize(`${set.label} ${set.items.join(' ')}`).includes(q)) {
      hits.push({
        kind: 'labset',
        id: set.id,
        label: set.label,
        meta: `検査セット · ${set.items.slice(0, 3).join('・')}${set.items.length > 3 ? '…' : ''}`,
        set,
      });
    }
  }

  // 画像（クエリが画像系のときに、テキスト一致するプリセットのみ。q が空なら includes('') で全件）
  if (IMAGING_HINT.test(query)) {
    for (const category of IMAGING_PRESETS) {
      if (normalize(category).includes(q)) {
        hits.push({ kind: 'imaging', id: `img-${category}`, label: category, meta: '画像オーダー', category });
      }
    }
  }

  // 処置（同上）
  if (PROC_HINT.test(query)) {
    for (const title of PROCEDURE_PRESETS) {
      if (normalize(title).includes(q)) {
        hits.push({ kind: 'procedure', id: `proc-${title}`, label: title, meta: '処置', title });
      }
    }
  }

  // 重複排除して上限
  const seen = new Set<string>();
  return hits
    .filter((h) => {
      const key = `${h.kind}:${h.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export type OrderSafety = {
  warnings: Array<{ level: 'warn' | 'bad'; text: string }>;
  /** 適応病名不足時に同時追加を提案する病名 */
  missingDiagnosis?: { name: string; icd10?: string };
};

const NSAID_HINT = /(セレコ|ロキソ|ジクロ|ナプロ|メロキシ|nsaids?|イブプロフェン|ロルノキシカム)/i;

function extractEgfr(labResults: LabResultEntry[]): number | null {
  const row = labResults.find((r) => /egfr/i.test(r.item) || r.item.includes('ｅＧＦＲ'));
  if (!row) return null;
  const num = Number.parseFloat(row.result.replace(/[^0-9.]/g, ''));
  return Number.isFinite(num) ? num : null;
}

function matchesAllergy(drug: PrescriptionCatalogItem, alerts: AlertItem[]): string | null {
  const conflict = drug.allergyConflictLabel;
  if (!conflict) return null;
  const hit = alerts.find((a) => a.label.includes(conflict) || conflict.includes(a.label));
  return hit ? conflict : null;
}

/** 発行前の安全チェック（コンポーザ直下にインライン表示）。 */
export function computeDrugSafety(
  drug: PrescriptionCatalogItem,
  patient: PatientRecord,
  labResults: LabResultEntry[],
  activeProblemNames: string[],
): OrderSafety {
  const warnings: OrderSafety['warnings'] = [];

  const allergy = matchesAllergy(drug, patient.alerts);
  if (allergy) {
    warnings.push({ level: 'bad', text: `アレルギー該当: ${allergy}。投与前に必ず確認。` });
  }

  const egfr = extractEgfr(labResults);
  if (egfr != null && egfr < 60 && NSAID_HINT.test(`${drug.drugName} ${drug.genericName ?? ''}`)) {
    warnings.push({
      level: 'warn',
      text: `eGFR ${egfr} — 腎機能低下例で慎重投与（PMDA 電子添文 8.1）。低用量・短期間を推奨。`,
    });
  }

  let missingDiagnosis: OrderSafety['missingDiagnosis'];
  if (drug.relatedProblem && !activeProblemNames.some((p) => p.includes(drug.relatedProblem ?? '×'))) {
    missingDiagnosis = { name: drug.relatedProblem };
  }

  return { warnings, missingDiagnosis };
}
