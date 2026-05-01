# 0003. Apple HIG (apple.com/jp) 準拠のカラーシステム採用

- **Status**: Accepted
- **Date**: 2026-04-30
- **Deciders**: Daichi Nagashima
- **Tags**: design-system, frontend, color-tokens, typography

## Context（なぜこの決定が必要か）

[ADR 0002](0002-styleseed-adoption.md) で StyleSeed + Notion skin を採用し、Tailwind v4 へ移行した。これにより**設計言語と部品の足場**は固まったが、**配色（カラートークン）と日本語タイポグラフィ規則**は具体化されておらず、現状の [`frontend/src/styles/theme.css`](../../frontend/src/styles/theme.css) には以下の問題が残っていた:

1. **アクセント色が彩度高すぎ**: `--brand: #0075de`（純青）は長時間閲覧で目が疲れる
2. **状態色の識別崩壊**: `--warning` と `--destructive` がともに `#dd5b00` で同色 — エラーと警告を区別できない
3. **純白 + 純黒寄り**: 背景 `#ffffff` + 文字 `rgba(0,0,0,0.95)` のコントラストが業務アプリには強すぎる
4. **日本語タイポグラフィ規則が未定義**: フォントスタック・トラッキング・OpenType 機能（`palt`）の方針が無い

ユーザー本人（医師）から 2026-04-30 に明示的フィードバック:
> 「色味は原色系を減らして、SaaS として見やすい形がいい」
> 「Blanc は水色だったが、長く見るのに気持ちがいい色味は何か？Apple とか、Google フラットデザインなど長く見ても疲れないような色味で、モダンな感じで」

これを受けて 4 パターンの比較モック [`docs/mock-html/color-palettes.html`](../mock-html/color-palettes.html) を作成 — A. Apple HIG / B. Notion 調整版 / C. Linear / D. 医療ミューテッド を切替表示できる構成。ユーザー本人が比較し、**A. Apple HIG が高評価**（「APPLE HIG めっちゃいいね」）。

なお Apple HIG の実測値は [`docs/design-reference/apple-jp-design.md`](../design-reference/apple-jp-design.md) に保存済み（apple.com/jp の Puppeteer による computed style 取得値、awesome-design-md-jp 由来）。

## Decision（何を決めたか）

### 1. カラートークンを Apple HIG（apple.com/jp 実測値）に準拠

| 用途 | 旧 | 新（Apple HIG） |
|---|---|---|
| 背景 / `--surface-page` | `#ffffff` | **`#f5f5f7`** |
| カード | `#ffffff` | `#FFFFFF` |
| サブ背景 | `#f6f5f4` | `#f5f5f7` |
| 境界線 | — | `#D2D2D7` |
| 強調境界 | — | `#BCBCC2` |
| 文字主 | `rgba(0,0,0,0.95)` | **`#1d1d1f`**（Apple Near Black、純黒禁止） |
| 文字副 | `#615d59` | `rgba(29,29,31,0.72)` |
| 文字三 | `#a39e98` | `#6e6e73`（Apple Glyph Gray Secondary） |
| アクセント `--brand` | `#0075de` | **`#0071e3`**（Apple CTA Blue） |
| ホバー / リンク | — | `#0066cc`（Apple Link Blue） |
| アクセント透過 `--brand-tint` | `#f2f9ff` | `#e8f1fc` |
| フォーカスリング | — | `0 0 0 3px rgba(0,113,227,0.2)` |
| `--warning` | `#dd5b00` | **`#FF9500`**（iOS System Orange） |
| `--warning-bg` | — | `#FFF4E5` |
| `--destructive` | `#dd5b00` | **`#FF3B30`**（iOS System Red、warning と分離） |
| `--destructive-bg` | — | `#FFE5E3` |
| `--success` | `#2a9d99` | `#34C759`（iOS System Green） |

### 2. 日本語タイポグラフィ規則も Apple JP 準拠

```css
font-family:
  "SF Pro JP", "SF Pro Text", "SF Pro Icons",
  "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro W3",
  メイリオ, Meiryo, "ＭＳ Ｐゴシック",
  -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;

letter-spacing: -0.012em;       /* 本文（負のトラッキング） */
font-feature-settings: normal;  /* palt 不使用（SF Pro JP に内蔵） */
```

注意:
- ヒラギノ角ゴは **Pro**（**ProN ではない**）— Apple JP サイト準拠
- 14px 以下のキャプションは `letter-spacing: normal`
- 大見出し（24px+）は `letter-spacing: -0.015em` までやや強める

### 3. ボタン形状: primary / outline は完全ピル型

- **Primary CTA**: `border-radius: 980px` + Apple Blue 背景 + 白文字 + ホバーで Link Blue
- **Outline**: `border-radius: 980px` + 透明 + Apple Blue 文字 + 1px 境界
- **Dark Fill**（破壊的操作 / モーダル確定）: `border-radius: 8px` + `#1d1d1f` 背景
- **Ghost**: 角丸 6px + 透明 + ホバーで `--surface-subtle`

### 4. Apple HIG を **採用しない** 部分（EMR 向けに調整）

- **フォントサイズ**: Apple の 17px body / 40px heading は採用しない → 14px body / 18-20px heading に圧縮（EMR は情報密度が必要）
- **余白**: Apple のヒーロー幅・マガジンレイアウトは採用しない → 3 ペイン高密度を優先
- 採用するのは **配色・タイポ規則・ボタン形状・フォーカスリング・フォントスタック**

