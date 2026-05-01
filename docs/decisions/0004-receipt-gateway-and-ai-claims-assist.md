# 0004. MantaレセコンとAI算定補助層を採用

- **Status**: Accepted
- **Date**: 2026-05-01
- **Deciders**: Manta product / engineering
- **Tags**: rececon, receipt, billing, claims, orca, master-data, ai, architecture

## Context（なぜこの決定が必要か）

Manta は AI カルテとして、診療録・オーダ・患者安全情報を一体で扱う。一方で、日本の保険請求は診療報酬点数表、レセプト電算処理システム基本マスター、医薬品 / 特定器材 / 傷病名マスター、施設ごとの医事運用、保険組合せ、公費、加算、コメント、病名妥当性に強く依存する。

Manta は「AIカルテ」として診療録だけを扱うのではなく、オーダ、病名、算定、会計、レセプトレビューまで含む次世代カルテシステムを目指す。そのため、プロダクトとしては **Mantaカルテ** と **Mantaレセコン** を同一プラットフォーム上に持つ。

ただし、カルテ UI から直接 ORCA などのレセコン API 形式を扱うと、以下の問題が起きる。

- 医師向けの自然なオーダ UI が、レセコン入力粒度に引っ張られる
- ORCA 以外のレセコンや病院 HIS への接続が難しくなる
- AI による算定候補・病名不足・コメント不足の補助を入れる場所が曖昧になる
- レセプト請求は医事・医師確認が必要な高リスク領域であり、完全自動化前提にできない

ORCA には日レセ API があり、患者基本情報、受付、予約、診療行為などの API が提供されている。CLAIM 通信機能は 2026 年 3 月末廃止予定のため、今後の ORCA 連携は CLAIM ではなく日レセ API adapter 前提にする。

## Decision（何を決めたか）

Manta は最終的に **Mantaレセコン** を正式モジュールとして持つ。短期的には既存レセコンを置き換えず、**レセコン補助** と **レセコン連携** から始める。

外向きのプロダクト名は以下とする。

- **Mantaカルテ**: 診療録、オーダ、病名、患者安全、医師向けAI
- **Mantaレセコン**: 算定、会計、レセプト、返戻 / 査定レビュー、医事向けAI
- **Manta外部連携**: ORCA、他社レセコン、RIS/LIS/PACS、FHIR/API 連携

実装上は Manta 内部に **Billing Core** と **レセコン連携層** を置き、ORCA は最初の外部 adapter として実装する。`Receipt Gateway` は内部アーキテクチャ用語として使ってよいが、ユーザー向けには「レセコン連携」と呼ぶ。

```txt
Mantaカルテ / Order UI
  -> Order Catalog
  -> Billing Core
  -> レセコン連携層
  -> ORCA Adapter / future receipt adapters
```

責務を以下に分ける。

- **Order Catalog**: 医師が選ぶ臨床的な候補を管理する。例: 胸部X線、HbA1cセット、糖尿病フォローセット。
- **Master Sync**: 診療行為、医薬品、特定器材、傷病名、修飾語、コメント等の公式マスターを取り込む。
- **Mantaレセコン**: 算定、会計、レセプト作成、返戻 / 査定レビュー、月次請求を担う将来モジュール。
- **Billing Core**: オーダ、病名、保険、公費、加算、コメント、施設ルールから算定候補と警告を生成する。
- **AI Claims Assist**: 算定漏れ、病名不足、コメント不足、過剰 / 重複候補、病名とオーダの整合性を説明付きで提示する。
- **レセコン連携層 / Receipt Gateway**: レセコン共通インターフェースを提供し、送信前レビュー、送信、結果取得、エラー正規化を行う。
- **ORCA Adapter**: ORCA 日レセ API への変換、送受信、ORCA 固有エラーの正規化を閉じ込める。

AI は最終請求を自動確定しない。AI の役割は **候補生成とレビュー補助** に限定し、会計送信・レセプト請求の確定前には人間の確認を必須にする。

backend は最初から物理分割しない。既存の FastAPI / PostgreSQL を維持し、モジュラーモノリスとして `chart`, `rececon`, `integrations` の境界を作る。Mantaレセコンを単体販売する、レセコン側のリリースサイクルが独立する、月次請求バッチや改定対応の負荷特性が分かれる、などの条件が来た時点で `manta-rececon-api` として物理分割する。

## Consequences（帰結）

### Positive

- プロダクトとして「全部入りのAIカルテ」を目指しつつ、カルテとレセコンの責務を分離できる
- Manta のカルテ UI をレセコン入力画面に寄せず、臨床ワークフロー中心に保てる
- ORCA 以外のレセコンや病院向け HIS adapter を後から追加できる
- 公式マスター、施設別マッピング、AI 補助を同じ設計内に収められる
- レセプト業務の難しさを隠さず、送信前レビューと説明可能な警告として扱える
- オーダリングマシンとしての Manta と、医事会計ソフトとしてのレセコンの境界が明確になる

### Negative

- Master Sync、Billing Core、Mantaレセコン、レセコン連携層、ORCA Adapter の分だけ実装量が増える
- 点数改定、マスター差分、施設別ルールの運用負荷を持つ
- AI 補助の品質評価、説明責任、誤提案時の UX 設計が必要になる
- レセコン連携テストには ORCA 環境または互換 test double が必要になる

### Neutral / Trade-offs

- Phase 1 の外来 MVP ではレセコン送信まで必須にしない。ただしオーダ / 病名 / マスターのデータ構造は後で算定候補に変換できる形へ寄せる。
- 初期段階では Manta は Claim を正本にしない。正本はカルテ / オーダ / 病名で、ClaimDraft は派生データとして扱う。Mantaレセコンが本格化した段階で、会計 / レセプト正本の責務を Mantaレセコン側へ移す。
- レセコン側で確定した会計結果、エラー、収納状態は Manta に同期して表示する。

## Alternatives Considered（他に検討した選択肢）

- **ORCA 直結**: 実装初期は速いが、Manta UI とドメインモデルが ORCA 固有形式に引っ張られるため不採用。
- **Phase 1 から完全レセコンを内製する**: 請求・収納・返戻・月次運用まで一気に内製する必要があり、外来カルテMVPが止まるため不採用。
- **CSV マスターだけ取り込み、レセコン連携しない**: オーダ候補は作れるが、現場導入時に会計へ流れず価値が弱いため不採用。
- **AI にレセプト確定まで任せる**: 医事会計上のリスクが高く、説明責任と最終確認が必要なため不採用。

## Lessons Learned / 振り返り（後追い記入）

未記入。

## References

- ORCA 日レセ API 仕様: https://www.orca.med.or.jp/receipt/tec/api/overview.html
- ORCA CLAIM 通信機能廃止のお知らせ: https://www.orca.med.or.jp/news/2025-01_CLAIM.html
- 社会保険診療報酬支払基金 基本マスター: https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/
- 関連: [標準病名マスター運用](../DIAGNOSIS_MASTER.md)
- 関連: [処方検索 / サジェスト UX 方針](../PRESCRIPTION_SEARCH_UX.md)
- 関連: [PMDA 電子添文同期方針](../PMDA_SYNC_STRATEGY.md)
- 関連: [Backend Module Restructure Plan](../BACKEND_MODULE_RESTRUCTURE_PLAN.md)
