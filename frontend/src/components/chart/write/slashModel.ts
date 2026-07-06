/**
 * ／メニュー・@差込 の文法（KARTE_UI_SPEC §5.2・§5.3）。
 * ／=コマンド/挿入、@=データ差込。テキスト欄ならどこでも同じ文法。
 */
import type { LabResultEntry, VitalEntry } from '../../../types/workflow';

export type Trigger = { type: '/' | '@'; query: string; start: number } | null;

/** キャレット直前の ／ か @ を検出（間に空白があれば無効）。 */
export function detectTrigger(value: string, caret: number): Trigger {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = value[i];
    if (ch === ' ' || ch === '\n' || ch === '\t' || ch === '　') return null;
    if (ch === '/' || ch === '／') return { type: '/', query: value.slice(i + 1, caret), start: i };
    if (ch === '@' || ch === '＠') return { type: '@', query: value.slice(i + 1, caret), start: i };
  }
  return null;
}

export type SlashIcon = 'rx' | 'flask' | 'xray' | 'at' | 'schema' | 'spark' | 'doc';

export type SlashAction =
  | { kind: 'insert'; text: string }
  | { kind: 'compose' }
  | { kind: 'recent'; runId: string }
  | { kind: 'atInsert'; token: string }
  | { kind: 'aiDraft'; text: string };

export type SlashItem = {
  id: string;
  group: '最近・よく使う' | 'オーダー・挿入' | 'AI';
  icon: SlashIcon;
  label: string;
  sub?: string;
  quickKey?: '①' | '②' | '③';
  action: SlashAction;
};

export type RecentEntry = { id: string; label: string; sub: string };

function matches(query: string, ...fields: string[]): boolean {
  if (!query) return true;
  const q = query.normalize('NFKC').toLowerCase();
  return fields.some((f) => f.normalize('NFKC').toLowerCase().includes(q));
}

/** ／メニューの項目を組み立てる（インクリメンタル検索対応）。 */
export function buildSlashItems(query: string, recents: RecentEntry[]): SlashItem[] {
  const items: SlashItem[] = [];
  const quick: Array<'①' | '②' | '③'> = ['①', '②', '③'];

  recents.slice(0, 3).forEach((r, i) => {
    if (matches(query, r.label, r.sub)) {
      items.push({
        id: `recent-${r.id}`,
        group: '最近・よく使う',
        icon: r.label.includes('検査') || r.label.includes('セット') ? 'flask' : 'rx',
        label: r.label,
        sub: r.sub || quick[i],
        quickKey: quick[i],
        action: { kind: 'recent', runId: r.id },
      });
    }
  });

  const orderInserts: SlashItem[] = [
    { id: 'order-rx', group: 'オーダー・挿入', icon: 'rx', label: '処方を検索…', sub: '⌘O', action: { kind: 'compose' } },
    { id: 'order-img', group: 'オーダー・挿入', icon: 'xray', label: '画像オーダー', action: { kind: 'compose' } },
    { id: 'insert-at', group: 'オーダー・挿入', icon: 'at', label: '@検査値・@バイタルを差し込む', action: { kind: 'insert', text: '@' } },
    { id: 'insert-schema', group: 'オーダー・挿入', icon: 'schema', label: 'シェーマ（挿入）', action: { kind: 'insert', text: '［シェーマ］' } },
  ];
  for (const item of orderInserts) {
    if (matches(query, item.label)) items.push(item);
  }

  const ai: SlashItem[] = [
    { id: 'ai-draft', group: 'AI', icon: 'spark', label: 'AI下書き — このセクションを提案', action: { kind: 'aiDraft', text: '' } },
    { id: 'ai-summary', group: 'AI', icon: 'doc', label: '前回から要約', action: { kind: 'aiDraft', text: '' } },
  ];
  for (const item of ai) {
    if (matches(query, item.label)) items.push(item);
  }

  return items;
}

const WEEKDAY_SHORT = (raw?: string): string => {
  if (!raw) return '';
  const d = new Date(raw.replace(/\//g, '-').split(/[ T]/)[0]);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/** @差込の候補（検査値・バイタル）。挿入テキストは値スナップショット+取得日。 */
export function buildAtItems(
  query: string,
  labResults: LabResultEntry[],
  vitals: VitalEntry[],
): SlashItem[] {
  const items: SlashItem[] = [];
  for (const lab of labResults) {
    if (matches(query, lab.item)) {
      const date = WEEKDAY_SHORT(lab.reportedAt);
      const token = `【${lab.item} ${lab.result}${date ? ` · ${date}` : ''}】`;
      items.push({
        id: `at-lab-${lab.item}`,
        group: 'オーダー・挿入',
        icon: 'flask',
        label: `検査値: ${lab.item} ${lab.result}`,
        sub: date,
        action: { kind: 'atInsert', token },
      });
    }
  }
  for (const v of vitals) {
    if (matches(query, v.label)) {
      const token = `【${v.label} ${v.value}${v.unit}】`;
      items.push({
        id: `at-vital-${v.label}`,
        group: 'オーダー・挿入',
        icon: 'at',
        label: `バイタル: ${v.label} ${v.value}${v.unit}`,
        action: { kind: 'atInsert', token },
      });
    }
  }
  return items.slice(0, 8);
}
