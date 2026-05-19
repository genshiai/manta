# Phase 3 Progress

更新日: 2026-05-18

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
- `GET /api/claim-drafts`: 患者横断の請求ドラフト一覧 API を追加し、未解決 issue、コード未解決、送信待ち、送信エラー、最新送信結果を集計して返すようにした
- `GET /api/claim-drafts/{claim_draft_id}`: 医事ワークスペースから請求ドラフト詳細を取得できる API を追加した
- `医事・レセプト` ワークスペースを追加し、医事/事務が請求ドラフト、未解決 issue、送信待ち、送信エラーを患者横断で確認できるようにした
- 医事ワークスペースの詳細 drawer から、コード補正、点検提案の採用/無視、再点検、送信前 preview、ORCA 送信、レビュー済/送信待ち更新を実行できるようにした
- `claim_return_events`: ORCA送信差戻し、返戻、査定、通知を請求ドラフト単位で管理する workflow table を追加した
- `GET /api/claim-return-events` / `PATCH /api/claim-return-events/{event_id}` / `POST /api/claim-drafts/{claim_draft_id}/return-events`: 返戻・査定キューの一覧、対応ステータス更新、手動イベント作成 API を追加した
- ORCA送信が `rejected` / `error` の場合、未対応の返戻・査定イベントを自動作成するようにした
- 医事ワークスペースに返戻・査定キューを追加し、未対応/対応中/解決/対象外の状態更新と請求詳細 drawer への導線を追加した
- 医事ワークスペースの請求詳細 drawer に、送信履歴同士の明細差分、返戻/査定イベントと現在明細の差分、返戻/査定イベントからの再点検・送信・結果反映による再請求導線を追加した
- `GET /api/billing/monthly-close`: 月次締めサマリ API を追加し、請求件数、未送信、送信済、返戻/査定、再請求待ち、未解決 issue、担当者別キューを返すようにした
- 医事ワークスペースに月次締めワークスペースを追加し、締め対象月ごとの締め前チェック、状態別集計、担当者別キューを確認できるようにした
- `monthly_claim_closes`: 月次締めの確定/取消履歴、締め時点 snapshot、確定者/取消者/取消理由を監査用に保存する table を追加した
- `POST /api/billing/monthly-close/{month}/close` / `POST /api/billing/monthly-close/{month}/cancel`: 締め前 blocker を確認した月次締め確定、強制締め、取消 API を追加し、監査ログへ記録するようにした
- 医事ワークスペースの月次締め内で、締め確定、強制締め、取消理由付き取消、確定/取消状態の監査表示まで完結できるようにした
- 月次締めの承認依頼/管理者承認 API を追加し、担当者が依頼、管理者が承認確定、必要時に取消する運用に対応した
- 医事ワークスペースに返戻/査定理由の月次集計と請求監査ログを追加し、理由コード別の未対応/解決件数と締め・再請求履歴を同じ画面で確認できるようにした
- 返戻/査定キューに担当者フィルタ、自分への割当、管理者による未割当戻しを追加し、非管理者は未割当または自分担当のみ更新できるようにした
- `GET /api/claim-return-events/analytics/compare`: 返戻/査定理由の前月比較 API を追加し、総件数、未対応件数、理由コード別 delta を返すようにした
- `GET /api/claim-return-events/analytics/trend`: 返戻/査定の期間推移 API を追加し、直近Nか月の総件数、未対応、解決、返戻/査定件数、最多理由を返すようにした
- `GET /api/claim-return-events/sla`: 担当者別SLA API を追加し、未対応、期限超過、48時間以内、期限未設定を集計するようにした
- `GET /api/claim-return-events/sla/alerts` / `POST /api/claim-return-events/sla/escalate`: SLA通知と管理者エスカレーション API を追加し、期限超過/期限接近/期限未設定を検出して担当を引き上げられるようにした
- `GET /api/claim-transmissions`: 患者情報付きの送信/再請求履歴検索 API を追加し、対象月、status、検索語、再請求のみで絞り込めるようにした
- 医事ワークスペースに返戻/査定の期間推移、担当者別SLA、SLA通知、管理者エスカレーション、送信・再請求監査の詳細絞り込みを追加し、締め前に滞留と再請求履歴を確認できるようにした
- ORCA adapter 設定に `response_mappings` を追加し、施設別の正規表現、理由コード、severity、カテゴリで ORCA 応答を上書きマッピングできるようにした
- ORCA応答の正規化を拡張し、返戻、査定、病名要件、摘要要件、回数制限、併算定不可、同月算定を理由コードへマッピングするようにした
- ORCA送信結果を `normalized` として正規化し、HTTP status、受理可否、構造化理由、エラーメッセージを送信履歴と返戻/査定イベントに残すようにした
- 施設別算定 rule DSL の JSON export/import API と管理 UI を追加し、同月算定、併算定不可、病名要件、摘要要件、回数制限のプリセットを登録フォームへ反映できるようにした
- 病棟ワークスペースに看護必要度サマリ、クリティカルパスの職種別フィルタ、パス開始/改訂入口、入退院文書の印刷HTML出力、承認/署名導線を追加した

