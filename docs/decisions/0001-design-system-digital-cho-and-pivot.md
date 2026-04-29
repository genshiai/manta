# 0001. デジタル庁デザインシステム参照と離脱の経緯

- **Status**: Superseded by [0002](0002-styleseed-adoption.md)
- **Date**: 2026-04-29（後追い起票）
- **Deciders**: Daichi Nagashima
- **Tags**: design-system, frontend

## Context（なぜこの決定が必要か）

Manta フロントエンドの初期段階で、UI デザインの参照元として以下の 3 つを挙げた:

1. **デジタル庁デザインシステムβ版**（https://design.digital.go.jp/dads/）
2. **Apple Human Interface Guidelines**
3. **Zenn のデザインアプローチ**

これは [`docs/DESIGN_GUIDELINES.md`](../DESIGN_GUIDELINES.md) の「参照元ガイドライン」セクションに記載されている。デジタル庁デザインシステムを取り入れた背景は、(a) アクセシビリティ要件（WCAG 2.2 AA）を確実に満たすため、(b) 公的医療領域との親和性、(c) JIS X 8341-3:2016 準拠の参照点として、と推察される。

実装層では `docs/design-system/tailwind-theme/` 配下に独自のフォントトークン（`text-std-18B-160` 等の命名規則）が構築され、`frontend/tailwind.config.js` から参照されていた。

## Decision（何を決めたか）

**デジタル庁デザインシステムを実装層の踏み台として使う方針を撤回**し、別の踏み台に乗り換える（後継 ADR [0002](0002-styleseed-adoption.md) で具体化）。

ただし以下は維持:
- アクセシビリティ要件（WCAG 2.2 AA）
- セマンティックカラー 4 色（エラー / 警告 / 成功 / 情報）の例外扱い
- 「North Star = モダン SaaS」という上位原則（[`docs/DESIGN_GUIDELINES.md`](../DESIGN_GUIDELINES.md) のセクション 0）

## Consequences（帰結）

### Positive
- モダン SaaS（Notion / Linear / Vercel / Stripe）の設計言語と直接接続できるツールチェーンに切り替え可能
- 「公的システム由来の設計」と「医師がパワーユーザーとして使うクリニカル SaaS」の方向性ギャップを解消

### Negative
- 既存コード（`ChartWorkspace.tsx` 等 9 コンポーネント）で利用中のトークン（`text-std-*` 系）を全置換する必要が発生
- アクセシビリティ確認は別途、独立した検証プロセスが必要

### Neutral / Trade-offs
- 公的医療領域との「視覚的親和性」は弱まるが、ユーザー（医師）の体感速度・記述効率を優先する判断

## Alternatives Considered（他に検討した選択肢）

- **デジタル庁参照を維持し、UI だけモダン SaaS に寄せる二層構造**: 命名と責務が二重化し中長期で混乱の元と判断（[本ADRのプロジェクトプラン](../../../.claude/plans/peaceful-churning-treehouse.md)で却下）
- **完全自前で設計トークンを再構築**: 工数過大、再発明、69 個の設計ルールを自力で作る合理性なし

## Lessons Learned / 振り返り（後追い記入）

> **TODO（ユーザー本人が記入）**:
>
> デジタル庁デザインシステムを採用してみて、実際に何が良くなかったか・どこで違和感を感じたか・どの場面で「合わない」と判断したかを、本人の言葉で残してください。例:
>
> - コンポーネント粒度が UI 構築用ではなく Web 公文書向けで、SaaS UI を作る粒度と合わなかった
> - カラートークンが多すぎ／少なすぎて Notion ライクな温かい中立色を表現しづらかった
> - タイポグラフィスケールがクリニカル SaaS の情報密度に合わなかった
> - その他...
>
> ここを残しておくと、将来似た選択肢（公的デザインシステム系）を再度検討するときに、同じ轍を踏まないで済む。

## References

- [`docs/DESIGN_GUIDELINES.md`](../DESIGN_GUIDELINES.md): 既存の North Star・参照元ガイドラインが定義されている
- [`docs/design-system/tailwind-theme/`](../design-system/tailwind-theme/): デジタル庁系の流れで構築されたトークン実装
- [ADR 0002](0002-styleseed-adoption.md): 本 ADR を Supersede する後継決定
