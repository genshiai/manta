# Manta 実装実行計画

このドキュメントは `docs/requirements/karte-system.pdf` を、実際に実装を進めるための順序に変換したものです。

進捗の定点観測は [PDF_PROGRESS.md](/Users/daichi/Work/genshiai/manta/docs/PDF_PROGRESS.md) を参照してください。
実装単位の一覧は [PDF_ACTION_BACKLOG.md](/Users/daichi/Work/genshiai/manta/docs/PDF_ACTION_BACKLOG.md) を参照してください。
処方検索 UX は [PRESCRIPTION_SEARCH_UX.md](/Users/daichi/Work/genshiai/manta/docs/PRESCRIPTION_SEARCH_UX.md) を参照してください。
PMDA 電子添文同期方針は [PMDA_SYNC_STRATEGY.md](/Users/daichi/Work/genshiai/manta/docs/PMDA_SYNC_STRATEGY.md) を参照してください。
レセコン連携 / AI 算定補助方針は [RECEIPT_GATEWAY_STRATEGY.md](RECEIPT_GATEWAY_STRATEGY.md) を参照してください。
backend 分割方針は [BACKEND_MODULE_RESTRUCTURE_PLAN.md](BACKEND_MODULE_RESTRUCTURE_PLAN.md) を参照してください。

前提は以下の通りです。

- UI はデジタル庁デザインシステムをそのまま使う
- React コンポーネントは `@digital-go-jp/design-system-example-components-react` を優先する
- Tailwind は `@digital-go-jp/tailwind-theme-plugin` で統一する
- 未実装コンポーネントは Headless UI / APG 準拠で補う
- まずは「外来 1 ループ」を end-to-end で通す
- レセコン連携は Mantaカルテから直結せず、Mantaレセコン / レセコン連携層 / adapter を経由する

## 実装原則

- 独自の色トークンは作らない
- ボタン、入力、テキストエリア、リンク、見出しは公式コンポーネントを優先する
- 患者安全に関わる機能を先に作る
- 1 スライスごとに preview 環境へ出し、医師レビューを回す

## MVP スコープ

| スライス | PDF 仕様 | 実装内容 |
|---|---|---|
| 認証 | 1.1 | ID/パスワード認証、医師/管理者ロール |
| 患者選択 | 2.1, 2.3, 2.9 | 受付患者一覧、氏名/ID検索、取り違え防止表示 |
| カルテ基本 | 3.1, 3.2, 3.5, 3.6, 3.7 | SOAP 入力、履歴、患者情報、プロブレムリスト |
| 予約 | 4.1 | 次回予約の作成 |
| 安全チェック | 5.1 | アレルギー、重複、病名必須の基本チェック |
| 処方 | 6.1 | 内服処方、用法、日数、過去処方複写 |
| 検体検査 | 8.1 | セット選択、通常/至急、重複チェック |
| 参照 | 24.1 | 検査歴表示、異常値フラグ |
| 算定補助 | 独自 | オーダ / 病名 / 保険文脈から ClaimDraft を生成し、AI が算定漏れ・病名不足・コメント不足を補助 |
| 監査 | 25.12 | 操作ログの記録と追跡 |

## 実装ウェーブ

### Wave 0: 基盤

- `frontend/` を Vite + React + TypeScript で作成
- デジタル庁 React コンポーネント導入
- Tailwind theme plugin 導入
- `compose.yaml` で PostgreSQL を起動可能にする
- preview 配信の前提になる build を通す

### Wave 1: 外来カルテ画面シェル

- グローバルナビ
- 患者コンテキストバー
- 3 カラムレイアウト
- 左: 患者情報、受診履歴、プロブレムリスト
- 中央: SOAP 編集領域、検査結果
- 右: 処方、検査、次回予約

### Wave 2: 患者選択

- 受付患者一覧
- 当日受付ステータス表示
- 氏名/ID 検索
- 患者選択時の確認 UI
- 同姓同名警告

### Wave 3: カルテ編集

- SOAP 保存
- 下書き / 保存状態表示
- カルテ履歴一覧
- 版数管理 UI
- テンプレート差し込みの入口

### Wave 4: オーダー

- 内服処方入力
- 薬剤検索
- アレルギーチェック
- 検体検査セット入力
- 検査結果参照との接続
- Order Catalog と公式マスター参照の分離

### Wave 4.5: Mantaレセコン入口 / レセコン連携層