### 5. 規律: アクセント青と状態色は「使う場所を厳しく制限」

iOS System Color（`#FF9500`, `#FF3B30`, `#34C759`, `#0071e3`）は彩度が高い。Apple は**使う場所を厳しく制限**することで長時間閲覧を成立させている。Manta も同じ規律を採用:

- **アクセント青** → CTA・選択中の日付・選択中のカルテ・主要操作・本文中のリンクのみ
- **正常表示には色を使わない**（ノイズ削減、必要な時だけ色が出る）
- **異常検査** → `--destructive` + アイコン併用（色だけに依存しない）
- **警告タグ** → `--warning-bg` + `--warning` 文字（背景色で囲む）
- 装飾目的でアクセント色を散らさない

### 6. ADR 0002 との関係

[ADR 0002](0002-styleseed-adoption.md) は **継続有効**（Superseded ではない）:
- **構造（コンポーネント・ルール群・StyleSeed 69 設計ルール）** は引き続き Notion skin 由来
- **配色のみ** Notion skin の defaults から Apple HIG 実値に置換
- StyleSeed の `/ss-review` 等のスキルが Notion skin の token 名で動くため、token 名は維持し値だけ差し替える

## Consequences（帰結）

### Positive
- 長時間閲覧でも目に優しい配色（純黒禁止 + 暖オフ白背景）
- `--warning` と `--destructive` 分離により識別性改善
- SF Pro JP による日本語表示品質の向上（`palt` 不要）
- iOS / macOS ユーザー（多くの医師）にとって視覚的親近感がある
- 完全ピル型 CTA は Apple 文化に親和的で「主要操作」の存在感が出る
- カラートークンの根拠を実測値（apple.com/jp）に依拠することで、ブレが起きた時に立ち戻れる

### Negative
- 既存 [`frontend/src/styles/theme.css`](../../frontend/src/styles/theme.css) を全面書き換え + コンポーネント内の直接 hex 参照を全て検索・置換（別 PR で実施）
- SF Pro JP は Apple 端末でのみ表示、Windows / Android はフォールバック（ヒラギノ Pro / メイリオ / Noto Sans JP）に頼る
- iOS System Color は彩度が高いため、**使う場所を制限する規律**を全コンポーネントで守らないと意味がない（規律違反のリスク）
- StyleSeed Notion skin の defaults と乖離するため、`/ss-review` 等のスキルが一部 false positive を出す可能性
- `letter-spacing: -0.012em` は他フォントへのフォールバック時に詰まりすぎる懸念 — フォールバック発動時の見え方は実機確認が必要

### Neutral / Trade-offs
- フォントサイズ・余白は EMR 向けに圧縮するため、Apple のマガジンレイアウト的表現力は捨てる
- 将来的に dark mode を追加する場合、Apple JP サイトは dark mode を提供していないため自前定義が必要（iOS の dark mode を参考にすることになる）
- カラートークンの根拠が「Apple JP」に固定されるため、Apple がリブランドした場合は追従コストが発生する

## Alternatives Considered（他に検討した選択肢）

- **B. Notion 調整版**（`#FAFAF9` 暖オフ白 + `#4A7AAF` ミューテッド青 + 状態色彩度ダウン）: 安全で StyleSeed Notion skin と整合するが、Apple HIG ほどの「品位」「規律」が出ない。当初推奨案だったが、ユーザー比較で却下
- **C. Linear**（クールオフ白 + 紫アクセント `#5E6AD2`）: テック感が強すぎ医療現場に不釣り合い、紫は緊急/警告の文脈と衝突
- **D. 医療ミューテッド**（暖オフ白 + スレートティール `#5A7B8B` + セージ）: 独自色が強く Apple / Notion のような参照系がないため、後追いブレが起きやすい
- **A をフル採用**（17px body / 40px heading / マガジンレイアウト余白）: EMR の情報密度が破綻するため、配色とタイポ規則のみ採用、サイズと余白は採用しない
- **デジタル庁色を維持**（`#0075de` + `#dd5b00`）: ADR 0001 で離脱判断済み

## Lessons Learned / 振り返り（後追い記入）

> 起票時は空欄。Apple HIG カラーシステムを実装・運用してから、規律違反が起きた箇所、SF Pro JP フォールバックの実機差、`letter-spacing: -0.012em` の他フォント時の見え方、dark mode 設計時の追加判断などを後追いで記入する。

## References

- 仕様書: [`docs/design-reference/apple-jp-design.md`](../design-reference/apple-jp-design.md)（apple.com/jp の Puppeteer 実測値、awesome-design-md-jp 由来）
- 設計レビュー: [`docs/DESIGN_REVIEW_KARTE_UX.md`](../DESIGN_REVIEW_KARTE_UX.md) 「2026-04-30 決定事項」セクション
- 比較モック: [`docs/mock-html/color-palettes.html`](../mock-html/color-palettes.html)
- 関連 ADR: [0001](0001-design-system-digital-cho-and-pivot.md), [0002](0002-styleseed-adoption.md)
- 出典: [awesome-design-md-jp](https://github.com/kzhrknt/awesome-design-md-jp/blob/main/design-md/apple/DESIGN.md)
