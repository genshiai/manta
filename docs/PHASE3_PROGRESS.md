# Phase 3 Progress

更新日: 2026-05-08

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
- `GET/POST /api/inpatient/admissions/{admission_id}/instructions`: 入院指示
- `GET/POST /api/inpatient/admissions/{admission_id}/nursing-notes`: 看護記録
- ホームの入院タブを mock ではなく入院 API データで表示

## Phase 3 実装範囲

| 領域 | 状態 | 次に必要なこと |
| --- | --- | --- |
| 入院申込・入院決定 | backend API 済み | 患者画面/ホームから入院申込・病床割当する UI |
| 退院許可・退院実施 | backend API 済み | 退院サマリ、退院時処方、退院会計への連携 |
| 転棟・転床 | backend API 済み | 病床管理画面から D&D / 選択で移動 |
| 病棟患者一覧 | API + ホーム表示済み | 病棟/チーム/未実施/退院予定フィルタ強化 |
| 病床管理一覧 | master/API 基盤済み | 病床ボード、空床/清掃中/使用不可の更新 UI |
| 指示簿 | データ/API 済み | 指示受け、実施、未実施一覧、期限順表示 |
| 看護記録 SOAP | データ/API 済み | 病棟画面での入力 UI、フォーカス/経過表連動 |
| 経過表 | 未着手 | バイタル、検査、指示、看護記録を日別グリッドに集約 |
| 入院診療計画書 | 未着手 | テンプレート + 患者/病名/入院目的の差し込み |
| サマリ管理 | 未着手 | 入院サマリ、退院サマリ、AI 要約の保存 |
| クリティカルパス | 未着手 | パス master、日別タスク、逸脱記録 |
| AI カルテ要約 | 未着手 | 期間指定 SOAP/検査/処方/看護記録の要約 API |

## 次の実装順

1. 病棟ワークスペース UI
   - 病棟患者一覧、病床ボード、入院指示、看護記録を同じ画面に置く。
2. 指示簿
   - `pending/done/cancelled` の更新 API と、未実施・期限超過・職種別フィルタを実装する。
3. 経過表
   - バイタル、検査、処方、入院指示、看護記録を日付軸で固定表示する。
4. 入退院文書
   - 入院診療計画書、退院サマリ、退院時指導文書をテンプレート化する。
5. AI 要約
   - 入院経過、看護記録、検査推移、処方変更から要約案を生成し、人間が保存確定する。
