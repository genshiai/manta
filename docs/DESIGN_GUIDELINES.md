# Manta デザインガイドライン

本ドキュメントは、Manta のUIデザインにおける指針をまとめたものです。
**Apple Human Interface Guidelines (apple.com/jp 実測値)** と **StyleSeed Notion skin** を基盤に、
モダン SaaS の設計言語をクリニカル EMR に適用しています。

カラー・タイポ・ボタン形状の根拠は [ADR 0003](decisions/0003-color-system-apple-hig.md) を、
コンポーネント基盤は [ADR 0002](decisions/0002-styleseed-adoption.md) を正とします。

---

## 0. 絶対原則（North Star）

**Manta の UI は Linear / Notion / Vercel / Stripe と同水準のモダン SaaS を目指す。**
レガシー EMR の UI パターン（多色コーディング・高密度レイアウト・装飾過多・枠囲みの多層化）は**採用しない**。「既存 EMR がこうだから」は採用理由として無効。

### 守ること

1. **モダン SaaS 志向**: 構造は余白・タイポグラフィ・階層で伝える。視覚的ノイズは削る。
2. **プライマリ 1 色厳守**: Apple CTA Blue (`#0071e3`) のみ。情報種別ごとの色分けはしない。
3. **情報識別はアイコン・ラベル・タイポグラフィで**: 色に頼らない。
4. **タブ・ナビゲーションはミニマル**: アンダーライン型のシンプルなタブ。ボーダー・シャドウ・背景色の多重塗りを重ねない。
5. **既存 EMR の踏襲ではなく再解釈**: PDF 仕様書は地図であって模写対象ではない。
6. **規律ある色の使用**: iOS System Color は彩度が高い。**使う場所を厳しく制限**することで長時間閲覧を成立させる。

### やらないこと

- 情報タイプ別のカラーコーディング（処方=青、検査=緑、画像=シアン… の類）
- 同一画面で 2 色以上のアクセントカラーを同時使用
- 既存 EMR を模した高密度レイアウト・詰め込み UI
- 枠・ボーダー・背景色・シャドウの多層化による "囲みすぎ" UI
- 純白 (`#ffffff`) 背景 + 純黒寄り (`rgba(0,0,0,0.95)`) 文字の組み合わせ（業務アプリには強すぎる）
- 方針が矛盾する両論併記の記述を残すこと

### セマンティックカラーだけは例外

エラー / 警告 / 成功 の状態色は **状態通知専用**。情報分類には使わない。`--warning` (`#FF9500`) と `--destructive` (`#FF3B30`) を**異なる色**で識別できることが必須。

---

## 参照元ガイドライン

### 一次資料（このプロジェクトの正）

- **[ADR 0003](decisions/0003-color-system-apple-hig.md)** — カラー / タイポ / ボタン形状の決定（Apple HIG 準拠）
- **[ADR 0002](decisions/0002-styleseed-adoption.md)** — StyleSeed Notion skin + Tailwind v4 採用
- **[ADR 0001](decisions/0001-design-system-digital-cho-and-pivot.md)** — 旧デジタル庁系離脱の経緯（Superseded by 0002）
- **[design-reference/apple-jp-design.md](design-reference/apple-jp-design.md)** — apple.com/jp 実測値仕様
- **[IMPLEMENTATION_PLAN_UI_REFRESH.md](IMPLEMENTATION_PLAN_UI_REFRESH.md)** — UI リフレッシュの実装計画（Phase 1-5 完了済み）

### 外部参照

- **Apple Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines
- **WCAG 2.2**: https://www.w3.org/TR/WCAG22/
- **awesome-design-md-jp / apple/DESIGN.md**: Apple JP 実測仕様の出典

---

## 1. 設計原則

### Apple HIG 準拠

- **Clarity（明瞭性）**: インターフェースは読みやすく、正確で、理解しやすいこと
- **Deference（控えめさ）**: UIは視覚的な雑然さを最小限にし、コンテンツとタスクに集中させる
- **Depth（奥行き）**: 視覚的レイヤーとリアルなモーションで階層を伝える

### StyleSeed Notion skin 哲学

- **Warmth & Approachability**: カルテは「記録ドキュメント」であり、Notion 流の広い余白・温かい中立色・content-first と整合
- 69 個の設計ルール（DESIGN-LANGUAGE.md）が Claude Code に自動ロードされ UI 生成・レビューに適用される
- 32 個の Radix ベース UI プリミティブ + 16 個のダッシュボードパターンを基盤に
- StyleSeed のトークン名（`--brand`, `--text-primary` 等）は維持し、**値のみ Apple HIG に置換**（ADR 0002 互換性のため）

### アクセシビリティファースト

- **WCAG 2.2 AA 準拠**: コントラスト比 4.5:1 以上（テキスト）
- タッチターゲット 44px 以上
- キーボード操作完全対応
- フォーカスインジケータ明示（Apple HIG 準拠: `0 0 0 3px rgba(0,113,227,0.2)`）
- 色だけで情報を伝えない（アイコン・テキスト併用）
- WAI-ARIA 1.2 準拠

### Apple HIG / Notion skin から **採用しない** 部分

