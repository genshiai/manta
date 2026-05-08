# Master Data Downloads

更新日: 2026-05-08

Manta Phase 2 で必要な外部標準データの取得先と使い分け。

原本ファイルは repo に commit しない。`/Users/daichi/Downloads` などに置き、import script で DB へ投入する。

2026-05-08 時点で、公開 URL から直接取得できる薬剤系 master は Codex 側で取得済み。保存先は `/Users/daichi/Downloads/manta-master-data/`。

## まず結論

薬剤安全チェックと薬剤検索を前に進めるため、次の順で取得する。

1. 厚労省 薬価基準収載品目リスト
2. PMDA 医療用医薬品添付文書 XML
3. 支払基金 レセプト電算 医薬品マスター
4. MEDIS 医薬品 HOT コードマスター
5. 厚労省 一般名処方マスター

`/Users/daichi/Downloads/tp20260415-01_01.xlsx` は 1 の「内用薬」。Manta の薬剤 master の YJ 実コード化に使える。

## 足りないデータ

2026-05-08 時点で、公開取得できる薬剤系 master は投入済み。残る外部データは、PMDA 全件 XML、一般名処方 master、病名 master 実ファイル、検査項目 master。

| 実装 | 足りないデータ | 必須度 | 理由 |
| --- | --- | --- | --- |
| PMDA 相互作用の全件化 | PMDA 添文 XML 全件または採用薬分 | A | PMDA はメディナビ/マイ医薬品集からの一括出力が必要。XML を置けば importer はディレクトリ単位で投入できる |
| 一般名処方 master | 厚労省 一般名処方 master Excel | B | 一般名処方、後発品提案、成分ベース検索をさらに正確にする |
| 標準病名 master 実ファイル | MEDIS 標準病名 master / 索引 / 履歴 | A | ICD10 索引、同義語、廃止病名移行を本番データ化する |
| 検査項目 master | 施設検査項目 CSV、必要に応じて JLAC10/LOINC | B | 検査時系列の単位、基準値、表示名、軸固定を施設運用に合わせる |

厚労省薬価 Excel、支払基金、HOT、経過措置、長期収載品 importer は実装済みで、2026-05-08 に実 DB へ投入済み。PMDA XML importer も実装済みだが、全件 XML 原本は PMDA 側の一括ダウンロード操作が必要。

## 2026-05-08 実投入結果

保存先:

```text
/Users/daichi/Downloads/manta-master-data/
  20260415-mhlw-drug-price/
  20260414-ssk-receipt-drug/
  20260331-medis-hot/
  20260312-ssk-long-term-listed/
  20260305-ssk-transitional-drugs/
```

DB 件数:

| テーブル | 件数 | 原本 |
| --- | ---: | --- |
| `prescription_catalog_masters` | 12,316 | 厚労省 薬価基準収載品目リスト 内用薬・注射薬・外用薬・歯科用薬剤 |
| `receipt_drug_masters` | 18,396 | 支払基金 レセプト電算 医薬品マスター |
| `hot_drug_code_mappings` | 98,724 | MEDIS HOT 全件 CSV 2 ファイル |
| `receipt_transitional_drugs` | 458 | 支払基金 経過措置医薬品一覧 |
| `receipt_long_term_listed_drugs` | 776 | 支払基金 長期収載品の選定療養対象一覧 |

取得済みだが importer 未実装:

- `/Users/daichi/Downloads/manta-master-data/20260415-mhlw-drug-price/tp20260415-01_05.xlsx`
  - 「後発医薬品の有無」ファイル。薬価 Excel 本体にも先発/後発系の列があるため Phase 2 の最低限は足りているが、後発品あり/なし表示を厚労省別表で厳密化するなら importer を追加する。

## 取得・実装ステータス

原本は repo 外に保存する。推奨置き場は `/Users/daichi/Downloads/manta-master-data/YYYYMMDD/`。

