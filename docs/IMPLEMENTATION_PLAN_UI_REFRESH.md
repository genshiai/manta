# Manta UI リフレッシュ実装計画 (2026-04-30)

> 新規 AI エージェント向け実装ハンドオフ。本ドキュメントを単独で読めば Phase 1〜5 を完遂できることを目指す。Phase 6 は規模が大きいため別計画書に分離する前提。

---

## 0. TL;DR

Manta カルテ画面のフルリフレッシュ。**6 フェーズに分けて段階的に実装**:

| # | Phase | 概要 | サイズ | リスク | 推奨順 |
|---|---|---|---|---|---|
| 1 | ネットワークフォント排除 | Google Fonts の `@import` / `<link>` を全削除し、システムフォント onlyに | XS | 低 | 1 |
| 2 | カラートークン置換 | `theme.css` を Apple HIG (apple.com/jp 実測値) に置き換え | S | 中 | 2 |
| 3 | タイポ規則適用 | 本文に `letter-spacing: -0.012em` 等の Apple JP 規則を適用 | XS | 低 | 3 |
| 4 | 直接 hex 参照の置換 | コンポーネント内のハードコード hex を token 参照に置換 | M | 中 | 4 |
| 5 | ボタンピル型化 | Primary / Outline ボタンを `border-radius: 980px` に | S | 中 | 5 |
| 6 | カルテ UI 構造変更 | 7 タブ・「+本日の記載」・キュー・カレンダー（**別計画書**） | XL | 高 | 別途 |

**Phase 1〜5 は完了**。Phase 6 も初期実装は完了し、現在はカルテ画面のプロダクト品質を上げる後続改善フェーズに入っている。

2026-05-01 時点の実装到達点:

- Phase 1: Google Fonts / 外部 font link は排除済み。システムフォントスタックへ移行済み。
- Phase 2: light mode の主要 color token は Apple HIG 値へ移行済み。
- Phase 3: Apple JP 仕様の `letter-spacing` を適用済み。
- Phase 4: 実行コンポーネント内の直接 hex 参照は token 参照へ整理済み。design token JSON も Apple HIG 値へ追従済み。
- Phase 5: Primary / Outline ボタンはピル型へ移行済み。
- Phase 6: カルテ画面は 3 ペイン shell、上部タブ、左ミニカレンダー、中央の診療録/履歴/検査等ビュー、右 AI エージェント + 本日のキューまで実装済み。

---

## 1. 新エージェント向け Onboarding

### 1.1 Manta とは

外来クリニック向け EMR (Electronic Medical Record) SaaS。React + Vite + TypeScript フロントエンド + Python FastAPI バックエンド。本計画書はフロントエンドのみを対象とする。

- リポジトリルート: `/Users/daichi/Work/genshi/manta`
- フロントエンド: `frontend/` （本計画書で扱うのはここのみ）
- バックエンド: `backend/` （本計画書では触らない）

### 1.2 必読ドキュメント（着手前にこの順で読む）

