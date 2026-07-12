# docs — Manta ドキュメント索引

Manta の設計ドキュメント・意思決定・計画の入口。**この索引が docs 全体の正本**（`DEVELOPMENT_GUIDELINES.md` 等の個別ツリーより優先）。

> 📌 **git のコミット日は当てにしない。** 2026-07-11 前後に OSS 公開準備（ローカルパス除去・ライセンス統一）でほぼ全ファイルが一括で触られている。鮮度は各行の**状態**列で判断すること。
>
> 状態の凡例：**正本**=その領域の唯一の source of truth ／ **現役**=現在有効 ／ **提案**=未決・議論中 ／ **スナップショット**=ある時点の記録（現状とズレうる）／ **歴史**=`archive/`（当時のまま）

---

## はじめに（なぜ・全体像）

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [why-manta.md](why-manta.md) | 設計思想と技術選定の記録（なぜ医師がゼロから作るか） | 現役 |
| [architecture.html](architecture.html) | アーキテクチャ図（Mermaid）＋ロードマップ。ブラウザで開く | 現役 |
| [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) | 開発指針（設計思想・エンジニアリング・医療ドメイン規則） | 現役 |
| [DESIGN_GUIDELINES.md](DESIGN_GUIDELINES.md) | デザイン詳細（カラー・トークン・絶対原則） | 正本（デザイン） |

## 意思決定（なぜそう決めたか）

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [decisions/](decisions/) | ADR 0001–0007。決定の「なぜ」を1決定1ファイルで時系列に | 正本（意思決定） |

## 計画・現在地

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | PDF 準拠の Wave 実行計画。最新の実装状況はここ | 正本（実装計画） |
| [OSS_RELEASE_STATUS.md](OSS_RELEASE_STATUS.md) | OSS 公開準備の進捗（REL-1..12） | 正本（公開準備） |
| [FHIR_MIGRATION_PLAN.md](FHIR_MIGRATION_PLAN.md) | FHIR R4 / JP Core 移行（Step 0–9） | 現役 |
| [BACKEND_MODULE_RESTRUCTURE_PLAN.md](BACKEND_MODULE_RESTRUCTURE_PLAN.md) | backend モジュール分割方針 | 現役（一部未着手） |
| [MCP_STRATEGY.md](MCP_STRATEGY.md) | MCP 化のフェーズ計画（[ADR 0007](decisions/0007-mcp-agent-interface.md) の詳細） | 現役 |
| [Plan.md](Plan.md) | Phase 0–4 の製品ロードマップ（読み物） | 現役（冒頭ダッシュボードは歴史） |

## 仕様

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [KARTE_UI_SPEC.md](KARTE_UI_SPEC.md) | カルテ UI「読む・書く・作業する」実装仕様（視覚正本は [mock-html/karte-b.html](mock-html/karte-b.html)） | 正本（カルテ） |
| [KARTE_UX_IMPROVEMENTS.md](KARTE_UX_IMPROVEMENTS.md) | 書き込み UX レビュー（コンポーザ配置・確定/追記・書体） | 提案（未決3点） |
| [requirements/PHASE_REQUIREMENTS.md](requirements/PHASE_REQUIREMENTS.md) | Phase 別要件一覧（原本仕様書は私的保管） | 現役 |
| [AUTH_DECISION.md](AUTH_DECISION.md) | FastAPI 自前認証の方針 | 現役（実装済） |

## ドメイン戦略・マスタデータ

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [RECEIPT_GATEWAY_STRATEGY.md](RECEIPT_GATEWAY_STRATEGY.md) | Manta レセコン／連携／AI 算定補助（[ADR 0004](decisions/0004-receipt-gateway-and-ai-claims-assist.md) の詳細） | 現役 |
| [PRESCRIPTION_SEARCH_UX.md](PRESCRIPTION_SEARCH_UX.md) | 処方検索・サジェスト UX 方針 | 現役 |
| [PMDA_SYNC_STRATEGY.md](PMDA_SYNC_STRATEGY.md) | PMDA 電子添文の同期方針 | 現役（一部スキーマ記述は実装とズレ・要追随） |
| [MASTER_DATA_REQUIREMENTS.md](MASTER_DATA_REQUIREMENTS.md) | マスタデータ要件ハブ（薬剤・PMDA・病名・検査） | 現役 |
| [MASTER_DATA_DOWNLOADS.md](MASTER_DATA_DOWNLOADS.md) | マスタの取得元・投入状況・件数 | 現役 |
| [DIAGNOSIS_MASTER.md](DIAGNOSIS_MASTER.md) | 標準病名マスタ（MEDIS）の import 手順・運用 runbook | 現役 |

## バックログ・監査

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [PDF_ACTION_BACKLOG.md](PDF_ACTION_BACKLOG.md) | 仕様書を実装単位に落とした作業一覧 | スナップショット（status 要追随） |
| [PDF_PROGRESS.md](PDF_PROGRESS.md) | 仕様書ベースの実装進捗（章別ビュー） | スナップショット（status 要追随） |
| [AUDIT_2026-07-06_REMEDIATION.md](AUDIT_2026-07-06_REMEDIATION.md) | 初回全面監査と是正の記録・残タスク | 現役（残タスクあり） |

## リファレンス・素材

| ドキュメント | 内容 | 状態 |
|---|---|---|
| [design-reference/apple-jp-design.md](design-reference/apple-jp-design.md) | apple.com/jp 実測値仕様（[ADR 0003](decisions/0003-color-system-apple-hig.md) の根拠） | 現役 |
| [mock-html/karte-b.html](mock-html/karte-b.html) | カルテ UI のビジュアル正本 | 正本（視覚） |
| [mock-html/color-palettes.html](mock-html/color-palettes.html) | 配色比較モック（ADR 0003 の根拠） | 現役 |
| [mock-html/](mock-html/) `index.html` / `style.css` | 旧試作（README が「⚠️反面教師・模写禁止」と明記） | 参考（模写禁止） |
| [archive/](archive/) | 初期構想・完了した計画のスナップショット | 歴史 |

---

## 索引外のメモ

- `docs/design-system/` … styleseed の外部リポジトリのローカル参照コピー（3本）。**git 管理外**。frontend からの参照は切れている（[ADR 0002](decisions/0002-styleseed-adoption.md)）。
- 原本の調達仕様書・競合カルテの比較分析・上流の UI/UX 検討メモは**私的保管・リポジトリ非同梱**（プロセスエコノミー方針でも第三者資料は公開しない）。
