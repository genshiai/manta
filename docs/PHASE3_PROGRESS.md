# Phase 3 Progress

更新日: 2026-05-17

Phase 3 は「入院・病棟・AI」。Phase 2 の外来支援を土台に、入院エピソード、病棟、病床、看護記録、指示簿、経過表、サマリ、AI 要約へ広げる。

## 現在地

2026-05-08 に Phase 3 の基盤として、次を実装した。

- `ward_masters`: 病棟 master
- `bed_masters`: 病床 master
- `admissions`: 入院エピソード
- `inpatient_instructions`: 入院指示
- `nursing_notes`: 看護記録 SOAP
- `GET /api/inpatient/admissions`: 病棟患者一覧
- `POST /api/patients/{patient_id}/admissions`: 入院申込
- `POST /api/inpatient/admissions/{admission_id}/transfer`: 転棟・転床
- `POST /api/inpatient/admissions/{admission_id}/permit-discharge`: 退院許可
- `POST /api/inpatient/admissions/{admission_id}/discharge`: 退院実施
- `GET /api/inpatient/beds`: 病床ボード
- `PATCH /api/inpatient/beds/{bed_id}`: 病床状態更新
- `GET /api/inpatient/admissions/{admission_id}/progress`: 入院経過表
- `GET/POST /api/inpatient/admissions/{admission_id}/instructions`: 入院指示
- `PATCH /api/inpatient/instructions/{instruction_id}`: 指示ステータス更新
- `GET/POST /api/inpatient/admissions/{admission_id}/nursing-notes`: 看護記録
- ホームの入院タブを mock ではなく入院 API データで表示
- 専用の病棟ワークスペースを追加し、入院患者選択、指示簿、看護記録 SOAP 追加を同一画面で扱えるようにした
- 病床ボードを病棟ワークスペースへ追加し、空床/使用中/清掃中/使用不可の表示、清掃後の空床化、停止/再開、選択患者の転床操作に対応した
- 経過表を追加し、バイタル、検査、検査オーダ、処方、入院指示、看護記録を日付軸で横断表示できるようにした
- `inpatient_documents`: 入退院文書
- `GET/POST /api/inpatient/admissions/{admission_id}/documents`: 入退院文書一覧・ドラフト作成
- `PATCH /api/inpatient/documents/{document_id}`: 文書本文/状態更新
- `GET /api/inpatient/admissions/{admission_id}/summary-draft`: 入院経過要約案
- `inpatient_events`: 入院イベント履歴
- `inpatient_pathway_assignments` / `inpatient_pathway_tasks`: クリティカルパス割当と日別タスク
- `inpatient_pathway_masters` / `inpatient_pathway_task_masters`: 疾患/診療科別クリティカルパス master
- `inpatient_ai_summary_reviews`: Mock AI 要約案の採用/差し戻し履歴
- `inpatient_discharge_plans`: 退院計画・会計候補レビュー
- `claim_drafts` / `claim_review_issues`: 退院会計候補から作る請求前レビュー
- `facility_claim_rules`: 施設別算定ルール
- `claim_transmissions`: ORCA/レセコン adapter 送信履歴
- `claim_draft_lines`: 薬剤・検査・処置・入院基本料の請求明細候補
- `orca_adapter_settings`: ORCA adapter の接続設定
- `claim_line_adjustments`: 点数調整・摘要候補・病名要件などの請求点検提案
- `GET /api/inpatient/admissions/{admission_id}/events`: 入院イベント履歴
- `GET/POST /api/inpatient/admissions/{admission_id}/pathway`: クリティカルパス取得・開始
- `GET /api/inpatient/pathway-masters`: クリティカルパス master 一覧
- `PATCH /api/inpatient/pathway-tasks/{task_id}`: パスタスク完了・逸脱
- `GET/POST /api/inpatient/admissions/{admission_id}/summary-reviews`: AI 要約レビュー履歴
- `GET/PUT /api/inpatient/admissions/{admission_id}/discharge-plan`: 退院時処方メモ・会計候補レビュー
- `GET/POST /api/inpatient/admissions/{admission_id}/claim-draft`: 入院退院計画から請求ドラフト取得・作成
- `PATCH /api/claim-drafts/{claim_draft_id}`: 請求ドラフト状態更新
- `PATCH /api/claim-line-adjustments/{adjustment_id}`: 点数調整提案の採用/無視と請求合計点数への反映
- `POST /api/claim-drafts/{claim_draft_id}/transmissions/orca`: ORCA adapter 送信試行
- `GET/POST/PATCH /api/admin/claim-rules`: 施設別算定ルール管理
- `GET/PUT /api/admin/orca/settings`: ORCA adapter 接続設定
- 病棟ワークスペースで入院診療計画書、退院サマリ、退院時指導文書のドラフト生成、本文確認、署名状態への更新に対応した
- 病棟ワークスペースで入院経過要約案を表示し、そのまま退院サマリ文書へ保存できるようにした
- 病棟ワークスペースで標準クリティカルパス開始、日別タスク完了、逸脱記録、入院イベント履歴、要約案の採用/差し戻しを操作できるようにした
- 病棟ワークスペースでクリティカルパス master を選択して開始できるようにした
- パス割当時に master の day offset から予定日を自動計算し、担当職種と予定時間をタスクへ展開するようにした
- 病棟ワークスペースで退院時処方メモ、退院後方針、会計候補を確認し、レビュー済/退院準備完了に更新できるようにした
- 退院会計候補に候補ID、根拠、確認状態、信頼度を持たせ、入院日数、退院支援、処方、実施済み指示、検査オーダから構造化して生成するようにした
- `receipt_medical_practice_masters`: 診療行為レセ電 master の受け皿
- `receipt_comment_masters`: 摘要欄コメント master の受け皿
- 退院会計候補へ診療行為レセ電コード候補、名称、点数、単位を付与し、UIで確認できるようにした
- 支払基金 医科診療行為マスター importer を追加し、`s_ALL*.zip` / 展開済み CSV から `receipt_medical_practice_masters` に同期できるようにした
- 支払基金 コメントマスター importer を追加し、`c_ALL*.zip` / 展開済み CSV から `receipt_comment_masters` に同期、API検索できるようにした
- 退院計画の会計候補から請求ドラフトを作成し、レセ電コード不足、要確認候補、傷病名コード確認を `ClaimReviewIssue` として保存・表示できるようにした
- 施設別算定ルールを `facility_claim_rules` として seed 同期し、入院基本料、退院支援、投薬、検査の必要記録を請求ドラフト作成時に照合するようにした
- Mock ORCA adapter を追加し、送信 payload、戻り status、エラー内容を `claim_transmissions` に保存し、病棟ワークスペースから送信試行と結果確認ができるようにした
- 退院計画候補から `claim_draft_lines` を生成し、処方、検査オーダ、実施済み指示、入院基本料を個別明細として保存・表示するようにした
- 設定画面に算定ルール管理と ORCA adapter 設定を追加し、管理者が rule の有効化、重要度、対象カテゴリ、接続 mode/base URL を更新できるようにした
- ORCA adapter の HTTP mode を追加し、`base_url`、BASIC 認証の operator/password、請求送信 endpoint、接続確認 endpoint を設定できるようにした。HTTP 送信時は ORCA レスポンス本文と HTTP status を `claim_transmissions` に保存する
- 施設別算定ルールに `conditions` / `actions` JSON を追加し、明細単位の点数調整、摘要候補、病名要件、同月回数確認を `claim_line_adjustments` と `ClaimReviewIssue` に展開できるようにした
- `claim_line_adjustments` の提案を病棟UIで採用/無視できるようにし、採用済みの `points_delta` だけを `ClaimDraft.total_points` へ再計算反映する承認フローを追加した
- 施設別算定ルールの `actions.comment` / `actions.comment_code` から `receipt_comment_masters` を照合し、`ClaimLineAdjustment` にコメントコード・パターン付きの摘要候補を保持できるようにした
- `claim_draft_lines` の `receipt_code` / `receipt_name` / `points` / `unit` を病棟ワークスペースの請求点検 drawer から補正できるようにした
- `GET /api/claim-draft-lines/{line_id}/receipt-code-candidates`: 診療行為マスターから明細名ベースのレセ電コード候補を返す
- `PATCH /api/claim-draft-lines/{line_id}/receipt-code`: 請求明細のレセ電コードを補正し、該当する未解決コード issue を resolved にする
- `POST /api/claim-drafts/{claim_draft_id}/recheck`: 請求ドラフトのコード未解決 issue を再生成/解決し、合計点数と送信可否状態を再評価する
- `GET /api/claim-drafts/{claim_draft_id}/transmissions/orca/preview`: 現在の請求ドラフトから ORCA/レセコン送信前 payload preview を生成し、送信可能明細、停止明細、error/warning 件数を返す
- 病棟ワークスペースの請求点検 drawer に、未解決 issue の種類別表示、コード補正、再点検、送信前 preview、送信 payload preview を追加した

