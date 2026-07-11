# Backend Module Restructure Plan

Manta は当面モジュラーモノリスで進める。物理的なサーバー分割は急がないが、backend 内の責務境界は早めに切る。

根拠:

- [ADR 0004: MantaレセコンとAI算定補助層を採用](decisions/0004-receipt-gateway-and-ai-claims-assist.md)
- [Mantaレセコン / レセコン連携 / AI算定補助戦略](RECEIPT_GATEWAY_STRATEGY.md)
- [ADR-0004: モジュラーモノリスを採用](archive/first-concept/0004-modular-monolith.md)

## 現状

現状の backend は機能が `backend/app/main.py`, `models.py`, `schemas.py` に集約されている。

```txt
backend/app/
  main.py       # auth, masters, patients, karte, orders, admin, audit が混在
  models.py     # 患者、カルテ、FHIR、マスター、監査ログが混在
  schemas.py    # 全API schemaが混在
  fhir/
```

このまま Mantaレセコン、レセコン連携、公式マスター同期、AI算定補助を追加すると、カルテと医事会計の責務が分離できなくなる。

## 目標構造

最初は 1 FastAPI app / 1 PostgreSQL のまま、以下の package 境界に分ける。

```txt
backend/app/
  main.py
  core/
    config.py
    db.py
    security.py
    audit.py

  modules/
    auth/
      router.py
      schemas.py
      service.py

    karte/
      router.py
      models.py
      schemas.py
      service.py
      patients.py
      notes.py
      diagnoses.py
      observations.py
      orders/
        prescription.py
        lab.py
        imaging.py
        procedure.py

    master_data/
      router.py
      models.py
      schemas.py
      service.py
      imports/
        drug.py
        diagnosis.py
        fee_service.py
        device.py
        comment.py
        jlac.py
        jj1017.py

    order_catalog/
      router.py
      models.py
      schemas.py
      service.py
      mapping_workbench.py

    rececon/
      router.py
      models.py
      schemas.py
      billing_core.py
      claim_drafts.py
      review_issues.py
      accounting.py
      receipts.py
      ai_assist.py

    gateway/
      orca/
        router.py
        client.py
        adapter.py
        schemas.py
        stub.py
      fhir/
        router.py
        mappers/
        validators/
      lis/
      ris/
      pacs/

    admin/
      router.py
      users.py
      master_admin.py

  fhir/
```

## モジュール責務

### Mantaカルテ

`modules/karte`, `modules/order_catalog` が担う。

- 患者
- 診療録
- 病名 / Problem List
- 検査結果
- 処方 / 検査 / 画像 / 処置オーダ
- 医師向けオーダカタログ

### Mantaレセコン

`modules/rececon` が担う。

- 算定候補
- 病名リンク
- コメント不足
- ClaimDraft
- 会計
- レセプト作成
- 返戻 / 査定レビュー
- 医事向けAI算定補助

Phase 1.5 では `billing_core`, `claim_drafts`, `review_issues`, `ai_assist` まで。`accounting`, `receipts` は後続。

### Manta外部連携

`modules/gateway` が担う。

- ORCA adapter
- 他社レセコン adapter
- LIS/RIS/PACS
- 外部FHIR/API接続

外向きには「外部連携」と呼ぶ。コード上は、外部システムとの変換・送受信境界として `gateway` を使う。

FHIR は Mantaカルテ本体ではなく外部公開 / 変換の境界なので、`modules/gateway/fhir` に置く。FHIR mapper は `karte` / `rececon` の正本データを読むが、正本モデルそのものを所有しない。

## 依存方向

```txt
karte       -> order_catalog -> rececon -> gateway
master_data -> order_catalog -> rececon
gateway/fhir -> karte/rececon read models
admin       -> master_data/order_catalog/auth
```

禁止:

- `karte` から ORCA adapter を直接呼ばない
- `karte/orders` からレセコン送信を直接しない
- `gateway` から `karte` の書き込み service を直接呼ばない
- AI が `ClaimDraft` を人間確認なしに確定しない

## 物理サーバー分割の判断条件

最初から `manta-karte-api` と `manta-rececon-api` を分けない。以下のいずれかが来たら分割する。

- Mantaレセコンを単体プロダクトとして販売する
- レセコン側の点数改定 / 月次請求リリースサイクルがカルテと分かれる
- 月次請求、返戻処理、マスター差分処理の負荷がカルテAPIに影響する
- 医事部門向け権限・監査・運用がカルテと明確に分かれる
- 他社カルテから Mantaレセコンだけ使う需要が出る

分割後の候補:

```txt
manta-karte-api
manta-rececon-api
manta-gateway-api
```

## 移行手順

1. `core/` を作り、config/db/security/audit を移す
2. `auth/`, `admin/`, `karte/`, `master_data/` の router を切り出す
3. `main.py` は `include_router` だけに近づける
4. 既存 SQLAlchemy model は互換を保ちながら module model へ分割する
5. `order_catalog/` を追加し、既存の処方候補 / 検査セット / 画像オーダを寄せる
6. `rececon/` を追加し、`ClaimDraft` と `ClaimReviewIssue` から始める
7. `gateway/orca/` を stub で追加する
8. 既存 `app/fhir/` は `gateway/fhir/` へ移す
9. import-linter などで依存方向をCIに入れる

## 直近でやること

大改造を一気にやらない。まずはドキュメントと境界を固定し、次に router 分割から始める。

最初の実装PR:

- `backend/app/modules/` の空パッケージ追加
- `auth` と `master_data` の router 分割
- `main.py` の行数を減らす
- 既存API互換を維持

次の実装PR:

- `karte` の分割
- `order_catalog` の skeleton 追加

その次:

- `rececon` の skeleton と ClaimDraft model 追加
- `gateway/orca` stub 追加
- `gateway/fhir` へ既存 FHIR adapter を移動
