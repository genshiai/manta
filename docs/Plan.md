# Manta 開発計画 / Development Plan

---

## 前提

Manta は、オープンソースの次世代電子カルテシステムである。
既存の電子カルテ（170 ページの調達仕様書。第三者作成のためリポジトリ非同梱・私的保管）を参照しつつ、
**外来診療の1ループを最速で回すこと**に集中し、段階的に機能を拡張する。

> 「全部作る」のではなく「診療が止まらない最小セット」から始める。

---

## 現在地ダッシュボード（2026-05-02）

進捗は **5 軸並走**で進んでいる。各軸の現在地を一目で把握するための表。詳細は各リンク先を正とする。

| 軸 | 現在地 | 出典 |
|---|---|---|
| **Phase（機能）** | Phase 1 実装中 — カルテUI 大半完了、優先度A 残作業あり | [Phase 1](#phase-1--mvp外来診療1ループ) |
| **Wave（PDF実装計画）** | Wave 0-5 完了 / **Wave 4.5・4.6 未着手** | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| **UI Refresh** | Phase 1-5 完了（Apple HIG 移行）+ Phase 6 初期完了 | [IMPLEMENTATION_PLAN_UI_REFRESH.md](IMPLEMENTATION_PLAN_UI_REFRESH.md) |
| **FHIR Step** | Step 0-9 read adapter 完了 / Write は途中 | [FHIR_MIGRATION_PLAN.md](FHIR_MIGRATION_PLAN.md) |
| **backend 構造** | **未着手**（`main.py` / `models.py` / `schemas.py` 集約） | [BACKEND_MODULE_RESTRUCTURE_PLAN.md](BACKEND_MODULE_RESTRUCTURE_PLAN.md) |

### 直近の着手順

1. **backend モジュール分割**（Wave 4.6） — `auth` + `master_data` の router 切り出しから。これを先にやらないと rececon が `main.py` にさらに肥大化する
2. **Wave 4.5 Mantaレセコン skeleton** — ClaimDraft / BillingCandidate / ReviewIssue / AI Claims Assist の骨組み
3. **PDF_ACTION_BACKLOG 優先度A** — 病名 ICD10・処方 PMDA 同期・テンプレ管理（並行実施可）

### 運用ルール

- 進捗があったら **このダッシュボード表だけ更新**する。詳細は対応する計画書側で記録
- 各軸の意味:
  - **Phase**: ユーザーストーリー単位の機能進捗（Phase 0 → 1 → 2 → 3 → 4）
  - **Wave**: PDF 仕様書を実装単位に落とした実行計画（Wave 0 〜 5）
  - **UI Refresh**: デザイン刷新の段階（Phase 1 〜 6、UI に閉じる）
  - **FHIR Step**: FHIR R4 (JP Core) 移行のリソース別段階（Step 0 〜 9）
  - **backend 構造**: モジュラーモノリス化の進捗（karte / rececon / gateway 等）

---

## Phase 0 — 基盤構築（現在）

**目標**: 開発環境・設計基盤・UIプロトタイプの確立

| 項目 | 状態 |
|------|------|
| リポジトリ・CI 基盤 | 設計済（docs/first/） |
| デザインシステム選定 | 完了（Apple HIG + StyleSeed Notion skin、ADR 0001-0003） |
| デザインガイドライン | 完了（docs/DESIGN_GUIDELINES.md） |
| mock HTML（カルテ画面） | 完了（mock-html/） |
| 技術スタック ADR | 完了（docs/decisions/ + docs/first/adr/） |
| Phase 1 要件定義 | **本ドキュメント** |

### Phase 0 の成果物
- `docs/Plan.md` — 本ドキュメント
- `docs/IMPLEMENTATION_PLAN.md` — PDF準拠の実装実行計画（Wave 0-5）
- `docs/IMPLEMENTATION_PLAN_UI_REFRESH.md` — UI リフレッシュ計画（Phase 1-5 完了済み）
- `docs/PDF_PROGRESS.md` — PDF基準の実装進捗スナップショット
- `docs/PDF_ACTION_BACKLOG.md` — PDFを実装単位に落とした作業一覧
- `docs/PMDA_SYNC_STRATEGY.md` — PMDA電子添文の同期方針
- `docs/PRESCRIPTION_SEARCH_UX.md` — 処方検索 / サジェスト UX 方針
- `docs/RECEIPT_GATEWAY_STRATEGY.md` — Mantaレセコン / レセコン連携 / AI算定補助方針
- `docs/BACKEND_MODULE_RESTRUCTURE_PLAN.md` — Mantaカルテ / Mantaレセコン / Manta外部連携の backend 分割方針
- `docs/FHIR_MIGRATION_PLAN.md` — FHIR R4 (JP Core) 移行計画
- `docs/AUTH_DECISION.md` — FastAPI 自前認証の方針
- カルテ UI / UX 再検討メモ — 私的保管（リポジトリ非同梱）
- `docs/DEVELOPMENT_GUIDELINES.md` — 開発指針
- `docs/DESIGN_GUIDELINES.md` — デザインガイドライン（Apple HIG + StyleSeed）
- `docs/decisions/0001-0004` — ADR（デジタル庁離脱 / StyleSeed採用 / Apple HIG カラー / レセコン3層）
- `docs/design-reference/apple-jp-design.md` — apple.com/jp 実測値仕様
- `docs/requirements/PHASE_REQUIREMENTS.md` — Phase別要件一覧
- 原本の調達仕様書（karte-system.pdf） — 第三者作成のためリポジトリ非同梱（私的保管）。導出済み要件は `docs/requirements/PHASE_REQUIREMENTS.md` を参照
- `docs/mock-html/` — UIプロトタイプ・比較モック

---

## Phase 1 — MVP（外来診療1ループ）

**目標**: 医師が1人の外来患者を診察し、カルテを書き、処方を出し、次回予約まで完了できる。

### 現在の進捗

| 項目 | 状態 |
|---|---|
| 認証 | 実装中（JWT / me / 管理者ガード / 利用者マスタまで実装） |
| 受付患者一覧 / 患者選択 | 完了 |
| SOAP / 指示歴 / 版管理 UI | 完了 |
| 患者プロファイル / プロブレム DB 化 | 完了 |
| 受診履歴 / バイタル / 検査結果 DB 化 | 完了 |
| 画像オーダー / 処置 API 化 | 完了 |
| 処方候補 / 標準用法 / 処方セット / 検査セット / 予約枠 master API 化 | 完了 |
| 設定画面での master 編集 UI | 完了（有効/無効切替を含む。標準用法 / 処方セットを含む） |
| 処方 / 検査 / 予約 UI | 完了 |
| 監査ログ UI | 完了（patient と system の両方を表示） |
| FastAPI / PostgreSQL 永続化 | 実装中（frontend 接続済） |
| preview デプロイ | ローカル compose preview を実装 |
| FHIR 変換層（Patient + Condition + Observation / JP Core） | 実装中（[FHIR_MIGRATION_PLAN.md §8 Step 0-9 完了](FHIR_MIGRATION_PLAN.md) — `/fhir/metadata` / Patient CRUD / Encounter / Composition / Condition CRUD+search / Observation CRUD+search / DiagnosticReport search / ServiceRequest search / MedicationRequest CRUD+search / Appointment CRUD+search） |

### ユーザーストーリー（外来1コマの流れ）

```
1. 医師がログインする
2. 受付患者一覧から患者を選ぶ
3. 患者情報（基本情報・アレルギー・既往歴）を確認する
4. 過去のカルテ（指示歴）を参照する
5. SOAP形式でカルテを記載する
6. 処方オーダーを入力する
7. 検体検査をオーダーする
8. 検査結果を参照する
9. カルテを保存する
10. 次回予約を入れる
11. 次の患者へ
```

### 対応する仕様書セクション（karte-system.pdf）

| ユーザーストーリー | 仕様書セクション | スコープ |
|---|---|---|
| ログイン | 1.1 利用者ID認証 | ID/パスワード認証のみ。権限は医師/管理者の2種 |
| 受付患者一覧 | 2.1 受付患者一覧 | 受付日・患者名・診療科・受付状態の表示。ソート。カルテ選択 |
| 患者情報 | 3.5 患者情報 | 基本情報・アレルギー・感染症の表示 |
| 患者プロファイル | 3.6 患者プロファイル | 身長・体重・既往歴・生活情報の表示・入力 |
| カルテ参照 | 3.2 指示歴（カルテ歴） | 過去カルテの一覧表示（日付ツリー）。簡易表示・詳細表示 |
| SOAP記載 | 3.1 編集機能 | SOAP入力・フリー入力。保存・版数管理 |
| 処方 | 6.1 処方オーダ | 内服処方のみ。薬品検索・用法選択・日数指定。アレルギーチェック |
| 検体検査 | 8.1 検体検査 | 検査セット選択・項目指定。至急/通常の区別 |
| 検査結果 | 24.1 検査歴参照 | 結果表示・基準値比較・時系列表示 |
| 次回予約 | 4.1 再診予約 | 予約枠指定・日時選択 |
| 病名管理 | 3.7 病名ツール | ICD10病名登録・プロブレムリスト |
| 監査ログ | 25.12 アクセスログ管理 | 全操作の記録（3省2ガイドライン準拠） |

### Phase 1 でやらないこと

| やらないこと | 理由 |
|---|---|
| 入院機能 (7) | 外来MVPに不要 |
| 注射オーダ (6.2) | 処方に集中 |
| 画像検査 (10) | 外部PACSとの連携が前提 |
| 手術・麻酔 (17, 18) | 入院機能の後 |
| 看護支援 | 別フェーズ |
| DPC (29) | 入院機能の後 |
| 病棟業務 (26) | 入院機能の後 |
| マスタメンテナンス (33) | 大規模機能は後続。利用者 / 処方候補 / 標準用法 / 処方セット / 検査セット / 予約枠 / テンプレートのみ先行対応 |
| 印刷 (30) | ブラウザ印刷で仮対応 |
| カードリーダ対応 | Webアプリでは不要 |
| 文書作成 (25.3) | Phase 2以降 |

### 画面構成

```
[グローバルナビ]  受付 | カルテ | 予約 | 設定
                        ↓ 患者を選択すると表示
[患者コンテキスト]  カルテ記載 | 指示歴 | 検査結果 | 患者情報
```

### 技術的マイルストーン

1. **バックエンド基盤**: FastAPI + PostgreSQL + 認証
2. **ドメインモデル**: Patient, SOAPNote, Prescription, LabOrder, LabResult
3. **フロントエンド基盤**: Vite + React + TanStack + Apple HIG + StyleSeed Notion skin（Tailwind v4）
4. **外来ワークフロー結合**: 受付 → カルテ → 処方 → 検査 → 保存 → 予約
5. **監査ログ**: 全操作記録
6. **デモサイト公開**

### 認証方針

- Phase 1 は FastAPI 側で認証を完結させる
- `利用者ID + パスワード`、`Argon2`、`JWT bearer` を採用する
- ロールは `医師` / `管理者` の 2 種から始める
- 詳細は [AUTH_DECISION.md](AUTH_DECISION.md) を参照

---

## Phase 2 — 診療支援拡充

**目標**: 日常診療の効率と安全性を高める機能の追加

| 機能 | 仕様書セクション |
|---|---|
| 外用・頓服処方 | 6.1 拡張 |
| 注射オーダ | 6.2 |
| テンプレート機能 | 25.6 |
| シェーマ（人体図） | 25.5 |
| セット処方・セット検査 | 25.1 |
| 文書作成（紹介状等） | 25.3 |
| 診療カレンダー | 23.1 |
| 処方チェック強化 | 5.1（禁忌・重複・用量） |
| 放射線検査オーダ | 10.1 |
| 生理検査オーダ | 11.1 |
| 算定候補レビュー / AI算定補助 | 独自（Mantaレセコンの入口。レセコン送信は後続 adapter） |
| 患者検索強化 | 2.3 カナ検索 |
| FHIR R4 基盤 | 独自（Patient / Encounter / Composition / Condition / Observation / DiagnosticReport / ServiceRequest / MedicationRequest / Appointment は Phase 1-2 で先行実装済み） |

---

## Phase 3 — 入院・病棟・AI

**目標**: 入院診療のサポートと、AI統合による次世代機能

| 機能 | 仕様書セクション |
|---|---|
| 入退院管理 | 7.1-7.5 |
| 病棟患者一覧 | 2.4 |
| ベッドコントロール | 26.4 |
| 指示簿 | 26.8 |
| 経過表 | 看護支援 1.4 |
| 看護記録（SOAP） | 看護支援 1.3 |
| クリティカルパス | 23.2 |
| サマリ管理 | 25.10 |
| AI カルテ要約 | 独自（LLM統合） |
| AI 処方サジェスト | 独自 |
| 音声入力 → SOAP | 独自 |
| Tauri デスクトップ | 独自 |
| DICOM連携 | 独自 |

---

## Phase 4 — 病院全体・マルチテナント

| 機能 | 仕様書セクション |
|---|---|
| 手術部門 | 17, 手術部門システム |
| リハビリ | 20 |
| 栄養指導 | 21 |
| DPC | 29 |
| 看護支援（フル） | 看護支援システム全体 |
| チーム医療 | 28 |
| Mantaレセコン | 算定 / 会計 / レセプト / 返戻・査定レビュー |
| レセプト連携 | レセコン連携層 + ORCA adapter / 外部レセコン連携 |
| マルチテナント | 独自 |

---

## 優先順位の判断基準

何を先にやるかは、以下の基準で判断する:

1. **これがないと診療が止まるか？** → Phase 1
2. **これがないと不便だが診療は可能か？** → Phase 2
3. **入院が必要か？** → Phase 3
4. **病院全体の運用か？** → Phase 4
5. **あったら嬉しいか？** → Backlog

---

## 仕様書の使い方

原本の調達仕様書（私的保管）は **完成形の地図** として扱う。

- 新機能を設計する際に、該当セクションを必ず参照する
- 既存EMRがどう解決しているかの知見として活用する
- ただし、仕様をそのまま実装するのではなく、**モダンなUXで再解釈**する
- 仕様書にない独自機能（AI統合等）は ADR で意思決定を記録する
- レセコン連携と AI 算定補助は [ADR 0004](decisions/0004-receipt-gateway-and-ai-claims-assist.md) と [RECEIPT_GATEWAY_STRATEGY.md](RECEIPT_GATEWAY_STRATEGY.md) を正とする
- backend 分割は [BACKEND_MODULE_RESTRUCTURE_PLAN.md](BACKEND_MODULE_RESTRUCTURE_PLAN.md) を正とし、最初はモジュラーモノリス内で Mantaカルテ / Mantaレセコン / Manta外部連携を分ける