## Phase 3 実装範囲

| 領域 | 状態 | 次に必要なこと |
| --- | --- | --- |
| 入院申込・入院決定 | backend API 済み | 患者画面/ホームから入院申込・病床割当する UI |
| 退院許可・退院実施 | backend API 済み | 退院会計の本番レセコン連携 |
| 退院時処方・会計候補 | レセ電候補付き API/UI + importer + ClaimDraft/Line + 施設別rule DSL/UI + 点検提案承認 + コード補正 + 再点検 + 送信前preview + ORCA HTTP adapter 済み | 医事向け一括点検キュー、実ORCA環境での疎通確認、返戻/査定 workflow、診療報酬ルールの網羅 |
| 転棟・転床 | backend API/UI 済み | D&D 操作、移動予定管理 |
| 病棟患者一覧 | API + ホーム表示済み | 病棟/チーム/未実施/退院予定フィルタ強化 |
| 病床管理一覧 | master/API/UI 済み | 病床稼働率、病床種別、男女/感染制御制約 |
| 指示簿 | データ/API/UI 済み | 指示受け、職種別フィルタ、期限超過表示 |
| 看護記録 SOAP | データ/API/UI 済み | フォーカス/経過表連動、記録テンプレート |
| 経過表 | API/UI 済み | 表示期間切替、看護必要度、入院イベント、出力最適化 |
| 入院診療計画書 | API/UI 済み | 編集履歴、印刷レイアウト、患者署名 |
| サマリ管理 | 退院サマリ API/UI 済み | 承認フロー、診療情報提供書連携 |
| クリティカルパス | master/API/UI 済み | 職種別フィルタ、パス改訂履歴 |
| AI カルテ要約 | Mock 要約 API/UI + 採用履歴 済み | LLM 接続、プロンプト監査、引用元表示 |

