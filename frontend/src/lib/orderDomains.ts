import {
  CalendarDays,
  FileText,
  FlaskConical,
  Hand,
  type LucideIcon,
  Pill,
  ScanLine,
  Sparkles,
  Syringe,
} from 'lucide-react';

/**
 * オーダー種別 × アイコン × 意味色の一元対応表（HENRY_UX_BENCHMARK §7 P0-2）。
 *
 * リスト行・オーダーコンポーザ・会計・履歴のどこでも同じ対応で描く。「増やさず反復する」
 * が規則で、新規ドメインの追加はこの表への追記を必須とする（Henry の localized × iconName
 * × iconColorType と同型）。アイコンは lucide 一本化（旧 Icons.tsx / icons/index.tsx は廃止）。
 *
 * 色は brand（UI アクセント単色）と分離した「意味色」。値は theme.css の --domain-* / --ai
 * トークンにあり、ここでは tone → class の写像だけ持つ。lucide コンポーネント参照を含むため
 * platform-agnostic な tokens/*.json ではなく lib/ の TS として定義している。
 */
export type OrderDomain =
  | 'prescription'
  | 'injection'
  | 'labTest'
  | 'imaging'
  | 'procedure'
  | 'document'
  | 'appointment'
  | 'ai';

/** 意味色トーン。brand は含めない（プロミネントなアクセントは単色を維持する）。 */
export type DomainTone = 'med' | 'test' | 'procedure' | 'neutral' | 'ai';

export type OrderDomainSpec = { label: string; Icon: LucideIcon; tone: DomainTone };

export const orderDomains: Record<OrderDomain, OrderDomainSpec> = {
  prescription: { label: '処方・内服', Icon: Pill, tone: 'med' },
  injection: { label: '注射・点滴', Icon: Syringe, tone: 'med' },
  labTest: { label: '検体検査', Icon: FlaskConical, tone: 'test' },
  imaging: { label: '画像・生体', Icon: ScanLine, tone: 'test' },
  procedure: { label: '処置・手技', Icon: Hand, tone: 'procedure' },
  document: { label: '文書', Icon: FileText, tone: 'neutral' },
  appointment: { label: '予約・次回', Icon: CalendarDays, tone: 'neutral' },
  ai: { label: 'AI', Icon: Sparkles, tone: 'ai' },
};

/** tone → 小アイコンの tint 用 text カラークラス（塗り・本文には使わない）。 */
export const domainToneClass: Record<DomainTone, string> = {
  med: 'text-domain-med',
  test: 'text-domain-test',
  procedure: 'text-domain-procedure',
  neutral: 'text-text-tertiary',
  ai: 'text-ai',
};

/** ⌘O コンポーザ等の検索ヒット種別を意味ドメインへ写像する。 */
export type OrderKind = 'drug' | 'rxset' | 'injection' | 'labset' | 'imaging' | 'procedure';

const kindToDomain: Record<OrderKind, OrderDomain> = {
  drug: 'prescription',
  rxset: 'prescription',
  injection: 'injection',
  labset: 'labTest',
  imaging: 'imaging',
  procedure: 'procedure',
};

export function domainForOrderKind(kind: OrderKind): OrderDomainSpec {
  return orderDomains[kindToDomain[kind]];
}
