# Mantaレセコン / レセコン連携 / AI算定補助戦略

Manta は最終的に **Mantaカルテ** と **Mantaレセコン** を持つ。短期的には既存レセコンを置き換えず、カルテ・オーダ・病名・患者安全情報をもとに算定候補を作り、ORCA などのレセコンへ安全に流す **レセコン連携層** を持つ。

根拠 ADR: [0004 MantaレセコンとAI算定補助層を採用](decisions/0004-receipt-gateway-and-ai-claims-assist.md)

## 目的

- 医師向け UI は「胸部X線」「HbA1cセット」「糖尿病フォロー」など臨床語彙で保つ
- 裏側で診療行為、医薬品、特定器材、傷病名、コメント等の公式マスターに接続する
- ORCA などのレセコンへ診療行為・病名・保険文脈を送れる形に変換する
- 将来の Mantaレセコンで、会計・レセプト作成・返戻/査定レビューまで内製できる境界を作る
- AI が算定漏れ、病名不足、コメント不足、重複、整合性リスクを説明付きで補助する
- 最終会計・レセプト請求は人間の確認を必須にする

## レイヤー

```txt
Frontend Chart / Order UI
  -> Clinical Order API
  -> Order Catalog
  -> Billing Core
  -> Claim Draft / Review API
  -> レセコン連携層
  -> ORCA Adapter
```

プロダクト上の呼称:

- **Mantaカルテ**: 診療録、オーダ、病名、患者安全、医師向けAI
- **Mantaレセコン**: 算定、会計、レセプト作成、返戻 / 査定レビュー、月次請求、医事向けAI
- **Manta外部連携**: ORCA、他社レセコン、RIS/LIS/PACS、FHIR/API 連携

開発者向けには `receipt_gateway` や `claims` という名前を使ってよいが、ユーザー向け UI / ドキュメントでは「レセコン」「レセコン連携」を優先する。

### Order Catalog

医師が選択するオーダ候補を管理する。保険請求マスターをそのまま UI に出さない。

例:

```json
{
  "order_id": "img_chest_xray_pa",
  "display_name": "胸部X線",
  "category": "imaging",
  "modality": "xray",
  "body_part": "chest",
  "default_parameters": {
    "direction": "PA",
    "contrast": false
  }
}
```

### Master Sync

公式マスターを取り込み、検索しやすい形に正規化する。

- 医科診療行為マスター
- 医薬品マスター
- 特定器材マスター
- 傷病名マスター
- 修飾語マスター
- コメントマスター
- 必要に応じて JLAC / JJ1017 / 院内 LIS/RIS コード

生マスターは repo に commit しない。取り込み履歴、改定日、差分、無効化を DB で管理する。

### Billing Core

カルテ・オーダ・病名・保険文脈から算定候補を生成する。

主な内部モデル:

- `ClinicalOrder`
- `OrderCatalogItem`
- `BillingCandidate`
- `DiagnosisLink`
- `InsuranceContext`
- `ClaimDraft`
- `ClaimReviewIssue`

Billing Core は ORCA 固有 API を知らない。ORCA 固有形式への変換は adapter に閉じ込める。

### AI Claims Assist

AI は `ClaimDraft` と診療文脈を読んで、レビュー補助を返す。

AI が出してよいもの:

- 算定漏れ候補
- 病名不足候補
- コメント不足候補
- 検査 / 画像 / 処方と病名の整合性リスク
- 重複・過剰・禁忌の注意
- 医事担当者向けの確認理由

AI がやらないこと:

- 最終会計の自動確定
- レセプト請求の自動提出
- 医師・医事担当者の確認を飛ばすこと
- 根拠のない病名や算定項目の自動登録

### Mantaレセコン

将来の正式モジュール。Phase 1 では完全実装しない。

責務:

- 算定候補の確定
- 会計
- レセプト作成
- 月次請求
- 返戻 / 査定レビュー
- DPC / 入院算定への拡張
- 医事向けAIレビュー

### レセコン連携層

内部アーキテクチャ名は `Receipt Gateway` としてもよいが、外向きには「レセコン連携」と呼ぶ。

レセコン連携の共通境界。

責務:

- `ClaimDraft` を adapter 入力へ変換
- 送信前レビュー状態を管理
- レセコン送信の冪等性を担保
- レセコンからのエラーを Manta 共通エラーに正規化
- 会計結果、請求状態、未送信 / 送信済 / 要修正を返す
- 監査ログを残す

### ORCA Adapter

最初の adapter として ORCA 日レセ API に対応する。CLAIM 通信は新規前提にしない。

責務:

- ORCA API 形式への変換
- ORCA からの患者 / 受付 / 診療行為 / 会計状態の取得
- ORCA 固有エラーの正規化
- テスト用 ORCA stub の提供

## UI 方針

カルテ画面に直接「レセコン画面」を出さない。医師には臨床上の意味を見せ、送信前レビューで医事的な意味を見せる。

必要な画面:

- オーダ追加画面: 臨床語彙で検索し、裏の保険コードは詳細表示に隠す
- 算定候補レビュー: 今日のオーダ、病名、候補点数、警告、AIコメントを一覧
- 病名リンク確認: オーダと根拠病名の不足・候補を提示
- ORCA送信結果: 送信済、要修正、レセコン側エラーを表示

## 実装ステップ

1. **Schema**
   - `official_master_imports`
   - `fee_service_masters`
   - `disease_masters`
   - `order_catalog_items`
   - `order_catalog_fee_links`
   - `billing_candidates`
   - `claim_drafts`
   - `claim_review_issues`
   - `receipt_submissions`

2. **Master Sync**
   - 公式マスター ZIP/CSV の dry-run import
   - 差分、廃止、改定日、有効 / 無効を保存
   - raw file は保存場所を分離し repo には含めない

3. **Order Catalog**
   - 既存の処方候補、検査セット、画像オーダを `order_catalog_items` へ寄せる
   - 医師向け表示名と保険 / 部門コードを分離

4. **Billing Core**
   - オーダから `BillingCandidate` を生成
   - 病名リンク、コメント不足、重複候補を `ClaimReviewIssue` にする

5. **AI Claims Assist**
   - `ClaimDraft` とカルテ本文からレビューコメントを生成
   - AI出力は候補として保存し、人間承認前に送信しない

6. **レセコン連携層**
   - 共通 interface と ORCA adapter stub を実装
   - ORCA 実環境接続前に integration test double で確認

7. **ORCA Adapter**
   - 日レセ API で患者 / 受付 / 診療行為 / 会計状態の最小連携
   - エラー正規化と監査ログ

8. **Mantaレセコン**
   - 会計、レセプト作成、月次請求、返戻/査定レビューを段階的に追加
   - 既存レセコン連携と併存できるよう、同じ `ClaimDraft` / `BillingCandidate` を入口にする

## 最初の到達点

Phase 1.5 として、Mantaレセコン本体までは作らず、以下を作る。

- オーダから算定候補を生成する
- 病名不足とコメント不足を表示する
- AI が「確認理由」を説明する
- ClaimDraft を保存し、送信前レビュー画面で確認できる

ORCA 送信は Phase 2 以降の adapter 実装で行う。Mantaレセコン本体は Phase 3 以降に、会計・月次請求・返戻/査定レビューから段階的に広げる。
