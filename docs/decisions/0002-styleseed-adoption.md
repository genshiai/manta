# 0002. styleseed 採用・Notion skin 単独構成・Tailwind v4 同時移行

- **Status**: Accepted
- **Date**: 2026-04-29
- **Deciders**: Daichi Nagashima
- **Tags**: design-system, frontend, tailwind

## Context（なぜこの決定が必要か）

[ADR 0001](0001-design-system-digital-cho-and-pivot.md) で旧来のデジタル庁系設計トークンを離脱する判断をした。後継として「モダン SaaS の設計言語に直接接続できる踏み台」が必要。

並行して、現状のカルテ画面 [`ChartWorkspace.tsx`](../../frontend/src/components/ChartWorkspace.tsx) は **3791 行の単一巨大コンポーネント**となり、UX 上の致命的問題を抱えている:

- 過去カルテ（時系列データ）を**クリック式タブ**で切り替えており、Notion / Linear / Strava 等で標準のスクロール式タイムラインに反する
- 過去カルテで記述本文・薬歴・PMDA・検査結果が**同列**に並び、情報密度が破綻
- 中央タブと右ペインタブの責務分離（WHO / WHAT / DO）が言語化されていない

このカルテ再設計に踏み込むには、まず**設計言語と部品の足場**を固める必要がある。

## Decision（何を決めたか）

1. **[styleseed](https://github.com/bitjaru/styleseed) をフロントエンドの設計言語・コンポーネント基盤として採用**
   - 69 個の設計ルール（`DESIGN-LANGUAGE.md`）
   - 32 個の Radix ベース UI プリミティブ + 16 個のダッシュボードパターン
   - 13 個の Claude Code スキル（`/ss-page`, `/ss-component`, `/ss-review` 等）
2. **Notion skin のみ**を採用（Toss / Stripe / Linear / Vercel は取り込まない）
   - 理由: カルテは本質的に「記録ドキュメント」であり、Notion の Warmth & Approachability 哲学（広い余白・温かい中立色・content-first）と最も整合
   - 将来的に右ペインのオーダーキューを Linear 哲学（Precision & Density）に分けるハイブリッド構成は別 ADR で検討
3. **Tailwind v3 → v4 へ同時移行**
   - styleseed が Tailwind v4 前提のため
   - 既存 `tailwind.config.js` の `theme.extend` が空であり、移行の機械的負担が小さい
4. **既存 `docs/design-system/tailwind-theme` は frontend からの参照を切る（全面置換）**
   - 二層構造（旧トークン + styleseed）を作らない
   - `docs/design-system/` ツリー自体は履歴として保存（削除はしない）

## Consequences（帰結）

### Positive
- DESIGN-LANGUAGE.md の 69 ルールが Claude Code に自動ロードされ、以降の UI 生成・レビューに自動適用される
- Notion / Stripe / Linear 等のブランドスキンへの切替コストがほぼゼロ（後追いで方向転換しやすい）
- Inter フォント・8px グリッド・適切なタイポグラフィスケールが手に入る
- Radix UI + cva + lucide-react の標準的な shadcn 体系に乗ることで、Web の知見・ライブラリエコシステムと接続できる

### Negative
- 既存 9 コンポーネントで使用中の `text-std-*` 系トークンを Notion skin の Tailwind v4 トークンへ機械置換する作業が発生（別 PR）
- Tailwind v4 移行に伴う設定ファイル変更（CSS-first 化）でビルド構成が変わる
- styleseed は外部リポジトリ依存となり、将来的に upstream 変更を取り込むかフォーク管理するか判断が要る

### Neutral / Trade-offs
- 「自前トークン管理」の自由度を捨て、styleseed の規約に乗る
- shadcn / Radix の標準体系に乗ることで、独自最適化の余地は減る（が、それで十分という判断）

## Alternatives Considered（他に検討した選択肢）

- **shadcn/ui を直接導入し、styleseed の DESIGN-LANGUAGE.md だけ参考にする**: 自前で 69 ルールを維持・更新するコスト、スキル群（`/ss-review` 等）が使えない
- **5 種ブランドスキン全部入れて将来切替可能にする**: トークンが一意でなくなり、レビュー時のブレ要因になる。Notion 単独で開始し、必要時に追加する方針に
- **Tailwind v3 のまま styleseed の一部だけ取り込み**: v3 互換のフル機能セットは無く、半端な統合になる
- **Linear skin で開始**: Linear の Precision & Density はカルテ記録本文には密度が高すぎる。記録は Notion、キューは Linear のハイブリッドが最終形

## Lessons Learned / 振り返り（後追い記入）

> 起票時は空欄。styleseed 運用を続けてから、上手く行った点・想定外の摩擦点・Supersede が必要になった理由を埋める。

## References

- [styleseed (GitHub)](https://github.com/bitjaru/styleseed)
- [Notion 公式: Updating the design of Notion pages](https://www.notion.com/blog/updating-the-design-of-notion-pages)
- [LogRocket: Linear design](https://blog.logrocket.com/ux-design/linear-design/)
- 関連プラン: [`.claude/plans/peaceful-churning-treehouse.md`](../../.claude/plans/peaceful-churning-treehouse.md)
- 旧 ADR: [0001](0001-design-system-digital-cho-and-pivot.md)