| 優先 | データ | 取得状況 | 実装状況 | 次アクション |
| --- | --- | --- | --- | --- |
| A | 厚労省 薬価基準収載品目リスト 内用薬・注射薬・外用薬・歯科用薬剤 | 取得済み: `/Users/daichi/Downloads/manta-master-data/20260415-mhlw-drug-price/` | importer 実装済み・投入済み | 後発医薬品の有無 Excel の追加 importer は必要なら実装する |
| A | PMDA 医療用医薬品添付文書 XML | ロキソニン XML で検証済み。全件/採用薬分は未取得 | importer 実装済み | PMDA メディナビから XML 全件または採用薬分を取得する |
| A | 支払基金 レセプト電算 医薬品マスター | 取得済み: `/Users/daichi/Downloads/manta-master-data/20260414-ssk-receipt-drug/` | importer 実装済み・投入済み | 定期更新運用を automation / バッチ化する |
| A | MEDIS 医薬品 HOT コードマスター | 取得済み: `/Users/daichi/Downloads/manta-master-data/20260331-medis-hot/` | importer 実装済み・投入済み | 定期更新運用を automation / バッチ化する |
| B | 支払基金 経過措置医薬品一覧 | 取得済み: `/Users/daichi/Downloads/manta-master-data/20260305-ssk-transitional-drugs/` | importer 実装済み・投入済み | 定期更新運用を automation / バッチ化する |
| B | 支払基金 長期収載品の選定療養対象一覧 | 取得済み: `/Users/daichi/Downloads/manta-master-data/20260312-ssk-long-term-listed/` | importer 実装済み・投入済み | 定期更新運用を automation / バッチ化する |
| B | 厚労省 一般名処方マスター | 未取得 | importer 未実装 | 一般名処方 Excel を取得する |
| B | 検査項目マスター | 未取得 | importer 未実装 | JLAC10/LOINC/施設検査項目 CSV の候補を決める |
| C | 標準病名マスター履歴 | main/index は対応済み。履歴ファイルは未検証 | importer 一部実装済み | MEDIS 標準病名 master の履歴ファイルを取得して列確認する |

## 推奨保存構成

```text
/Users/daichi/Downloads/manta-master-data/
  20260415-mhlw-drug-price/
    tp20260415-01_01.xlsx
    tp20260415-01_02.xlsx
    tp20260415-01_03.xlsx
    tp20260401-01_04.xlsx
    tp20260415-01_05.xlsx
  20260414-ssk-receipt-drug/
    y_ALL20260414.zip
    y_20260414.csv
    r08kaitei_20260414y.pdf
    master_3_20260501.pdf
  20260331-medis-hot/
    A_20260331_1.txt
    A_20260331_2.txt
    DLFileLayout.pdf
  20260312-ssk-long-term-listed/
    sentei_20260312.xlsx
  20260305-ssk-transitional-drugs/
    keikasoti_R08_20260305.xlsx
  pmda-package-inserts/
    xml/
```

## コードの違い

| コード | 何のコードか | 主な用途 | Manta での扱い |
| --- | --- | --- | --- |
| 薬価基準収載医薬品コード | 薬価基準に載っている医薬品の分類コード。一般に YJ コード相当として扱う | 薬剤名、規格、薬価、YJ 連携 | 薬剤検索と PMDA XML 紐付けの主キー候補 |
| YJ コード | 医療用医薬品を品目単位で識別するコード | PMDA 添文、薬剤安全チェック | Manta の `yj_code` |
| レセプト電算コード | 診療報酬請求で使うコード | レセプト、会計、請求 | Phase 2 後半から必須 |
| HOT コード | MEDIS の医薬品コード体系。YJ、レセ電、包装単位などをつなぐ | コード変換、一般名処方、包装単位 | YJ とレセ電の対応表として使う |

重要: PMDA XML には薬剤 master 全体は入っていない。PMDA XML は添付文書、安全性、禁忌、相互作用の原本。薬剤名一覧や薬価、後発品区分は厚労省 Excel、請求コードは支払基金、コード横断は HOT で補う。

## 1. 厚労省 薬価基準収載品目リスト

目的: 薬剤検索、YJ 実コード化、成分名、規格、メーカー、薬価、先発/後発区分の取得。

公式ページ:

