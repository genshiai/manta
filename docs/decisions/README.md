# Architecture Decision Records (ADR)

Manta プロジェクトにおける主要な技術的・設計的意思決定の記録。**「なぜそう決めたか」を後から追える状態にする**ことが目的。

## ADR とは

ADR (Architecture Decision Records) は、プロジェクトの重要な意思決定を 1 ファイル 1 決定で時系列に積み上げる軽量フォーマット。後追いで `Status: Superseded by NNNN` のように相互リンクできるため、方針転換（紆余曲折）を含めて自然に記録できる。

実装の「どうやるか」は [`docs/design-system/`](../design-system/) や [`docs/DESIGN_GUIDELINES.md`](../DESIGN_GUIDELINES.md) などに、決定の「なぜ」は本ディレクトリに分離する。

## 命名規則

```
NNNN-kebab-case-title.md
```

- `NNNN`: 4桁ゼロパディングの通し番号（時系列順）
- `kebab-case-title`: 英小文字のケバブケース。短く、検索しやすく

## ステータス

- **Proposed**: 提案中・議論中
- **Accepted**: 採用済・現在有効
- **Superseded by NNNN**: 別の ADR に置き換えられた（リンク必須）
- **Deprecated**: 採用しない方針に変わったが、後継 ADR は無い

## 新しい ADR の作り方

1. [`template.md`](template.md) をコピー
2. 次の通し番号を採番（既存の最大番号 + 1）
3. ファイル名と本文 1 行目のタイトルを揃える
4. 本 README.md の **インデックス** セクションに 1 行追加
5. 既存 ADR を Supersede する場合は、その ADR の Status を更新し、Lessons Learned を埋める

## インデックス

| # | タイトル | Status | Tags |
|---|---|---|---|
| [0001](0001-design-system-digital-cho-and-pivot.md) | デジタル庁デザインシステム参照と離脱の経緯 | Superseded by 0002 | design-system, frontend |
| [0002](0002-styleseed-adoption.md) | styleseed 採用・Notion skin 単独構成・Tailwind v4 同時移行 | Accepted | design-system, frontend, tailwind |
| [0003](0003-color-system-apple-hig.md) | Apple HIG (apple.com/jp) 準拠のカラーシステム採用 | Accepted | design-system, frontend, color-tokens, typography |

## ファイル一覧外（本ディレクトリのメタ）

- [README.md](README.md): 本インデックスとフォーマット説明
- [template.md](template.md): 新規 ADR 用テンプレート