## 次の実装順

1. 医事・レセプトワークスペース
   - 請求ドラフト一覧、未解決 issue、送信待ち、送信エラー、ORCA送信履歴を患者横断で確認できる一括点検キューを追加する。
2. 退院会計の本番連携
   - 実ORCA環境での疎通確認、ORCA payload 仕様への最終変換、返戻/査定 workflow を追加する。
3. クリティカルパス運用強化
   - 職種別フィルタ、パス改訂履歴を追加する。

## 導線と役割

請求点検は通常の医師・看護師が日常的に触る画面ではなく、退院前や医事確認時に触る「医事・会計」領域として扱う。

- 医師: 病棟ワークスペースで退院計画、退院時処方、文書、必要な実施記録を確認する
- 看護師: 病棟ワークスペースで指示実施、看護記録、経過表、文書署名状況を確認する
- 医事/事務: 請求ドラフト、未解決 issue、コード補正、送信前preview、ORCA/レセコン送信履歴を確認する
- 管理者: 設定画面で施設別算定 rule、ORCA adapter、マスター同期を管理する

現状は病棟患者ごとの `請求点検` drawer から入る。次は患者横断の `医事・レセプトワークスペース` を作り、医事/事務が「未解決」「送信待ち」「送信エラー」「返戻」を一括で処理できる導線へ広げる。