EMR 向けに以下は調整:

- **フォントサイズ**: Apple の 17px body / 40px heading は採用しない → 14px body / 18-20px heading に圧縮（情報密度優先）
- **マガジンレイアウト余白**: 採用しない → 3 ペイン高密度を優先
- 採用するのは **配色・タイポ規則・ボタン形状・フォーカスリング・フォントスタック**

---

## 2. タイポグラフィ

### フォントファミリ（システムフォント only、ネット通信ゼロ）

```css
font-family:
  "SF Pro JP", "SF Pro Text", "SF Pro Icons",
  "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3",
  メイリオ, Meiryo, "ＭＳ Ｐゴシック",
  -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;

letter-spacing: -0.012em;       /* 本文（負トラッキング） */
font-feature-settings: normal;  /* palt 不使用（SF Pro JP に内蔵） */
```

注意:
- ヒラギノ角ゴは **Pro**（**ProN ではない**） — Apple JP サイト準拠
- 14px 以下のキャプションは `letter-spacing: normal`
- 大見出し（24px+）は `letter-spacing: -0.015em`
- Google Fonts / 外部 font link は使わない（オフラインクリニック環境対応）
- Linux / Android では system sans-serif にフォールバック

### フォントサイズ（EMR 高密度向けに圧縮）

| 用途 | サイズ | ウェイト |
|------|--------|---------|
| 見出し H1 | 24px (1.5rem) | 700 (Bold) |
| 見出し H2 | 20px (1.25rem) | 700 (Bold) |
| 見出し H3 | 18px (1.125rem) | 600 (SemiBold) |
| 本文 | 14px (0.875rem) | 400 (Regular) |
| ラベル・キャプション | 13px (0.8125rem) | 500 (Medium) |
| 小テキスト | 12px (0.75rem) | 400 (Regular) |

### テキスト設定

- **行間（line-height）**: 1.6（本文）、1.4（見出し）
- **最大行長**: 40em（読みやすさのため）

---

## 3. カラーパレット

すべて **Apple HIG (apple.com/jp 実測値)** に準拠。値は [ADR 0003](decisions/0003-color-system-apple-hig.md) と [`frontend/src/styles/theme.css`](../frontend/src/styles/theme.css) を正とする。

### 背景・サーフェス

| 用途 | カラーコード | トークン |
|------|------------|---------|
| ページ背景 | `#f5f5f7` | `--surface-page` / `--background` |
| カード背景 | `#ffffff` | `--card` |
| サブ背景 | `#f5f5f7` | `--surface-subtle` |
| Muted 背景 | `#e8e5e1` | `--surface-muted` |

### テキスト階層

| 用途 | カラーコード | トークン |
|------|------------|---------|
| 主文字 | `#1d1d1f`（Apple Near Black、純黒禁止） | `--text-primary` / `--foreground` |
| 副文字 | `rgba(29,29,31,0.72)` | `--text-secondary` |
| 三次文字 | `#6e6e73`（Apple Glyph Gray Secondary） | `--text-tertiary` |
| 無効 | `#c4c0bb` | `--text-disabled` |

### アクセント（Apple Blue）

| 用途 | カラーコード | トークン |
|------|------------|---------|
| プライマリ CTA | `#0071e3`（Apple CTA Blue） | `--brand` |
| ホバー / リンク | `#0066cc`（Apple Link Blue） | `--brand-hover` |
| アクセント透過 | `#e8f1fc` | `--brand-tint` |
| フォーカスリング | `rgba(0,113,227,0.2)` | `--brand-focus-ring` |

### 状態色（iOS System Color、規律ある限定使用）

| 用途 | カラーコード | トークン | 背景 |
|------|------------|---------|------|
| 警告 (Warning) | `#FF9500`（iOS Orange） | `--warning` | `--warning-bg`: `#FFF4E5` |
| エラー (Destructive) | `#FF3B30`（iOS Red） | `--destructive` | `--destructive-bg`: `#FFE5E3` |
| 成功 (Success) | `#34C759`（iOS Green） | `--success` | `--success-bg`: `#E5F8EA` |
| 情報 (Info) | `#0071e3`（Apple Blue 兼用） | `--info` | — |

### 境界線

| 用途 | カラーコード | トークン |
|------|------------|---------|
| 標準境界 | `#D2D2D7`（Apple 標準） | `--border` |
| 強調境界 | `#BCBCC2` | `--border-strong` |

### 規律: 色を使う場所を厳しく制限

iOS System Color は彩度が高い。Apple は**使う場所を厳しく制限**することで長時間閲覧を成立させている。Manta も同じ規律を採用:

- **アクセント青** → CTA・選択中の日付・選択中のカルテ・主要操作・本文中のリンクのみ
- **正常表示には色を使わない**（ノイズ削減、必要な時だけ色が出る）
- **異常検査** → `--destructive` + アイコン併用（色だけに依存しない）
- **警告タグ** → `--warning-bg` + `--warning` 文字
- 装飾目的でアクセント色を散らさない

---

## 4. スペーシング

### 8px ベースライングリッド

