# Phase 3 Progress

更新日: 2026-05-09

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
- 病棟ワークスペースで入院診療計画書、退院サマリ、退院時指導文書のドラフト生成、本文確認、署名状態への更新に対応した

## Phase 3 実装範囲

| 領域 | 状態 | 次に必要なこと |
| --- | --- | --- |
| 入院申込・入院決定 | backend API 済み | 患者画面/ホームから入院申込・病床割当する UI |
| 退院許可・退院実施 | backend API 済み | 退院時処方、退院会計への連携 |
| 転棟・転床 | backend API/UI 済み | D&D 操作、移動履歴、移動予定管理 |
| 病棟患者一覧 | API + ホーム表示済み | 病棟/チーム/未実施/退院予定フィルタ強化 |
| 病床管理一覧 | master/API/UI 済み | 病床稼働率、病床種別、男女/感染制御制約 |
| 指示簿 | データ/API/UI 済み | 指示受け、職種別フィルタ、期限超過表示 |
| 看護記録 SOAP | データ/API/UI 済み | フォーカス/経過表連動、記録テンプレート |
| 経過表 | API/UI 済み | 表示期間切替、看護必要度、入院イベント、出力最適化 |
| 入院診療計画書 | API/UI 済み | 編集履歴、印刷レイアウト、患者署名 |
| サマリ管理 | 退院サマリ API/UI 済み | AI 要約案、承認フロー、診療情報提供書連携 |
| クリティカルパス | 未着手 | パス master、日別タスク、逸脱記録 |
| AI カルテ要約 | 未着手 | 期間指定 SOAP/検査/処方/看護記録の要約 API |

## 次の実装順

1. AI 要約
   - 入院経過、看護記録、検査推移、処方変更から要約案を生成し、人間が保存確定する。
2. クリティカルパス
   - パス master、日別タスク、逸脱記録を入院エピソードに紐づける。