- 診療行為 / 医薬品 / 特定器材 / 傷病名 / コメント master の取り込み口を整備
- オーダから `BillingCandidate` を生成
- 病名不足、コメント不足、重複、算定漏れ候補を `ClaimReviewIssue` として保存
- AI Claims Assist が送信前レビュー用の説明を生成
- `ClaimDraft` を保存し、レセコン送信前に人間が確認できる画面を作る
- ORCA adapter はまず stub として実装し、実環境連携は後続で進める

### Wave 4.6: backend モジュール再編

- `main.py`, `models.py`, `schemas.py` に集約された実装を段階的に分割する
- `modules/chart`, `modules/orders`, `modules/masters`, `modules/order_catalog`, `modules/rececon`, `modules/integrations` の境界を作る
- 既存 API の URL と response は維持し、router 分割から始める
- 物理サーバー分割は行わず、FastAPI / PostgreSQL のモジュラーモノリスを維持する

### Wave 5: 予約と監査

- 次回予約作成
- アクセスログ/変更ログ
- 最低限の権限分岐

### Wave 6: レビュー運用

- preview デプロイ
- 医師レビュー会
- 指摘を issue 化
- 小さな差分で継続改善

## 直近 2 週間の着手順

1. FastAPI で認証・患者・カルテ保存 API の雛形を作る
2. PostgreSQL に patient / chart_note / chart_version / audit_log を切る
3. フロントの localStorage 実装を API 呼び出しへ差し替える
4. preview 環境へ出して医師レビューを回す
5. 指摘を issue に分解し、差分を小さく継続改善する

## ローカル開発の前提

- DB: `docker compose up -d`
- Frontend: `cd frontend && npm install && npm run dev`
- Backend は次の着手で FastAPI を追加する

## preview 運用

- `main` に直接出さず preview 環境で確認する
- ダミーデータを常設し、ログイン不要でカルテ画面を触れる状態を保つ
- 「見て直す」を 1 週間単位で回す

## 現在の状態

- Wave 0: 完了
- Wave 1: 完了
- Wave 2: 完了
- Wave 3: 完了
- Wave 4: UI 完了、FastAPI の受け口を実装
- Wave 5: UI 完了、FastAPI に監査ログ / 認証 / 予約 / 利用者マスタ API を追加
- Wave 6: ローカル preview compose を実装

## 現在の到達点

- 1.1: ログイン画面、利用者 ID / パスワード / リトライ回数の mock 実装
- 1.1, 33.18: `auth/me`、管理者ガード、利用者マスタの作成 / 更新 / 一時パスワード再設定
- 2.1, 2.3, 2.9: 受付患者一覧、検索、絞り込み、検索条件保存、同姓同名警告、患者確認
- 3.1, 3.2, 3.5, 3.6, 3.7: SOAP 編集、保存状態、版管理、指示歴参照、患者情報、プロブレム表示
- 3.6, 3.7: 患者プロファイル / プロブレムを PostgreSQL 正本へ移し、患者情報タブから保存できる
- 4.1: 再診予約枠の選択とコメント更新
- 5.1: アレルギー、同一薬剤、病名関連、検査重複、満枠予約の基本警告
- 6.1: 処方追加、日数定型、薬歴タイムライン、前回処方一括複写
- 8.1: 検査セット追加、通常 / 至急指定
- 24.1: 検査結果表示、異常値色分け
- 25.12: 認証 / 患者選択 / 保存 / オーダ / 予約の操作ログ表示
- 独自: Mantaレセコン / レセコン連携層 / AI 算定補助の方針を ADR 0004 と戦略ドキュメントに固定

## 次の実装焦点

- FastAPI + PostgreSQL による永続化へフロントを接続した
- 監査ログを DB 保存し、患者起点・利用者起点で引けるようにする
- preview デプロイを通し、医師レビュー会を開始する

## 最新の進捗