- [医療保険が適用される医薬品について](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000078916.html)
- [薬価基準収載品目リストについて（令和8年4月15日適用）](https://www.mhlw.go.jp/topics/2026/04/tp20260401-01.html)

令和8年4月15日適用の取得対象:

| 区分 | ファイル | URL |
| --- | --- | --- |
| 内用薬 | `tp20260415-01_01.xlsx` | `https://www.mhlw.go.jp/topics/2026/04/xls/tp20260415-01_01.xlsx` |
| 注射薬 | `tp20260415-01_02.xlsx` | `https://www.mhlw.go.jp/topics/2026/04/xls/tp20260415-01_02.xlsx` |
| 外用薬 | `tp20260415-01_03.xlsx` | `https://www.mhlw.go.jp/topics/2026/04/xls/tp20260415-01_03.xlsx` |
| 歯科用薬剤 | `tp20260401-01_04.xlsx` | `https://www.mhlw.go.jp/topics/2026/04/xls/tp20260401-01_04.xlsx` |
| 後発医薬品の有無 | `tp20260415-01_05.xlsx` | `https://www.mhlw.go.jp/topics/2026/04/xls/tp20260415-01_05.xlsx` |

`/Users/daichi/Downloads/tp20260415-01_01.xlsx` の確認結果:

- 種別: 内用薬
- 非空行数: 6,984 行
- データ行数: 6,983 品目
- 主な列: `区分`, `薬価基準収載医薬品コード`, `成分名`, `規格`, `品名`, `メーカー名`, `後発医薬品区分`, `先発医薬品`, `薬価`, `経過措置による使用期限`, `備考`
- 例: `1149019C1149` = ロキソニン細粒10%、`1149019F1560` = ロキソニン錠60mg

Manta 実装メモ:

- `backend/scripts/import_mhlw_drug_price_master.py` で Excel を直接読んで `prescription_catalog_masters` に upsert する。
- `drug_name`, `generic_name`, `strength`, `yj_code`, `category`, `manufacturer`, `drug_price`, `generic_reimbursement_flag`, `brand_flag`, `has_generic`, `transitional_expiry`, `source_note` を保持する。
- 2026-05-08 に `内服`, `注射`, `外用`, `歯科` を実投入済み。`頓服` は Manta 内の処方運用カテゴリとして残す。

取り込み例:

```bash
cd backend
uv run python scripts/import_mhlw_drug_price_master.py \
  /Users/daichi/Downloads/tp20260415-01_01.xlsx \
  --dry-run
```

## 2. PMDA 医療用医薬品添付文書 XML

目的: 禁忌、用法用量、相互作用、妊婦、高齢者、腎機能など、安全チェックの根拠データ。

公式ページ:

- [マイ医薬品集作成サービスの利用について](https://www.pmda.go.jp/safety/info-services/medi-navi/0012.html)

取得方法:

- PMDA メディナビ登録後、マイ医薬品集作成サービスを利用する。
- 「医療用医薬品添付文書一括ダウンロードサービス」で `SGML/XML` または `PDF/SGML/XML` を選ぶ。
- 全件、更新分、登録薬剤分を選べる。
- このデータは通常の公開 XLS/CSV と違い、PMDA メディナビ側の登録・操作で XML を出す。Codex が URL から直接まとめて curl するタイプの配布ではない。

Manta 実装状況:

```bash
cd backend
uv run python scripts/import_pmda_package_insert.py \
  --directory /path/to/pmda-xml-directory
```

既に XML ディレクトリ一括 import、失敗 XML レポート、添付文書セクション、相互作用テーブル取り込みに対応済み。

## 3. 支払基金 レセプト電算 医薬品マスター

目的: レセプト請求で使う医薬品コードを正にする。

公式ページ:

- [社会保険診療報酬支払基金 基本マスター](https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html)
- [医薬品マスター](https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.html)

令和8年の確認時点ファイル:

- 最終更新日: 2026-04-14
- 全件: `y_ALL20260414.zip`、18,396 件
- 改定分: `y_20260414.csv`、24 件
- ファイル仕様: 基本マスターの「レセプト電算処理システムマスターファイル仕様説明書」
- 長期収載品の選定療養: `sentei_20260312.xlsx`
- 経過措置: `keikasoti_R08_20260305.xlsx`

医薬品マスターの主な項目:

- `医薬品コード`: レセプト電算の医薬品コード
- `漢字名称`, `カナ名称`: 請求・表示用の名称
- `単位`
- `新又は現金額`: 薬価
- `後発品`
- `変更年月日`, `廃止年月日`
- `薬価基準収載医薬品コード`: YJ 相当の 12 桁コード
- `経過措置年月日又は商品名医薬品コード使用期限`
- `一般名コード`
- `一般名処方の標準的な記載`
- `一般名処方加算対象区分`
- `長期収載品関連`
- `選定療養区分`

Manta 実装メモ:

- `backend/scripts/import_receipt_drug_master.py` で `y_ALL*.zip` または展開済み CSV を直接 import する。
- `YJ -> レセ電コード` は 1 対 1 ではないため、`receipt_drug_masters` 別テーブルに全件保持する。
- `yj_code` で `prescription_catalog_masters` と照合し、請求時に通常コード、選定療養コード、廃止日、経過措置を選ぶ。
- レセプト送信・会計計算では、厚労省 Excel ではなく支払基金の医薬品コードを優先する。
- `y_ALL*.zip` は全件同期、`y_*.csv` は差分同期として扱う。

取り込み例:

```bash
cd backend
uv run python scripts/import_receipt_drug_master.py \
  /path/to/y_ALL20260414.zip \
  --dry-run
```

## 4. MEDIS 医薬品 HOT コードマスター

目的: YJ、レセ電、包装単位、販売名、一般名処方の対応を安定させる。

公式ページ:

- [医薬品コード登録システム](https://medhot.medd.jp/)
- [全件CSVダウンロード](https://medhot.medd.jp/view_download)

確認時点の全件CSV:

- 公開範囲: 2026-03-31 登録分まで
- `A_20260331_1.txt`: 全件・販売名・調剤包装単位コードファイル
- `A_20260331_2.txt`: 全件・調剤包装単位・販売包装単位・元梱包装単位コードファイル
- `DLFileLayout.pdf`: CSV ダウンロードファイルレイアウト

`A_20260331_1.txt` の主な項目:

- `販売名`
- `薬価コード`: YJ 相当の 12 桁コード
- `告示名称`
- `告示日`, `経過措置日`
- `規格`
- `区分`: 内用薬、注射薬、外用薬、歯科用薬
- `剤形`
- `包装形態`, `包装単位数`, `包装単位数単位`
- `調剤包装単位コード`, `調剤包装単位名称`
- `販売中止年月日`, `最終ロット使用期限`
- 通常無償版では HOT11 欄は予備。HOT11 が必要な場合はダウンロード ID 取得者用データが必要。

`A_20260331_2.txt` の主な項目:

- `薬価コード`
- `調剤包装単位コード`
- `販売包装単位コード`
- `元梱包装単位コード`
- `物流用JANコード`
- 通常無償版では HOT13 欄は予備。HOT13 が必要な場合はダウンロード ID 取得者用データが必要。

注意:

- 文字コードは Shift_JIS / CP932 として扱う。
- HOT は薬剤安全チェックの初期実装には必須ではないが、コード変換と包装単位までやるなら必要。
- 無償全件CSVだけでも、YJ 相当コードと調剤包装単位・販売包装単位コードの対応は取れる。
- HOT11/HOT13 自体を正式に保持したい場合は、MEDIS のダウンロード ID 取得者用データが必要。

Manta 実装メモ:

- `backend/scripts/import_hot_drug_master.py` で `A_YYYYMMDD_1.txt` または `A_YYYYMMDD_2.txt` を直接 import する。
- `hot_drug_code_mappings` に `yj_code`, `dispensing_package_code`, `sales_package_code`, `carton_package_code`, `jan_code`, `brand_name`, `package_name` を保持する。
- `prescription_catalog_masters` に直接全部持たせるより、包装単位ごとに複数行になるため別テーブルがよい。
- 処方安全チェックでは、処方薬名と PMDA 相互作用相手名の照合補助に使う。

取り込み例:

```bash
cd backend
uv run python scripts/import_hot_drug_master.py \
  /path/to/A_20260331_2.txt \
  --dry-run
```

## 5. 厚労省 一般名処方マスター

目的: 一般名処方、同一成分薬の候補表示、後発品提案。

公式ページ:

- [医療保険が適用される医薬品について](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000078916.html)
- [処方箋に記載する一般名処方の標準的な記載（一般名処方マスタ）について（令和8年4月1日適用）](https://www.mhlw.go.jp/stf/newpage_56895.html)

Manta 実装メモ:

- Phase 2 の必須ではないが、薬剤検索品質と後発品表示で効く。
- 厚労省薬価 Excel の成分名だけでは一般名処方の表記として不十分な場合があるため、別 master として扱う。

## 優先順位

| 優先 | データ | 理由 |
| --- | --- | --- |
| A1 | 厚労省 薬価基準収載品目リスト | YJ 実コード化と薬剤検索の土台 |
| A2 | PMDA 添文 XML | 禁忌、相互作用、根拠表示 |
| A3 | 支払基金 医薬品マスター | レセプト電算コード、請求連携 |
| B1 | HOT コードマスター | YJ / レセ電 / 包装単位の横断 |
| B2 | 一般名処方マスター | 一般名処方、後発品提案 |

## 実装別の外部データ依存

### 支払基金 レセプト電算 医薬品マスター importer

必要:

- `y_ALL20260414.zip`
- `master_3_20260501.pdf` または最新のファイルレイアウト PDF

あるとよい:

- `y_20260414.csv` など改定分ファイル
- `r08kaitei_20260414y.pdf` など改定内容 PDF

不要:

- PMDA XML。請求コードの原本ではない。
- HOT CSV。支払基金 importer 単体では不要。ただし YJ と包装単位まで横断するなら次段で使う。

### HOT コード importer

必要:

- `A_20260331_1.txt`
- `A_20260331_2.txt`
- `DLFileLayout.pdf`

注意:

- 通常無償版では HOT11/HOT13 の欄は予備扱い。
- Manta でまず必要なのは、厳密な HOT 番号そのものより `YJ 相当コード <-> 調剤包装単位コード <-> 販売包装単位コード` の対応。
- HOT11/HOT13 を正式に保存したい場合は、MEDIS のダウンロード ID 取得者用データを取得する。

### PMDA 相互作用の照合精度改善

必要:

- PMDA 添文 XML 全件または採用薬分
- 厚労省薬価 Excel 内用薬・外用薬・注射薬

あるとよい:

- HOT CSV。包装単位と販売名の揺れを拾うため。
- 支払基金医薬品マスター。請求名・一般名処方名・YJ の別表記を拾うため。

実装上の不足:

- `backend/scripts/resolve_pmda_interaction_matches.py` で `pmda_drug_interactions.interacting_drug` を薬剤 catalog / HOT / 支払基金 master に照合する。
- 照合結果は `pmda_drug_interaction_matches` に `interacting_drug_normalized`, `matched_yj_code`, `matched_drug_name`, `match_confidence`, `match_source` として保持する。
- 処方追加時の PMDA 相互作用 warning は、文字列一致より先に照合済み YJ を使う。

取り込み後の照合例:

```bash
cd backend
uv run python scripts/resolve_pmda_interaction_matches.py --dry-run
```

### 経過措置・後発品表示 UI

最低限必要:

- 厚労省薬価 Excel。薬価、先発/後発、経過措置期限、備考が取れる。

請求品質まで必要:

- 支払基金医薬品マスター。廃止日、経過措置、請求用医薬品コードを正にする。
- 支払基金 `keikasoti_R08_20260305.xlsx`。経過措置専用の一覧。
- 支払基金 `sentei_20260312.xlsx`。長期収載品の選定療養対象表示。

取り込み例:

```bash
cd backend
uv run python scripts/import_receipt_adjustment_drugs.py \
  --transitional-xlsx /path/to/keikasoti_R08_20260305.xlsx \
  --long-term-xlsx /path/to/sentei_20260312.xlsx \
  --dry-run
```

実装上の不足:

- 処方追加時に `経過措置対象`, `経過措置期限切れ`, `長期収載品・選定療養対象` warning を出す実装は完了。
- 次は管理画面と処方選択 UI に `薬価`, `メーカー`, `先発/後発`, `経過措置`, `選定療養` を出す。

## 次に実装する importer

次の順で importer を追加する。

1. `import_mhlw_drug_price_master.py` 実装済み
   - 入力: 厚労省 Excel
   - 出力: `prescription_catalog_masters`
   - 目的: YJ 実コード薬剤 master

2. `import_receipt_drug_master.py` 実装済み
   - 入力: 支払基金 `y_ALL*.zip` / `y_*.csv`
   - 出力: `receipt_drug_masters`
   - 目的: レセプト請求コードの正規化

3. `import_hot_drug_master.py` 実装済み
   - 入力: MEDIS `A_*.txt`
   - 出力: `hot_drug_code_mappings`
   - 目的: コード変換の安定化

4. `import_receipt_adjustment_drugs.py` 実装済み
   - 入力: 支払基金 `keikasoti_R08_*.xlsx`
   - 出力: `receipt_transitional_drugs`
   - 目的: 経過措置期限切れ薬の表示・warning

5. `import_receipt_adjustment_drugs.py` 実装済み
   - 入力: 支払基金 `sentei_*.xlsx`
   - 出力: `receipt_long_term_listed_drugs`
   - 目的: 選定療養対象表示と請求コード選択

6. `import_generic_prescription_master.py` 未実装
   - 入力: 厚労省 一般名処方 master Excel
   - 出力: 一般名処方 master
   - 目的: 一般名処方、後発品提案、薬剤検索補助

## 直近の作業順

1. 支払基金 `keikasoti_R08_20260305.xlsx` と `sentei_20260312.xlsx` を取得して UI warning 用の master を作る。
2. 処方入力 UI に薬価、先発/後発、経過措置、選定療養、レセ電候補を出す。
3. 注射薬・外用薬の厚労省 Excel importer 対応を広げる。現在の UI は `内服`, `外用`, `頓服` なので、注射薬はカテゴリ設計を追加してから取り込む。