## Phase 3 実装範囲

| 領域 | 状態 | 次に必要なこと |
| --- | --- | --- |
| 入院申込・入院決定 | backend API 済み | 患者画面/ホームから入院申込・病床割当する UI |
| 退院許可・退院実施 | backend API 済み | 退院会計の本番レセコン連携 |
| 退院時処方・会計候補 | レセ電候補付き API/UI + importer + ClaimDraft/Line + 施設別rule DSL/UI/import/export + 点検提案承認 + コード補正 + 再点検 + 送信前preview + 患者横断の医事ワークスペース詳細 drawer + 月次締め承認/確定/取消 + 返戻/査定キュー + 担当制御/SLA通知/エスカレーション + 理由集計/前月比較/期間推移 + 送信履歴比較 + 明細差分 + 再請求導線/監査検索 + ORCA HTTP adapter/response normalization/施設別mapping 済み | 実ORCA環境での疎通確認、診療報酬ルールの網羅、ORCA実レスポンスサンプルによるmapping精度向上 |
| 転棟・転床 | backend API/UI 済み | D&D 操作、移動予定管理 |
| 病棟患者一覧 | API + ホーム表示済み | 病棟/チーム/未実施/退院予定フィルタ強化 |
| 病床管理一覧 | master/API/UI 済み | 病床稼働率、病床種別、男女/感染制御制約 |
| 指示簿 | データ/API/UI 済み | 指示受け、職種別フィルタ、期限超過表示 |
| 看護記録 SOAP | データ/API/UI 済み | フォーカス/経過表連動、記録テンプレート |
| 経過表 | API/UI 済み | 表示期間切替、看護必要度、入院イベント、出力最適化 |
| 入院診療計画書 | API/UI 済み | 編集履歴、印刷レイアウト、患者署名 |
| サマリ管理 | 退院サマリ API/UI 済み | 承認フロー、診療情報提供書連携 |
| クリティカルパス | master/API/UI + 職種別フィルタ + 開始/改訂入口 済み | 改訂履歴の永続化、版管理 |
| AI カルテ要約 | Mock 要約 API/UI + 採用履歴 済み | LLM 接続、プロンプト監査、引用元表示 |

## 次の実装順

1. 退院会計の本番連携
   - 実ORCA環境での疎通確認、ORCA payload 仕様への最終変換、実レスポンスサンプルからのmapping検証を追加する。
2. 医事ワークスペース運用強化
   - SLA通知の配信先設定、再請求監査のCSV export、返戻/査定理由の期間比較グラフを追加する。
3. クリティカルパス運用強化
   - パス改訂履歴の永続化、版管理、職種別 task template を追加する。

## 導線と役割

請求点検は通常の医師・看護師が日常的に触る画面ではなく、退院前や医事確認時に触る「医事・会計」領域として扱う。

- 医師: 病棟ワークスペースで退院計画、退院時処方、文書、必要な実施記録を確認する
- 看護師: 病棟ワークスペースで指示実施、看護記録、経過表、文書署名状況を確認する
- 医事/事務: 請求ドラフト、未解決 issue、コード補正、送信前preview、ORCA/レセコン送信履歴を確認する
- 管理者: 設定画面で施設別算定 rule、ORCA adapter、マスター同期を管理する

現状は病棟患者ごとの `請求点検` drawer に加えて、患者横断の `医事・レセプトワークスペース` から「未解決」「送信待ち」「送信エラー」「送信済み」を確認し、詳細 drawer でコード補正、点検提案の採用/無視、再点検、送信前 preview、ORCA送信まで処理できる。さらに ORCA 差戻しや手動登録した返戻/査定をキュー化し、未対応/対応中/解決/対象外の状態管理、担当者割当と非管理者更新制限、送信履歴比較、返戻/査定時点と現在明細の差分確認、再請求、月次締め前チェック、担当者別キュー、締め承認依頼/管理者承認/取消、返戻/査定理由の月次集計/前月比較/期間推移、担当者別SLA、SLA通知/エスカレーション、送信・再請求監査の詳細絞り込み、請求監査ログ、ORCA応答の正規化理由保存と施設別mappingまでできる。病棟側も看護必要度サマリ、職種別パスフィルタ、文書印刷/承認導線まで広がった。次は実ORCA環境での疎通確認、SLA通知の配信先設定、再請求監査CSV exportに進む。