- frontend は既定で同一 origin の `/api` を参照し、開発中は Vite proxy で FastAPI へ接続する
- 受付患者一覧、ログイン、カルテ取得、SOAP 保存、処方追加、検査追加、再診予約、診察終了は API 経由で動作する
- localStorage はセッション保持に限定し、業務データの正本は PostgreSQL 側へ移した
- 認証方針は `FastAPI 自前 + Argon2 + JWT + 医師/管理者 2 ロール` で固定し、`docs/AUTH_DECISION.md` に明文化した
- `GET /api/auth/me` と管理者ロールガードを追加し、フロントは保存済み token の復元時に再検証する
- 管理者向けの `設定 / 利用者マスタ` 画面を追加し、利用者の作成 / 基本情報更新 / 一時パスワード再設定を実装した
- `frontend/Dockerfile` と `frontend/nginx.conf` を追加し、`docker compose up -d --build web` で preview 用の静的配信と API reverse proxy を起動できるようにした
- 患者プロファイルとプロブレムを `patients.profile_items / patients.problems` に移し、`PUT /api/patients/{patient_id}/context` で更新できるようにした
- 受診履歴 / バイタル / 検査結果 / カルテ要約を `patients.visit_history / patients.vitals / patients.lab_results / patients.chart_history` に移し、frontend は API データで描画するようにした
- 画像オーダー / 処置・指導を `patients.imaging_orders / patients.procedure_orders` に移し、追加操作も API 経由で実行できるようにした
- 処方候補 / 標準用法 / 処方セット / 検査セット / 予約枠を master table に移し、frontend は `GET /api/masters/chart-order-config` を参照するようにした
- `設定` 画面に管理者向け master 編集 UI を追加し、利用者 / 処方候補 / 標準用法 / 処方セット / 検査セット / 予約枠を更新できるようにした
- master は `is_active` で有効 / 無効を切り替えられるようにし、frontend の候補取得では active のみ返し、設定画面では inactive を含めて管理できるようにした
- `設定` 画面の下部に `scope=system` の監査ログを表示し、利用者マスタ / オーダーマスタ変更の追跡をできるようにした
- chart template master を追加し、カルテ画面から `25.6 テンプレート` を選択して SOAP に挿入できるようにした
- `設定` 画面から chart template の作成 / 更新 / 有効無効切替をできるようにした
- 処方検索は一般名 / カナ / 別名 / YJ / HOT / 関連病名まで拾えるようにし、標準用法 / 個人利用履歴 / 処方セットでサジェストと入力補完を強化した
- 薬剤 master CSV import を追加し、YJ コードから PMDA 関連文書リンクを自動生成できるようにした
- 薬剤 master import は `backend/scripts/import_drug_master.py --dry-run --deactivate-missing` に対応し、HOT/YJ 正本データを継続投入しやすくした
- 薬歴タイムライン API と前回処方一括複写 API を追加し、今日の重複・アレルギー系警告をサーバ側で判定してから複写する
- 前回処方複写は `copy-preview` API で追加予定、スキップ理由、前回/今回の差分を確認してから確定できるようにした
- 処方セット / 検査セット master に `included_set_ids` を追加し、設定画面で複合セットを管理し、カルテ画面で再帰展開してオーダー追加できるようにした
- 処方セット / 検査セットは展開前プレビューを挟み、未登録薬、同一薬剤、アレルギー、検査重複を確認してから確定追加できるようにした
- FHIR R4B / JP Core アダプタは Patient / Encounter / Composition / Condition / Observation / DiagnosticReport / ServiceRequest / MedicationRequest / Appointment まで先行実装し、preview でも `/fhir/*` を reverse proxy する
- `時系列参照` タブで受診履歴 / 薬歴 / 薬剤別の長期サマリ / 検査オーダ歴 / 診療サマリを横断で確認できるようにし、検査結果タブでは項目別の前回差分サマリを追加した
- 検査結果は `lab_results.history` を返すようにして、結果タブで 3 回分の推移グラフと比較パネルを表示できるようにした
- `GET /api/patients/{patient_id}/lab-trends` を追加し、FHIR Observation 正本から項目別の長期検査トレンド、最新値、前回差分、異常回数を返すようにした
- 結果タブの検査推移パネルは長期検査トレンド API を優先し、選択項目ごとの全履歴推移と異常回数を確認できるようにした
- レセコン連携は ORCA 直結ではなく Mantaレセコン / Billing Core / レセコン連携層 / ORCA adapter に分離する方針を採用し、AI は最終請求確定ではなく算定候補レビューを補助する位置づけにした
- backend は当面 1 FastAPI app のまま、`modules/chart`, `modules/orders`, `modules/masters`, `modules/order_catalog`, `modules/rececon`, `modules/integrations` に分割する方針にした
- `scripts/verify_local.py` を追加し、pytest / lint / build / migration / compose / preview smoke を 1 コマンドで確認できるようにした
- backend test は更新系テスト後に cleanup するように直し、開発 DB を汚さずに繰り返し回せるようにした
- 次の主課題は外部 preview への公開と、マスタの更新者 / 更新日時表示、レビュー運用の整備