| トークン | 値 |
|---------|-----|
| spacing-xs | 4px |
| spacing-sm | 8px |
| spacing-md | 16px |
| spacing-lg | 24px |
| spacing-xl | 32px |
| spacing-2xl | 48px |
| spacing-3xl | 64px |

### コンポーネント内パディング

| コンポーネント | パディング |
|-------------|----------|
| カード | 24px |
| ボタン | 12px 24px |
| インプット | 12px 16px |
| セクション間 | 32px |
| ページマージン | 24px〜32px |

---

## 5. アクセシビリティ

### コントラスト比

| 対象 | 最小比 | 推奨比 |
|------|--------|--------|
| 通常テキスト | 4.5:1 | 7:1 |
| 大テキスト（24px+ / 18px+太字） | 4.5:1 | — |
| UIコンポーネント・グラフィック | 3:1 | — |

### タッチターゲット

- 最小サイズ: **44px x 44px**（Apple HIG推奨）
- インタラクティブ要素間の余白: **8px以上**

### その他

- 色だけで情報を伝えない（アイコン・テキストを併用）
- フォーカスインジケータを明確に表示（Apple HIG: `box-shadow: 0 0 0 3px rgba(0,113,227,0.2)`）
- キーボード操作に完全対応
- スクリーンリーダー対応（WAI-ARIA 1.2）

---

## 6. コンポーネントスタイル

### カード

```css
border-radius: 12px;
box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
border: 1px solid var(--border); /* #D2D2D7 */
background: var(--card);          /* #ffffff */
```

### ボタン（Apple HIG 形状ガイド）

```css
/* Primary CTA — 完全ピル型 */
background: var(--brand);              /* #0071e3 */
color: var(--primary-foreground);      /* #ffffff */
border-radius: 980px;                   /* = rounded-full */
font-weight: 600;
padding: 12px 24px;
min-height: 44px;

/* hover */
background: var(--brand-hover);         /* #0066cc */

/* focus-visible */
box-shadow: 0 0 0 3px var(--brand-focus-ring); /* rgba(0,113,227,0.2) */

/* Outline — 完全ピル型 */
background: transparent;
color: var(--brand);                    /* #0071e3 */
border: 1px solid var(--brand);
border-radius: 980px;

/* Dark Fill (破壊的操作 / モーダル確定) — 角丸 */
background: #1d1d1f;
color: #ffffff;
border-radius: 8px;                     /* ピル型ではない */

/* Ghost — 角丸 */
background: transparent;
border-radius: 6px;
/* hover で bg-surface-subtle */
```

形状ルールまとめ:
- **Primary / Outline** → 完全ピル型 (`rounded-full` / `border-radius: 980px`)
- **Destructive (Dark Fill) / Secondary / Ghost** → 角丸 (`rounded-md` / 6-8px)

### インプット

```css
border: 1px solid var(--border);        /* #D2D2D7 */
border-radius: 8px;
padding: 12px 16px;
font-size: 14px;
min-height: 44px;
transition: border-color 0.2s;
background: var(--input-background);    /* #f5f5f7 */

/* フォーカス時 */
border-color: var(--brand);              /* #0071e3 */
box-shadow: 0 0 0 3px var(--brand-focus-ring);
```

### タブ（アンダーライン型のみ）

```css
/* アクティブ */
border-bottom: 2px solid var(--brand);  /* #0071e3 */
color: var(--brand);
font-weight: 600;

/* 非アクティブ */
color: var(--text-secondary);
```

---

## 7. レイアウト原則

### カルテ画面の基本構成（3 ペイン）

```
┌─────────────────────────────────────────────────┐
│  ヘッダー（ロゴ・検索・ユーザー情報）               │
├──────────┬───────────────────────┬──────────────┤
│          │                       │              │
│ 左ペイン  │   中央メインペイン      │  右ペイン     │
│          │                       │              │
│ ミニ      │   履歴ビュー / 検査 / │ 本日のキュー  │
│ カレンダー │   検索 / カレンダー    │ AI エージェント│
│ 患者      │                       │              │
│ コンテキ  │   「+本日の記載」で   │ 「+追加」で   │
│ スト      │   TodayChartBlock 展開│ 各種オーダー  │
│          │                       │              │
├──────────┴───────────────────────┴──────────────┤
│  ステータスバー                                   │
└─────────────────────────────────────────────────┘
```

詳細レイアウトは [IMPLEMENTATION_PLAN_UI_REFRESH.md](IMPLEMENTATION_PLAN_UI_REFRESH.md) を参照（上流のカルテ UI/UX 再検討メモは私的保管・リポジトリ非同梱）。

### グリッドシステム

- 12カラムグリッド
- 左ペイン: 280-300px（固定、ミニカレンダー + 患者コンテキスト）
- 右ペイン: 320-360px（折りたたみ可能、本日のキュー + AI エージェント）
- メインコンテンツ: 残り（flex-grow）
- ガター: 16px

### 「カルテ作成」は能動的アクション

カルテ画面のデフォルト状態は**履歴ビュー**。
新規記載は明示的に「+本日の記載」ボタンで起動する。
「書く」をデフォルトにしない（Notion / Linear のドキュメントビュー流）。
