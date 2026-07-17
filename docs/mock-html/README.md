# docs/mock-html — UIモック置き場

| ファイル | 状態 | 内容 |
|---|---|---|
| [`karte-b.html`](karte-b.html) | **✅ 現行の正**（2026-07-05） | カルテUI「読む・書く・作業する」確定モック。ブラウザで直接開ける自己完結HTML。5画面（読む/並べる/書く/作業/入院）+ AIサマリー4パターン切替。仕様は [`../KARTE_UI_SPEC.md`](../KARTE_UI_SPEC.md)、決定の経緯は [ADR 0006](../decisions/0006-karte-document-ui.md) |
| [`index.html`](index.html) + [`style.css`](style.css) | ⚠️ 旧・反面教師（2026-04） | Apple HIG ピボット**以前**の旧カルテプロトタイプ。Google Fonts・SOAP多色バッジ等、現ガイドラインの禁止事項を含む。**レイアウト骨格の歴史参照用であり、模写しないこと** |
| [`color-palettes.html`](color-palettes.html) | 📎 意思決定材料（2026-05） | ADR 0003 の配色比較モック（Apple HIG / Notion / Linear / 医療ミューテッドの4案切替）。Apple HIG 採用の根拠 |
| [`workspace-prototype.html`](workspace-prototype.html) | 🧪 **意思決定用**（2026-07-14 拡張） | 業務レール + 「今日の患者」キュー常設 + 外来カルテ・病棟・医事・設定を 1 シェルで検証する操作モック。患者 5 名の切替、記載開始（その場編集）、診察終了→次患者の自動遷移、医事→カルテの横断ジャンプが動く。右下スイッチで**配色（ミューテッド / 現行 Apple）と書体（ゴシック / 等幅）を A/B 比較**できる。受入条件と導線マップは [`../WORKSPACE_UI_PROPOSAL.md`](../WORKSPACE_UI_PROPOSAL.md)・[`../WORKSPACE_UI_FUNCTION_MAP.md`](../WORKSPACE_UI_FUNCTION_MAP.md) |
| [`clinical-workflow-prototype.html`](clinical-workflow-prototype.html) | 🧪 現機能照合用（2026-07-14） | 現行のカルテ文法（一本の時系列、読む・書く・作業する）を短く検証するモック。汎用「要確認」タスクは置かず、詳しい根拠は [`../CLINICAL_MOCK_RESEARCH.md`](../CLINICAL_MOCK_RESEARCH.md)。 |
| [`operations-workspace-prototype.html`](operations-workspace-prototype.html) | 🧪 現機能照合用（2026-07-14） | 外来・病棟・医事・設定を共通シェルで切り替え、各業務の具体的な状態と主作業を検証するモック。 |

## karte-b.html の見方

- 上部セグメントで **読む / 並べる / 書く / 作業 / 入院** の5状態を切替（←→キー対応）
- 「読む」選択時のみ、直下に **AIサマリーの見せ方（A 1行 / B AIOカード / C ブリーフィング / D 対話型）** のサブ切替が出る
- モック内の臨床画面は**ライト基調で固定**（閲覧ページ自体はライト/ダーク両対応）
- 実寸 1440×860 を縮小表示。患者名・患者 ID・数値はすべて架空のデモデータで、実在の人物・医療機関とは関係ない
