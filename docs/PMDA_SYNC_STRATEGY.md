# PMDA 電子添文同期方針

Manta では、添付文書の正本を PMDA に置きつつ、日常の閲覧体験はローカルキャッシュで成立させる。

更新日: 2026-04-28

## 前提

- 処方入力中に PMDA を都度検索しに行く構成は採らない
- 日常の薬剤検索は院内 DB / アプリ DB の `drug master` で処理する
- PMDA は `電子添文の正本` と `更新差分の取得元` として扱う

## PMDA から取得するもの

- 医療用医薬品添付文書 一括ダウンロード
  - 全件取得
  - 指定期間の更新分取得
- 形式
  - PDF
  - SGML / XML
  - PDF + SGML / XML
- YJ コード経由の関連情報リンク

## なぜ HTML スクレイプではなく XML か

- PMDA は XML / SGML / PDF の一括ダウンロードを正式に提供している
- XML は構造化されており、差分比較・版管理・本文整形に向いている
- HTML スクレイプは構造変更に弱く、運用コストが高い

## 推奨パイプライン

1. 初回 bootstrap
   - PMDA の全件 XML/PDF を取得
   - `package_insert_documents` に文書メタデータを登録
   - `package_insert_revisions` に版情報を登録
   - HTML 表示用に XML から本文を整形して保持

2. 定期同期
   - cron で `指定期間更新分` を取得
   - 新規 / 改訂 / 削除を判定
   - 既存版との差分を保存
   - 対象薬剤の検索インデックスを更新

3. UI 反映
   - 処方入力画面ではローカルの最新版を表示
   - 詳細確認で `改訂日`、`警告`、`禁忌`、`相互作用` へジャンプ可能にする
   - 必要なら PMDA 原本リンクも残す

## 保存場所の判断

- PMDA の一括 XML/PDF は Git repository に入れない
- app DB には文書メタデータ、版、YJ/HOT との対応、外部 object key だけを保存する
- XML/PDF の実体は別ストレージに保存する
- ローカル開発は MinIO または任意の filesystem cache を使う
- preview / staging / production は S3 互換 object storage を使う
- 削除・改訂に備えて `raw/{source}/{fetched_at}/...` のように取得単位を残し、正規化済み最新版は `normalized/current/{document_key}/...` に置く
- バックアップ・監査・容量管理の都合上、添文アーカイブ用ストレージは app deployment とは分離する

## 更新検知

- 主系統
  - cron で PMDA の `指定期間更新分` を取得
- 補助系統
  - PMDAメディナビ / マイ医薬品集の通知を運用監視に使う

## cron の考え方

- 毎日早朝 1 回の差分取得で十分
- 全件再取得は初回と障害復旧時だけ
- 大量・頻回アクセスは避ける

## Manta で持つべきテーブル案

- `drug_masters`
  - `id`
  - `hot_code`
  - `yj_code`
  - `generic_name`
  - `brand_name`
  - `kana`
  - `dosage_form`
  - `strength`
  - `default_usage_code`
  - `pmda_document_key`
- `standard_usage_masters`
  - `usage_code`
  - `label`
  - `category`
- `package_insert_documents`
  - `document_key`
  - `yj_code`
  - `title`
  - `pmda_url`
  - `current_revision_id`
- `package_insert_revisions`
  - `revision_id`
  - `document_key`
  - `published_at`
  - `xml_path`
  - `pdf_path`
  - `rendered_html`
  - `change_summary`
- `pmda_sync_jobs`
  - `started_at`
  - `completed_at`
  - `mode`
  - `status`
  - `fetched_count`
  - `updated_count`
  - `error_detail`

## Phase 分け

### Phase 1

- `drug master` の検索 UI
- PMDA 原本リンク
- YJ コードから PMDA 関連文書リンクを自動生成
- 管理画面で PMDA リンクを確認
- XML/PDF の同期方針を固定

### Phase 2

- XML 差分取得 cron
- XML から HTML 生成
- 改訂通知 UI

### Phase 3

- 警告 / 禁忌 / 相互作用の構造化表示
- 薬剤変更時の安全チェック強化

## 実装判断

- 今すぐ必要なのは `添付文書の完全同期` より `処方検索 UX`
- ただし、後で迷わないように PMDA 同期の方針とテーブル設計は先に固定しておく