1. **[`frontend/CLAUDE.md`](../frontend/CLAUDE.md)** — Manta フロントエンドの設計ルール（自動ロードされるが念のため通読）
2. **[`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md)** — 「セクション 0 絶対原則」を必ず読む
3. **[`docs/decisions/0001-design-system-digital-cho-and-pivot.md`](decisions/0001-design-system-digital-cho-and-pivot.md)** — 旧デジタル庁系離脱の経緯（Superseded by 0002）
4. **[`docs/decisions/0002-styleseed-adoption.md`](decisions/0002-styleseed-adoption.md)** — StyleSeed + Notion skin + Tailwind v4 採用
5. **[`docs/decisions/0003-color-system-apple-hig.md`](decisions/0003-color-system-apple-hig.md)** — **本計画書の根拠 ADR**。色・タイポ・ボタン形状の決定
6. **[`docs/DESIGN_REVIEW_KARTE_UX.md`](DESIGN_REVIEW_KARTE_UX.md)** — 「2026-04-30 決定事項」セクションが本計画書の上流
7. **[`docs/design-reference/apple-jp-design.md`](design-reference/apple-jp-design.md)** — Apple JP 実測値仕様書
8. **[`docs/mock-html/color-palettes.html`](mock-html/color-palettes.html)** — 比較モック（A. Apple HIG が採用版、ブラウザで開いて視覚確認可）

### 1.3 ユーザー固有の作業ルール（メモリに保存済み・自動ロードされる）

- **「カルテ作成」は能動的アクション、デフォルト状態ではない** — Phase 6 で実装、Phase 1〜5 では関係しない
- **色味は Apple HIG 準拠で長時間閲覧に耐える設計** — Phase 2〜5 の根拠
- **コミュニケーションは日本語**
- **絵文字は使わない**（明示要求がない限り）

### 1.4 推奨ワークフロー

各フェーズで以下を厳守:

1. **着手前**: 該当フェーズの「Pre-flight checks」を全部 ✅ してから着手
2. **実装中**: 「Files to modify」リストにないファイルは触らない
3. **完了直前**: 「Verification」を全部 ✅
4. **PR 作成前**: ユーザーに diff を見せて承認を取る（**自走で push しない**）
5. **次フェーズ着手判断**: ユーザー承認後にのみ次フェーズへ

---

## 2. 全体像

### 2.1 何を達成するか

- **配色**: 純青 `#0075de` + 純橙 `#dd5b00` ベース → Apple HIG（`#0071e3` + `#FF9500` 等の iOS System Color、規律ある限定使用）
- **背景**: 純白 `#ffffff` → Apple セクション背景 `#f5f5f7`
- **文字**: 純黒寄り `rgba(0,0,0,0.95)` → Apple Near Black `#1d1d1f`
- **フォント**: Google Fonts の Inter + Noto Sans JP（ネット通信） → SF Pro JP + ヒラギノ角ゴ Pro + メイリオ（**システムフォントのみ、ネット通信ゼロ**）
- **タイポ**: 標準 letter-spacing → Apple 流の負トラッキング `-0.012em`
- **ボタン**: 角丸 6-8px → Primary/Outline は完全ピル型 980px
- **状態色**: `--warning` と `--destructive` が同色 `#dd5b00` で識別困難 → iOS System Orange と Red に分離

### 2.2 何を達成しない（Phase 1〜5 の対象外）

- カルテ UI 構造変更（7 タブ・カレンダー・「+本日の記載」ボタン等） — Phase 6
- ダークモード値の Apple HIG 化 — 別途検討（本計画書では light mode のみ）
- Apple のフォントサイズ（17px body / 40px heading） — EMR 高密度を優先するため不採用
- Apple のマガジンレイアウト余白 — EMR 3 ペインを優先するため不採用

### 2.3 不変条件（Invariants）

実装中常に守ること:

- **絶対原則** ([`docs/DESIGN_GUIDELINES.md`](DESIGN_GUIDELINES.md) セクション 0): モダン SaaS 志向 / 多色禁止 / プライマリ 1 色
- **ADR 0002 互換**: StyleSeed Notion skin の **token 名は維持し、値だけ差し替える**（`/ss-review` 等のスキル互換性のため）
- **`vendor/dads/` は手を入れない**: 旧デジタル庁系コンポーネント。ADR 0001 で離脱済み、新規では使用しない方針。Phase 4 の hex 置換でも対象外（後続 PR で削除予定）
- **`.dark` ブロックは Phase 1〜5 では触らない**: ダークモードの Apple HIG 化は別 ADR を切ってから

---

## 3. Phase 1: ネットワークフォント排除

### 3.1 Goal

Google Fonts のロード（`Inter`, `Noto Sans JP`, `Noto Sans Mono`）を全削除し、Apple HIG のシステムフォントスタックに切り替える。EMR の運用環境（クリニック内ネットワーク）でネット通信に依存しない設計にする。

### 3.2 Pre-flight checks

- [ ] [`frontend/CLAUDE.md`](../frontend/CLAUDE.md) を通読した
- [ ] [`docs/decisions/0003-color-system-apple-hig.md`](decisions/0003-color-system-apple-hig.md) のフォントスタック節を読んだ
- [ ] `frontend/` で `npm run dev` が起動することを確認した（ベースライン）

### 3.3 Files to modify

| ファイル | 操作 |
|---|---|
| [`frontend/src/styles/fonts.css`](../frontend/src/styles/fonts.css) | 全面書き換え |
| [`frontend/index.html`](../frontend/index.html) | `<link>` 4 行削除 |

### 3.4 Concrete changes

#### 3.4.1 `frontend/src/styles/fonts.css`

**Before:**
```css
/* Manta フォント設定 (StyleSeed の fonts.css をベースに JP 対応に変更) */
/* Inter: 英数字のデフォルト */
/* Noto Sans JP: 日本語の可読性を確保 */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');

body {
  font-family: 'Inter', 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

**After:**
```css
/* Manta フォント設定: Apple HIG (apple.com/jp) 準拠のシステムフォントスタック
 * 根拠: docs/decisions/0003-color-system-apple-hig.md
 *
 * - SF Pro JP: macOS / iOS 同梱 (Apple 端末で最優先)
 * - ヒラギノ角ゴ Pro: macOS フォールバック (注: ProN ではなく Pro)
 * - メイリオ / Meiryo: Windows フォールバック
 * - -apple-system / system-ui: 各 OS の標準
 *
 * ネットワーク取得は行わない (@import / @font-face / <link> 不使用)。
 * Linux / Android では system sans-serif にフォールバック。
 */

body {
  font-family:
    "SF Pro JP", "SF Pro Text", "SF Pro Icons",
    "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3",
    メイリオ, Meiryo, "ＭＳ Ｐゴシック",
    -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: normal; /* palt 不使用: SF Pro JP に内蔵 */
}
```

#### 3.4.2 `frontend/index.html`

**Before** (lines 7-12):
```html
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Noto+Sans+Mono:wght@400;700&display=swap"
      rel="stylesheet"
    />
```

**After:** （上記 4 行を完全に削除）

`<head>` セクションは以下のように `<title>Manta</title>` の直後に `<body>` が来る形になる:

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manta</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### 3.5 Verification

実装後に以下をすべて ✅:

- [ ] `npm run dev` が成功し、エラーなくロードされる
- [ ] DevTools の Network タブで `fonts.googleapis.com` / `fonts.gstatic.com` へのリクエストが**0 件**
- [ ] Mac で開いた場合、本文が SF Pro JP（または ヒラギノ角ゴ Pro）で表示される（DevTools → Computed → font-family で確認）
- [ ] 受付画面・カルテ画面の主要見え方が崩れていない（フォントメトリクスが変わるので軽微な違いはOK、レイアウト崩壊は NG）
- [ ] `npm run build` が成功

### 3.6 Commit / PR

**Branch**: `chore/remove-google-fonts`

**Commit message** (本リポジトリの慣例: 日本語 + Conventional Commits):
```
chore(frontend): Google Fonts を排除しシステムフォント onlyに切替

- fonts.css の @import (Inter, Noto Sans JP) を削除
- index.html の <link> / preconnect を削除
- Apple HIG 準拠のフォントスタック (SF Pro JP 先頭) を fonts.css に設定

ネットワーク依存を排除しオフラインクリニック環境でも動作する設計に。
根拠: docs/decisions/0003-color-system-apple-hig.md
```

**PR title**: `chore(frontend): Google Fonts を排除してシステムフォント onlyに`

**PR body** にはこの計画書 (Phase 1) と ADR 0003 へのリンクを含める。

### 3.7 Gotchas

- `index.html` に既に `<link>` がない場合 → 既に削除済み。skip
- ヒラギノ角ゴは **Pro**（**ProN ではない**） — Apple JP サイト準拠。ProN を書き加えない
- `-webkit-font-smoothing` と `-moz-osx-font-smoothing` は維持（既存と同じ）
- フォントスタックの中に `'Inter'` や `'Noto Sans JP'` を残さない（あった場合は完全削除）
- `seed-index.css` も `fonts.css` を import しているが、`fonts.css` が更新されれば自動的に追従するため変更不要

---

## 4. Phase 2: カラートークン置換

### 4.1 Goal

[`frontend/src/styles/theme.css`](../frontend/src/styles/theme.css) の `:root` 内のカラートークン値を Apple HIG (apple.com/jp 実測値) に置き換える。token 名は維持し、値のみ差し替えることで StyleSeed Notion skin との互換性（`/ss-review` 等）を保つ。

### 4.2 Pre-flight checks

- [ ] Phase 1 が承認・マージ済み
- [ ] [`docs/decisions/0003-color-system-apple-hig.md`](decisions/0003-color-system-apple-hig.md) の「色味の具体値」表を熟読した
- [ ] [`docs/mock-html/color-palettes.html`](mock-html/color-palettes.html) を実機ブラウザで開き、A. Apple HIG の見え方を体感した

### 4.3 Files to modify

| ファイル | 操作 |
|---|---|
| [`frontend/src/styles/theme.css`](../frontend/src/styles/theme.css) | `:root` 内（lines 3-100 付近）のトークン値置換 + 新トークン追加 |

`.dark` ブロック (lines 102-171) は **触らない**（別 PR）。
`@theme inline` ブロック (lines 173-229) も基本触らない。新トークン追加時は対応する `--color-*` エイリアスを追加する。

### 4.4 Concrete changes

#### 4.4.1 既存トークンの値置換

`:root` ブロック内で以下を置換:

```css
/* === CUSTOMIZE: Brand Colors === */
--brand: #0071e3;             /* Apple CTA Blue (旧: #0075de) */
--primary: #1d1d1f;            /* Apple Near Black (旧: rgba(0,0,0,0.95)) */
--primary-foreground: #ffffff;

/* === Surface & Background === */
--background: #f5f5f7;         /* Apple セクション背景 (旧: #ffffff) */
--foreground: #1d1d1f;         /* Apple Near Black (旧: rgba(0,0,0,0.95)) */
--card: #ffffff;               /* 維持 */
--card-foreground: #1d1d1f;    /* 旧: rgba(0,0,0,0.95) */
--popover: #ffffff;            /* 維持 */
--popover-foreground: #1d1d1f; /* 旧: rgba(0,0,0,0.95) */

/* === Secondary & Muted === */
--secondary: #f5f5f7;          /* 旧: #f6f5f4 */
--secondary-foreground: #1d1d1f; /* 旧: #31302e */
--muted: #e8e5e1;              /* 維持（暫定、Phase 4 で見直し可） */
--muted-foreground: rgba(29,29,31,0.72); /* 旧: #615d59 */
--accent: #f5f5f7;             /* 旧: #f6f5f4 */
--accent-foreground: #1d1d1f;  /* 旧: #31302e */

/* === Status Colors === */
--destructive: #FF3B30;        /* iOS System Red (旧: #dd5b00) */
--destructive-foreground: #ffffff;
--success: #34C759;            /* iOS System Green (旧: #2a9d99) */
--success-foreground: #ffffff;
--warning: #FF9500;            /* iOS System Orange (旧: #dd5b00) → destructive と分離 */
--warning-foreground: #ffffff;
--info: #0071e3;               /* Apple CTA Blue (旧: #0075de) */
--info-foreground: #ffffff;

/* === Text Hierarchy === */
--text-primary: #1d1d1f;                  /* Apple Near Black (旧: rgba(0,0,0,0.95)) */
--text-secondary: rgba(29,29,31,0.72);    /* 旧: #615d59 */
--text-tertiary: #6e6e73;                 /* Apple Glyph Gray Secondary (旧: #a39e98) */
--text-disabled: #c4c0bb;                 /* 維持 */
--icon-default: rgba(29,29,31,0.72);      /* 旧: #615d59 */

/* === Surface Colors === */
--surface-page: #f5f5f7;       /* 旧: #ffffff */
--surface-subtle: #f5f5f7;     /* 旧: #f6f5f4 */
--surface-muted: #e8e5e1;      /* 維持 */
--brand-tint: #e8f1fc;         /* Apple Blue 透過 (旧: #f2f9ff) */
--alert-badge: #FF3B30;        /* iOS System Red (旧: #dd5b00) */

/* === Borders & Inputs === */
--border: #D2D2D7;             /* Apple 標準境界 (旧: rgba(0,0,0,0.1)) */
--input: transparent;          /* 維持 */
--input-background: #f5f5f7;   /* 旧: #f6f5f4 */
--switch-background: #c4c0bb;  /* 維持 */
```

#### 4.4.2 新トークンを追加

`:root` 内、Borders & Inputs ブロックの直後に追加:

```css
/* === Apple HIG 追加トークン === */
--brand-hover: #0066cc;                    /* Apple Link Blue (CTA hover, 本文中リンク) */
--brand-focus-ring: rgba(0,113,227,0.2);  /* フォーカスリング (3px 透過) */
--border-strong: #BCBCC2;                  /* hover/active 強調境界 */
--warning-bg: #FFF4E5;                     /* 警告バッジ背景 */
--destructive-bg: #FFE5E3;                 /* エラー背景 */
--success-bg: #E5F8EA;                     /* 正常背景（使う場面は限定的） */
```

#### 4.4.3 Focus Ring トークンも更新

```css
/* === Focus Ring === */
--ring: #0071e3;  /* 旧: #097fe8 */
```

#### 4.4.4 Chart Colors も Apple iOS System に揃える

```css
/* === Chart Colors === */
--chart-1: #0071e3;  /* Apple CTA Blue (旧: #0075de) */
--chart-2: #34C759;  /* iOS Green (旧: #2a9d99) */
--chart-3: #AF52DE;  /* iOS Purple (旧: #ff64c8) */
--chart-4: #FF9500;  /* iOS Orange (旧: #dd5b00) */
--chart-5: #5856D6;  /* iOS Indigo (旧: #213183) */
```

#### 4.4.5 Sidebar も追従

```css
/* === Sidebar === */
--sidebar: #f5f5f7;                       /* 旧: #f6f5f4 */
--sidebar-foreground: #1d1d1f;            /* 旧: rgba(0,0,0,0.95) */
--sidebar-primary: #0071e3;               /* 旧: #0075de */
--sidebar-primary-foreground: #ffffff;
--sidebar-accent: #e8e5e1;                /* 維持 */
--sidebar-accent-foreground: #1d1d1f;     /* 旧: #31302e */
--sidebar-border: #D2D2D7;                /* 旧: rgba(0,0,0,0.1) */
--sidebar-ring: #0071e3;                  /* 旧: #097fe8 */
```

#### 4.4.6 `@theme inline` ブロックに新トークンエイリアスを追加

`@theme inline` 内、`--color-border: var(--border);` の直後あたりに追加:

```css
--color-brand-hover: var(--brand-hover);
--color-border-strong: var(--border-strong);
--color-warning-bg: var(--warning-bg);
--color-destructive-bg: var(--destructive-bg);
--color-success-bg: var(--success-bg);
```

これで Tailwind v4 で `bg-warning-bg` `text-brand-hover` 等が使えるようになる。

### 4.5 Verification

- [ ] `npm run dev` が起動し、コンパイルエラーなし
- [ ] 受付画面の見た目が Apple HIG 風（暖オフ白背景、青アクセントは `#0071e3`）になっている
- [ ] カルテ画面でアクセント色が新しい青になっている
- [ ] 警告タグ（造影剤副反応歴等）と緊急色（異常検査等）が **異なる色** になっている（旧: 同色 #dd5b00 → 新: warning #FF9500 / destructive #FF3B30）
- [ ] [`docs/mock-html/color-palettes.html`](mock-html/color-palettes.html) の A. Apple HIG とおおむね一致した見た目
- [ ] `.dark` ブロックは未変更（git diff で確認）
- [ ] `npm run build` が成功

### 4.6 Commit / PR

**Branch**: `feat/apple-hig-color-tokens`

**Commit message**:
```
feat(frontend): カラートークンを Apple HIG (apple.com/jp) に置換

- :root 内のトークン値を Apple HIG 実測値に差し替え
  - --brand: #0075de → #0071e3 (Apple CTA Blue)
  - --background: #ffffff → #f5f5f7 (Apple セクション背景)
  - --text-primary: rgba(0,0,0,0.95) → #1d1d1f (Apple Near Black)
  - --warning: #dd5b00 → #FF9500 (iOS System Orange、destructive と分離)
  - --destructive: #dd5b00 → #FF3B30 (iOS System Red)
  - --success: #2a9d99 → #34C759 (iOS System Green)
- 新トークン追加: --brand-hover, --brand-focus-ring, --border-strong,
  --warning-bg, --destructive-bg, --success-bg
- @theme inline に対応するエイリアスを追加
- .dark ブロックは未変更 (別 PR)

根拠: docs/decisions/0003-color-system-apple-hig.md
```

### 4.7 Gotchas

- **token 名は変えない**: `--brand`, `--text-primary` 等の名前は維持。値だけ差し替える（StyleSeed `/ss-review` 互換性）
- **`.dark` ブロックは触らない**: ダークモード値はそのまま。touched と勘違いされないよう、git diff を必ず確認
- **`#FFFFFF` と `#ffffff` の表記揺れ**: 既存ファイルは小文字。新規追加分も小文字に統一推奨
- **Tailwind v4 の `@theme inline`**: 新しい token を追加したら必ず `@theme inline` 内にエイリアスを追加（さもないと `bg-warning-bg` 等が使えない）
- **`--secondary`, `--accent` の役割**: shadcn/ui 由来の標準 token。Apple HIG では明確な対応がないので、`#f5f5f7` （セクション背景と同色）に揃える
- **見た目崩壊時の調査**: アクセント色が広く使われている場所（選択中タブ・選択中カード等）が一気に変わる。崩壊ではなく仕様通りなので焦らない

---

## 5. Phase 3: タイポ規則適用

### 5.1 Goal

本文に Apple JP 流の **負のトラッキング** (`letter-spacing: -0.012em`) と OpenType 設定 (`font-feature-settings: normal`) を適用する。Phase 1 で `font-feature-settings: normal` は既に `body` に入っているので、letter-spacing 追加と細則の調整が中心。

### 5.2 Pre-flight checks

- [ ] Phase 1, 2 が承認・マージ済み
- [ ] [`docs/decisions/0003-color-system-apple-hig.md`](decisions/0003-color-system-apple-hig.md) の「タイポグラフィ規則」節を読んだ
- [ ] [`docs/design-reference/apple-jp-design.md`](design-reference/apple-jp-design.md) のセクション 3.5「行間・字間」を読んだ

### 5.3 Files to modify

| ファイル | 操作 |
|---|---|
| [`frontend/src/styles/base.css`](../frontend/src/styles/base.css) | `body` セレクタに letter-spacing 追加 + 大見出し / キャプション細則を追加 |

`fonts.css` は Phase 1 で対応済みなので変更しない。

### 5.4 Concrete changes

[`frontend/src/styles/base.css`](../frontend/src/styles/base.css) を開き、`body` セレクタを探す（`base.css` 全体は 124 行）。`body` ルールに以下を追加:

```css
body {
  /* 既存の background / color 等は維持 */
  letter-spacing: -0.012em; /* Apple JP 流の負トラッキング */
}
```

その下に、大見出しとキャプションの細則を追加:

```css
/* Apple JP 仕様: サイズ別 letter-spacing
 * 根拠: docs/design-reference/apple-jp-design.md セクション 3.5
 * - 14px 以下のキャプションは normal
 * - 24px 以上の大見出しはやや強める
 */
:where(.text-xs, .text-sm, [class*="text-[1"], [class*="text-[12"], [class*="text-[13"]) {
  letter-spacing: normal;
}

:where(h1, h2, .text-2xl, .text-3xl, .text-4xl, .text-5xl) {
  letter-spacing: -0.015em;
}
```

> 注: 既存の `base.css` の構成によっては別の書き方が適切な場合がある。必ず先に `base.css` 全体を読んで、コンフリクトしない位置に追加すること。

### 5.5 Verification

- [ ] `npm run dev` が起動
- [ ] DevTools の Computed タブで body の `letter-spacing` が `-0.012em` (≈ -0.17px @ 14px) になっている
- [ ] 本文の字詰まりが**わずかに**詰まって見える（過度に詰まりすぎない）
- [ ] 14px 以下のキャプション（受診歴の日付等）は normal のまま
- [ ] h1 / h2 がやや締まった見た目
- [ ] フォールバックフォント時（メイリオ等）でも壊れていない

### 5.6 Commit / PR

**Branch**: `feat/apple-jp-typography`

**Commit message**:
```
feat(frontend): Apple JP 仕様の letter-spacing を適用

- body に letter-spacing: -0.012em (負トラッキング)
- 14px 以下キャプションは letter-spacing: normal
- 大見出し (h1, h2, text-2xl 以上) は letter-spacing: -0.015em
- font-feature-settings は既に Phase 1 で normal 化済み

根拠: docs/decisions/0003-color-system-apple-hig.md
       docs/design-reference/apple-jp-design.md セクション 3.5
```

### 5.7 Gotchas

- **メイリオ等フォールバック時の見え方**: `-0.012em` はメイリオでは詰まりすぎる懸念がある。実機で Win 環境（または Win 風レンダリング）で確認できれば理想。怪しいときは `-0.008em` まで弱めても可
- **`em` 単位**: `px` ではなく `em` を使う（フォントサイズに比例して増減）
- **コンポーネント単位の letter-spacing 上書きには触らない**: 例えば `tracking-[0.05em]` をボタン等で使っている場合、それは Tailwind utility なのでこちらより優先される。問題ない
- **`font-feature-settings: normal`** の確認: Phase 1 で `body` に入れたかを再確認。入っていなければここで追加

---

## 6. Phase 4: 直接 hex 参照の置換

### 6.1 Goal

コンポーネント内のハードコード hex 値を token 参照（`bg-*` 等）に置き換える。Phase 2 でトークンを置換しても、ハードコード hex はそのまま残るため、デザインの一貫性が崩れる。

### 6.2 Pre-flight checks

- [ ] Phase 1, 2, 3 が承認・マージ済み
- [ ] 以下のコマンドで hex 参照箇所を確認:
  ```bash
  grep -rnE "#[0-9a-fA-F]{3,8}\b" frontend/src/components/ frontend/src/icons/ 2>/dev/null
  ```

### 6.3 Files to modify (2026-04-30 時点の調査結果)

調査時点で以下 3 箇所:

| ファイル | 行 | 現状値 | 用途 |
|---|---|---|---|
| `frontend/src/components/ui/button.tsx` | 17 | `#2A2A2A` `#3C3C3C` `#E0E0E0` `#121212` `#C0C0C0` | primary variant の active/dark |
| `frontend/src/components/ui/button.tsx` | 20 | `#F3F4F5` `#EAEBEC` `#2B2E35` `#393D46` | secondary variant |
| `frontend/src/components/patterns/donut-chart-card.tsx` | 44 | `["#D4D4D4", "#A8A8A8", "#8B8B8B", "#6B6B6B"]` | グレースケール配列 |

> 注: 着手時に再度 grep し直すこと（このリストは 2026-04-30 時点）。

### 6.4 Concrete changes

#### 6.4.1 `frontend/src/components/ui/button.tsx`

該当行を読み、対応する Apple HIG 値の token に置換。例:

- `bg-[#2A2A2A]` → `bg-primary` (`--primary` = `#1d1d1f` に近い)
- `active:bg-[#3C3C3C]` → `active:bg-foreground` または独自 token を新設
- `bg-[#F3F4F5]` → `bg-surface-subtle` (`--surface-subtle` = `#f5f5f7`)
- `active:bg-[#EAEBEC]` → `active:bg-muted` 等

実際のマッピングはコード文脈を読んで判断。**置換前に既存の見た目を Phase 2 適用後でスクリーンショット保存**しておき、置換後に diff を比較する。

#### 6.4.2 `frontend/src/components/patterns/donut-chart-card.tsx`

```ts
const grayColors = ["#D4D4D4", "#A8A8A8", "#8B8B8B", "#6B6B6B"]
```

これは StyleSeed のドーナツチャート pattern に由来するグレースケール配列。Apple HIG ではセカンダリグリフ `#6e6e73` を中心としたスケールに揃える。例:

```ts
const grayColors = ["#d2d2d7", "#a1a1a6", "#86868b", "#6e6e73"]
```

ただしドーナツチャートが現状使われていない場合（カルテ画面では未使用）、このパターンファイル自体を削除候補にしてもよい。**現在の使用箇所を `grep -rn "donut-chart-card"` で確認**し、未使用なら別 PR で削除。

### 6.5 Verification

- [ ] 上記 grep が **0 件** になる（ハードコード hex がコンポーネントから消えた）
- [ ] Button の primary / secondary variant が見た目崩壊していない（押下時の色変化も確認）
- [ ] DonutChartCard を使っている箇所があれば確認、なければスキップ
- [ ] `npm run dev` / `npm run build` 成功

### 6.6 Commit / PR

**Branch**: `refactor/replace-hardcoded-hex`

**Commit message**:
```
refactor(frontend): ハードコード hex を token 参照に置換

- ui/button.tsx の bg-[#XXX] / active:bg-[#XXX] を token 参照に
- patterns/donut-chart-card.tsx のグレースケール配列を Apple HIG 寄りに調整
- 未使用 pattern は別 PR で削除予定

これで色の一貫性が theme.css 経由で完全に管理可能に。
根拠: docs/decisions/0003-color-system-apple-hig.md
```

### 6.7 Gotchas

- **`vendor/dads/` は対象外**: 旧デジタル庁系コンポーネント。後続 PR で削除予定なので Phase 4 では触らない
- **rgba() 表記の hex 風文字列に注意**: `rgba(255, 255, 255, 0.92)` 等は `#XXX` に該当しないので grep に引っかからない。それは現状維持で OK
- **token に対応するものがない hex**: 例えば `#2A2A2A` のような中間グレーは Apple HIG token に明確な対応がない。その場合は (a) 既存 token に寄せる、(b) 新 token を追加、のどちらかを判断。Phase 4 で迷ったら **既存 token に寄せる** を優先（新 token 追加は次フェーズに繰り越せる）
- **置換前のスクリーンショット**: ボタン variant は active 状態の見た目がレビューで議論になりやすい。事前確保推奨

---

## 7. Phase 5: ボタンピル型化

### 7.1 Goal

[`frontend/src/components/ui/button.tsx`](../frontend/src/components/ui/button.tsx) の primary / outline variant を完全ピル型 (`border-radius: 980px` 相当) に変更する。Apple HIG の CTA 表現に合わせる。

### 7.2 Pre-flight checks

- [ ] Phase 1, 2, 3, 4 が承認・マージ済み
- [ ] [`docs/decisions/0003-color-system-apple-hig.md`](decisions/0003-color-system-apple-hig.md) の「ボタン形状」節を読んだ
- [ ] [`frontend/src/components/ui/button.tsx`](../frontend/src/components/ui/button.tsx) の現状の cva variants を把握した

### 7.3 Files to modify

| ファイル | 操作 |
|---|---|
| [`frontend/src/components/ui/button.tsx`](../frontend/src/components/ui/button.tsx) | primary / outline variant に `rounded-full` を追加（または独自 `rounded-pill` を導入） |

### 7.4 Concrete changes

#### 7.4.1 cva variants にピル型を反映

例（既存コードを読んでから適切に修正）:

```tsx
// 旧
default: "bg-primary text-primary-foreground rounded-md ..."
outline: "border border-input bg-background rounded-md ..."

// 新
default: "bg-primary text-primary-foreground rounded-full ..."  // ピル型
outline: "border border-input bg-background rounded-full ..."   // ピル型
```

Tailwind の `rounded-full` は `border-radius: 9999px` で、コンポーネントが横長なら実質ピル型になる。

`destructive` (破壊的操作) と `secondary` / `ghost` は **角丸 `rounded-md` のまま維持**:

- destructive: `rounded-md` (Apple Dark Fill 風: 角丸 8px)
- secondary: `rounded-md`
- ghost: `rounded-md`

#### 7.4.2 フォーカスリング

ピル型ボタンは Apple HIG ではフォーカスリングが透過 3px。既存の `focus-visible:ring-2 focus-visible:ring-ring` の `ring-offset-*` を調整:

```tsx
"focus-visible:ring-[3px] focus-visible:ring-[var(--brand-focus-ring)] focus-visible:ring-offset-0"
```

### 7.5 Verification

- [ ] Primary CTA（保存・診察終了等）が完全ピル型に
- [ ] Outline CTA も完全ピル型に
- [ ] Destructive ボタンは角丸 8px のまま
- [ ] フォーカス時に `rgba(0,113,227,0.2)` の透過リングが出る
- [ ] Hover 時の色が `#0066cc` (Apple Link Blue) に変わる（`--brand-hover` 適用）
- [ ] Button の `size` variant (sm / md / lg) で水平 padding が十分にある（ピル型は `px-4` 以上推奨）
- [ ] `npm run dev` / `npm run build` 成功

### 7.6 Commit / PR

**Branch**: `feat/apple-pill-buttons`

**Commit message**:
```
feat(frontend): Primary / Outline ボタンを Apple HIG 完全ピル型に

- button.tsx の default / outline variant を rounded-full に
- destructive / secondary / ghost は rounded-md 維持
- フォーカスリングを透過 3px に変更 (--brand-focus-ring)
- hover 時の色を --brand-hover (#0066cc) に

根拠: docs/decisions/0003-color-system-apple-hig.md
       docs/design-reference/apple-jp-design.md セクション 4
```

### 7.7 Gotchas

- **アイコンのみのボタン (`size="icon"`)**: ピル型にすると円になる。それで OK（Apple HIG 通り）
- **横幅が小さいボタン**: テキストが短すぎる場合（例: 「OK」「✓」のみ）、ピル型がほぼ円になる。問題ないが、視覚的にバランスを見て margin/padding を調整可
- **既存の `rounded-md` 利用箇所**: button 以外（カード・モーダル等）の `rounded-md` は変更しない。ボタンだけ
- **shadcn/ui の `Button` props**: `asChild` パターンを使っている箇所がある（Radix Slot）。`rounded-*` クラスが正しく渡るか確認

---

## 8. Phase 6: カルテ UI 構造変更（別計画書化）

### 8.1 概要のみ

本フェーズは規模が大きく（複数 PR、複数日）、本計画書のスコープ外とする。**着手前に別途 ADR と詳細計画書を起票すること**。

含まれる内容（[`docs/DESIGN_REVIEW_KARTE_UX.md`](DESIGN_REVIEW_KARTE_UX.md) の決定事項①〜⑥より）:

- ① / ② カルテ画面専用の上部 7 タブ（履歴 / カレンダー / 検査 / 画像 / 文書 / 予約 / 検索）
- ③ / ④ 中央ペインのデフォルトを「履歴ビュー」に変更し、「+ 本日の記載」ボタンで TodayChartBlock を展開
- ⑤ 右ペインを 4 タブ（処方/検査/画像/処置）から「本日のキュー」+「+追加」モーダルに変更
- ⑥a / ⑥b 左ペインにミニカレンダー常設、上部タブで月グリッドフルビュー、多色ドット + フィルタ

### 8.2 Phase 6 着手前にやること

1. **本計画書（Phase 1〜5）の全完了を確認**
2. **新 ADR 起票**: `docs/decisions/0004-chart-ui-restructure.md`（仮）
3. **詳細計画書起票**: `docs/IMPLEMENTATION_PLAN_CHART_RESTRUCTURE.md`（仮）
4. **タスク分解**: `ChartWorkspace.tsx` 周辺は 3791 行の巨大コンポーネント。分割設計が前提

### 8.3 関連メモリ（自動ロードされる）

- `feedback_karte_create_is_action.md`: 「カルテ作成は能動的アクション」原則
- 中央ペイン展開方式（モーダルではなく上部展開）を採用

---

## 9. 共通ルール

### 9.1 ブランチ命名

| Phase | Branch | Prefix |
|---|---|---|
| 1 | `chore/remove-google-fonts` | chore |
| 2 | `feat/apple-hig-color-tokens` | feat |
| 3 | `feat/apple-jp-typography` | feat |
| 4 | `refactor/replace-hardcoded-hex` | refactor |
| 5 | `feat/apple-pill-buttons` | feat |

### 9.2 コミットメッセージ規約

- Conventional Commits (`feat`, `fix`, `chore`, `refactor`, `docs`)
- スコープは `frontend` 推奨（バックエンド変更がないため）
- 本文は **日本語**（プロジェクト慣例）
- 末尾に **根拠 ADR / ドキュメントへの参照** を必ず入れる
- 末尾に Co-Authored-By:Claude Opus 4.7 (1M context) <noreply@anthropic.com>を入れる

### 9.3 PR 作成

- **自走でpush しない**。必ずユーザーに diff を見せて承認を取ってから push
- PR title はコミットメッセージの 1 行目と同じでよい
- PR body には:
  - 該当する Phase 番号と本計画書へのリンク
  - 関連 ADR (0003)
  - Verification チェックリスト
  - スクリーンショット（特に Phase 2, 4, 5）
- ベースブランチ: `main`

### 9.4 動作確認

- `npm run dev` で localhost:5173 起動 → Mac で Safari + Chrome で確認推奨
- `npm run build` を必ず通す
- `npm run typecheck` (もしくは `tsc --noEmit`) を通す
- 受付画面 → 患者選択 → カルテ画面の主要動線を踏む
- DevTools の Network タブで Google Fonts への通信が出ていないことを確認（Phase 1 後）

### 9.5 ロールバック方針

各フェーズは **1 PR 完結** にすることで、問題が出たら revert で巻き戻せる。Phase 2 の色変更でデザインが破綻した場合も、PR 単位でリバート → 個別ファイル修正のみ追加 PR で対応する流れ。

### 9.6 ユーザーとの同期ポイント

各フェーズ完了時:

1. **diff を要約**して提示
2. **スクリーンショット**（変更前 / 変更後）を提示（できれば）
3. **Verification チェックリスト**の結果を提示
4. **承認待ち** — 承認後に push & PR 作成
5. PR マージ後、次フェーズの Pre-flight checks を確認してから着手

---

## 10. 進捗トラッカー

着手したエージェントは以下に進捗を書き込みながら進める。

| Phase | Status | Branch | PR | Mergeed Date |
|---|---|---|---|---|
| 1. ネットフォント排除 | ✅ Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |
| 2. カラートークン置換 | ✅ Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |
| 3. タイポ規則適用 | ✅ Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |
| 4. 直接 hex 参照置換 | ✅ Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |
| 5. ボタンピル型化 | ✅ Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |
| 6. UI 構造変更 | ✅ Initial Done | `codex/ui-refresh-apple-hig` | — | 2026-05-01 |

Status: `⬜ Not Started` / `🟨 In Progress` / `🟦 PR Open` / `✅ Merged` / `🚫 Blocked`

---

## 11. 参考資料リンク集（再掲）

### ADR
- [0001 デジタル庁デザインシステム参照と離脱の経緯](decisions/0001-design-system-digital-cho-and-pivot.md)
- [0002 styleseed 採用・Notion skin 単独構成・Tailwind v4 同時移行](decisions/0002-styleseed-adoption.md)
- [0003 Apple HIG (apple.com/jp) 準拠のカラーシステム採用](decisions/0003-color-system-apple-hig.md) ← **本計画書の根拠**

### 設計レビュー / 仕様書
- [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) — 絶対原則
- [DESIGN_REVIEW_KARTE_UX.md](DESIGN_REVIEW_KARTE_UX.md) — 2026-04-30 決定事項
- [design-reference/apple-jp-design.md](design-reference/apple-jp-design.md) — Apple JP 実測仕様
- [mock-html/color-palettes.html](mock-html/color-palettes.html) — 比較モック（A. Apple HIG 採用）
- [frontend/CLAUDE.md](../frontend/CLAUDE.md) — Manta フロントエンド設計ルール

### ソースファイル
- [frontend/src/styles/theme.css](../frontend/src/styles/theme.css) — Phase 2 のメイン編集対象
- [frontend/src/styles/fonts.css](../frontend/src/styles/fonts.css) — Phase 1 編集対象
- [frontend/src/styles/base.css](../frontend/src/styles/base.css) — Phase 3 編集対象
- [frontend/index.html](../frontend/index.html) — Phase 1 編集対象
- [frontend/src/components/ui/button.tsx](../frontend/src/components/ui/button.tsx) — Phase 4, 5 編集対象

### 外部
- [awesome-design-md-jp / apple/DESIGN.md](https://github.com/kzhrknt/awesome-design-md-jp/blob/main/design-md/apple/DESIGN.md) — Apple JP 仕様書の出典

---

## 12. 質問が出た場合

本計画書で曖昧な箇所が出た場合の優先順位:

1. **ADR 0003** に書かれていればそれに従う
2. **DESIGN_REVIEW_KARTE_UX.md** に書かれていればそれに従う
3. **apple-jp-design.md**（実測仕様書）に書かれていればそれに従う
4. それでも不明なら **ユーザーに確認**（推測で進めない）

特に判断分岐が出やすい箇所:
- 既存 token に対応する Apple HIG 値がない場合の扱い
- メイリオフォールバック時の letter-spacing
- ピル型ボタンの size variant ごとの padding 量

これらは「迷ったらユーザーに聞く」を徹底すること。
