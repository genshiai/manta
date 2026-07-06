# Manta 実装監査 & 修正指示書（2026-07-06）

> **このドキュメントの目的と使い方（実行エージェント向け）**
>
> 2026-07-06 に Manta 全体（フロント / バックエンド / レセコン・ORCA / FHIR / ドキュメント）を対象に、
> 「モックのまま放置されている箇所」「本物に見えて実はシミュレーションの箇所」「雑・危険な実装」を全面監査した結果と、
> その修正指示をまとめたもの。**あなた（実行エージェント）はこのドキュメント1本を読めば各タスクに着手できる**ように書いてある。
>
> - タスクは `SEC / FAKE / LOSS / REG / BUG / HYG` の6系統 × 優先度 `P0〜P4` で分類。**タスクIDは不変**（進捗管理・PR名に使う）。
> - 各タスクは「対象 / 現状（根拠コード）/ 問題 / 決定（どう直すか）/ 受け入れ基準（AC）/ 検証 / 依存」を持つ。
> - **「決定」は両論併記しない。** プロダクトオーナー（長島）の判断が要るものだけ `⚠️要オーナー判断` を付け、デフォルト推奨を1つ置いた。判断が下りれば推奨どおり進めてよい。
> - 行番号は 2026-07-06 の working tree（コミット `6f5cb39` + 未コミットの新カルテUI）基準。**着手時にコードがずれていたら、記載のシンボル名で grep して現在位置を確定してから直すこと。**
> - 1タスク = 1PR を原則とする。PR タイトルは Conventional Commits + 日本語（例: `fix(security): FHIR ゲートウェイに認証を必須化 [SEC-1]`）。

---

## 0. 全体像 — 何が本物で何が偽物か

監査の結論を最初に共有する。**骨格は本物だが、対外的な看板（AI・レセコン計算・ORCA連携）が全てシミュレーションで、公開前提だとセキュリティに1つ致命傷がある。**

### 本物（触るときは慎重に。壊さないこと）
- **API契約**: フロントが呼ぶ約100ルートは全てバックエンドと一致。メソッド・パス・クエリの不整合はゼロ。
- **CRUD全般**: SOAP版管理・オーダー発行・予約・病名追加・設定8タブ・病棟の指示/看護記録/文書署名/パス運用・医事のKPI/SLA/月次締め は実API・実DB。
- **監査ログ**: 全書き込み操作で同一トランザクション記録。呼び忘れなし。
- **マスタ取込基盤**: 支払基金レセ電マスタ / MEDIS標準病名・HOT / 厚労省薬価xlsx / PMDA添付文書XML の実フォーマットパーサ。DEMO→実データ自動移行パスあり。ここは本番品質。
- **バックエンドテスト**: 140本・skipゼロ・異常系（403/404/409）まで検証。質は良い。
- **セキュリティの良い部分**: argon2ハッシュ、CORSはlocalhost限定（`*`ではない）、JWT検証の例外処理、タイムゾーンはaware UTC + Asia/Tokyo統一。

### シミュレーション / モック（このドキュメントの修正対象）
- **AI**: LLM接続はコードベース全体でゼロ。サマリー・下書き・要約・スクライブ・エージェント提案は全てルール生成か固定文字列。
- **レセプト点数計算**: 実アルゴリズム不在。カテゴリ代表1コードの貼り付け。未取込時は架空点数。UKEファイル・患者負担金・外来レセプトは存在しない。
- **ORCA連携**: mockアダプタが受理応答を偽造。httpモードも実ORCA非互換の独自JSON。
- **ホーム(受付)の一等地**: 救急ビュー・最近開いたカルテ・診療科フィルタ・接続/AIバッジが捏造 or 固定表示。
- **カルテの自動保存**: 表示するだけで保存しない（下書きはタブを閉じると消える）。
- **FHIRゲートウェイ**: 全エンドポイント無認証。

### 数字で見る現状
- 新カルテUI一式 **29ファイル・約4,073行が未コミット**（`git clean` で消える状態）。
- api.ts に **未使用ラッパー11本**（オーダー編集/取消・病名検索・Doプレビュー等 = 旧UIからの機能退行の痕跡）。
- フロントエンドテスト **0本**。
- README の陳腐化記述 **3点**（カルテ再設計・Notion skin・入退院）。

---

## 1. 優先度サマリ（着手順）

| 優先度 | 系統 | 意味 | 含まれるタスク |
|---|---|---|---|
| **P0** | SEC | 公開ブロッカー。OSS公開・外部設置の前に必須 | SEC-1〜SEC-5 |
| **P1** | FAKE | 「嘘をつく表示」。プロセスエコノミー公開ではブランド毀損に直結 | FAKE-1〜FAKE-9 |
| **P2** | LOSS | データ喪失・保存されない | LOSS-1〜LOSS-4 |
| **P3** | REG / BUG | 機能退行・実害バグ | REG-1〜REG-3, BUG-1〜BUG-9 |
| **P4** | HYG | 衛生（未コミット・文書・死にコード・テスト） | HYG-1〜HYG-6 |

> **最短の一手**: P0 の SEC-1（FHIR認証）と HYG-1（未コミットのコミット）は他タスクと独立かつ小さい。ここから。
> **公開判断に直結する塊**: P0全部 + P1の FAKE-1〜3（算定/救急/看護必要度）を「対外デモに耐える最小セット」とみなす。

---

## 2. P0 — セキュリティ（公開ブロッカー）

### SEC-1 — FHIR ゲートウェイに認証を必須化する 🔴最優先
- **対象**: `backend/app/modules/gateway/fhir/router.py`（全ルート）, `backend/app/main.py:40`
- **現状**: `/fhir/*` の全ルート（Patient/Condition/Observation/MedicationRequest/Appointment の read/search/create/update 計約30本）が `Depends(get_current_user)` を一切持たない。`main.py:40` で素のままマウントされている。`/api/*` は全て JWT 必須なのに、**FHIR経由なら無認証で患者データの全読み出し・作成・改変が可能**。
- **問題**: OSS公開 or 外部ネットワークに置いた瞬間、認証なしで全診療データが露出する。最も重い脆弱性。
- **決定**: FHIRルーターにも JWT 認証を必須化する。実装は router 全体に共通依存を掛けるのが最小差分:
  ```python
  # fhir/router.py の APIRouter 定義に共通依存を付与
  router = APIRouter(prefix="/fhir", tags=["fhir"], dependencies=[Depends(get_current_user)])
  ```
  `get_current_user` は `app/modules/auth/...` からインポート済みの他routerに倣う。
  - ⚠️要オーナー判断: 「外部システム連携用に別トークン（クライアントクレデンシャル）を将来使う」設計なら、認証方式を分けたい可能性がある。**ただし現時点で無認証は論外なので、まず JWT 必須化を入れ、方式の高度化は別ADR/別タスクに切る**（今は塞ぐことが最優先）。
- **AC**:
  - `curl http://localhost:8000/fhir/Patient/0009900040` が **401** を返す（Authorizationヘッダなし）。
  - 有効な Bearer トークン付きでは従来どおり 200。
  - FHIR系テスト（`tests/test_fhir*.py` 84本）が全て緑。**トークン付与のためのフィクスチャ追加が必要になるはず**（下記 SEC-1補足）。
- **SEC-1補足（テスト修正）**: 現状のFHIRテストは無認証前提でリクエストしている。認証を掛けると全て401で落ちる。`tests/conftest.py`（現状5行）に「ログイン済みトークンを返すfixture」を追加し、FHIRテストのリクエストに `headers={"Authorization": f"Bearer {token}"}` を通す。`tests/test_api.py` のログインヘルパを流用できる。
- **検証**: `cd backend && uv run pytest tests/test_fhir_patient.py tests/test_api.py -q`（要Postgres）
- **依存**: なし（単独着手可）。ただし SEC-1補足のテスト修正と同一PRで行う。

### SEC-2 — 平文パスワードのフォールバック照合を削除する
- **対象**: `backend/app/security.py:38-45`（`verify_password`）
- **現状**:
  ```python
  def verify_password(plain_password, stored_password):
      if is_hashed_password(stored_password):   # "$argon2" 始まりか
          try: return password_hash.verify(stored_password, plain_password)
          except (VerifyMismatchError, InvalidHashError): return False
      return plain_password == stored_password   # ← 平文比較フォールバック
  ```
- **問題**: DBに平文パスワードが入っていればそのまま照合が通る。レガシー移行用の意図だが恒久コードとして残っており、事故時の被害を増やす。
- **決定**: **平文フォールバックを削除**する。移行が必要なら「起動時に平文を検出したらハッシュ化して書き戻すワンショット処理」を別途用意すべきだが、seed は既に `hash_password()` でハッシュ保存している（`seed.py:2212`）ので、**現状フォールバックは不要**。削除して `False` を返す。
  ```python
  def verify_password(plain_password, stored_password):
      if not is_hashed_password(stored_password):
          return False
      try:
          return password_hash.verify(stored_password, plain_password)
      except (VerifyMismatchError, InvalidHashError):
          return False
  ```
  `password_needs_upgrade`（security.py:48）とログイン成功時の再ハッシュ処理があるなら維持。無ければ影響なし。
- **AC**: 平文パスワードのユーザーではログインできない。argon2ハッシュのデモアカウントは従来どおりログイン可。既存の認証テスト（test_api.py のログイン系）が緑。
- **検証**: `uv run pytest tests/test_api.py -k login -q`
- **依存**: なし。

### SEC-3 — JWTシークレットのデフォルト値を廃し、本番で必須化する
- **対象**: `backend/app/config.py:17`, `backend/app/main.py`（起動時チェック追加）
- **現状**: `secret_key: str = "manta-dev-secret-change-this-to-a-long-random-key"` がハードコード。未設定でも警告なく起動。READMEに「demo以外は差し替え」とあるだけで強制なし。
- **問題**: デフォルトのまま公開設置すると、誰でもトークンを偽造できる。
- **決定**: 環境種別の概念を導入する。**`MANTA_ENV`（`development`|`production`、デフォルト`development`）を config に追加**し、`production` かつ secret_key がデフォルト値のままなら**起動時に例外で落とす**。development ではデフォルト値を許容（デモ体験を壊さない）。
  ```python
  # config.py
  environment: str = "development"   # MANTA_ENV
  # main.py lifespan 冒頭、または config バリデータ
  if settings.environment == "production" and settings.secret_key.startswith("manta-dev-secret"):
      raise RuntimeError("MANTA_ENV=production では MANTA_JWT_SECRET_KEY を必ず設定してください")
  ```
- **AC**: `MANTA_ENV=production` かつ secret 未設定で起動 → 明示的なエラーで停止。`development`（デフォルト）では従来どおり起動。
- **検証**: ローカルで環境変数を切り替えて起動確認。
- **依存**: なし。SEC-5（seed無効化フラグ）と同じ「環境種別導入」PRにまとめてよい。

### SEC-4 — 臨床操作にロールチェックが無い（医事アカウントで処方・退院ができる）
- **対象**: `backend/app/modules/karte/router.py`（処方・オーダー・状態更新）, `backend/app/modules/inpatient/router.py`（入退院・パス操作）, `backend/app/modules/admin/router.py:715`（監査ログ閲覧）
- **現状**: `require_role` が使われるのは `admin/*` のみ。SOAP保存・処方作成・退院実行・パス操作は全て `get_current_user` だけで、ロール（`医師`|`管理者`の2種）を見ていない。監査ログ閲覧（患者名込み）も一般ユーザー可。
- **問題**: 医事課想定の管理者アカウント（admin.sato）で処方も退院も可能。患者単位アクセス制御も無い。
- **決定**: ⚠️要オーナー判断（ロール設計そのものがプロダクト仕様）。ただし**デフォルト方針を置く**:
  1. **処方作成・SOAP保存・オーダー発行・入退院操作は `医師` ロール必須**にする（`Depends(require_role("医師"))`）。
  2. **監査ログ閲覧は `管理者` 必須**（admin/router.py:715 を `get_current_user` → `require_role("管理者")`）。
  3. 患者単位アクセス制御（担当医以外の閲覧制限）は**現段階では過剰。別フェーズ**。医療現場は職種間で広く閲覧するのが通常運用なので、今はロール分離までで十分。
  - この方針で問題なければそのまま実装。ロール体系を増やす（看護師・医事）計画があるなら、その設計を先にADR化。
- **AC**: 管理者トークンで `POST /api/patients/{id}/prescriptions` → 403。医師トークンでは 201。監査ログ閲覧は管理者のみ 200・医師 403。
- **検証**: `uv run pytest tests/test_api.py -q`（ロール別のテストを追加）。既存の admin 系403テスト（test_api.py:1236 付近）が参考実装。
- **依存**: なし。ただしロール設計の判断待ちの可能性あり。

### SEC-5 — seed が毎起動で無条件実行され、本番でもデモ患者を投入する
- **対象**: `backend/app/main.py:22-27`（lifespan）, `backend/app/seed.py`
- **現状**: 起動のたびに `run_migrations()` → `seed_demo_data(db)` が無条件実行。無効化フラグなし。さらに seed の sync群がシード由来マスタを強制上書きし、デモ患者のアクティブ入院を毎回復元する（詳細は LOSS-4）。
- **問題**: 本番に上げてもデモ患者（鈴木花子ら）が必ず入る。デモ運用でも管理画面の編集が再起動で全部戻る。
- **決定**: **`MANTA_SEED_DEMO`（bool、デフォルト`true`）を追加**し、`false` なら seed をスキップ。SEC-3 で入れる `MANTA_ENV=production` のときは**デフォルトを`false`に倒す**（本番で明示的に`true`にしない限りデモを入れない）。
  ```python
  # main.py lifespan
  run_migrations()
  if settings.seed_demo:   # production では既定 False
      with SessionLocal() as db:
          seed_demo_data(db)
  ```
- **AC**: `MANTA_SEED_DEMO=false` で起動 → デモ患者が入らない。デフォルト（development）では従来どおり入る。
- **検証**: 環境変数を切り替えて起動、`GET /api/patients` の件数確認。
- **依存**: SEC-3 と同じ「環境種別」PRにまとめると綺麗。LOSS-4（退院できない問題）とも関連。

---

## 3. P1 — 嘘をつく表示（FAKE）

> プロセスエコノミーとして公開する方針（[memory: project_manta_process_economy_strategy]）では、**機能が足りないことより、動いている風の捏造表示のほうがブランドを毀損する**。「実験途中である」ことを正直に見せる方向で直す。

### FAKE-1 — カルテ点数プレビューがハードコード（スペックのフォールバック規定違反）
- **対象**: `frontend/src/components/chart/sheet/streamModel.ts:296-312`（`computeBillingPreview`）
- **現状**: 再診75点・管理料225点・処方60点を**固定値**で組み立て、シート行為列と AgentTray に「N点」として表示。コメントは backend の `GET /karte/patients/{id}/billing-preview` 相当と言うが、**そのAPIは存在しない**（リポジトリ全grep該当ゼロ）。
- **問題**: スペック（KARTE_UI_SPEC §12, Phase 1 AC）は「billing-preview API が無ければ『—点』+TODO を出す」と規定。固定値表示はこれに違反し、算定結果に見える。医療デモとして最も誤解を生む。
- **決定**: ⚠️要オーナー判断（本実装か、正直なフォールバックか）。**デフォルト推奨: スペック通り「—点」フォールバックにする**。`computeBillingPreview` の固定点数生成を廃し、`null`（＝「—点」表示）を返す。将来 billing-preview API を実装したら差し替える。
  - もし「デモで点数が出ないと寂しい」なら、**「概算（デモ）」バッジを必ず併記**した上で固定値を残す選択も可。ただしバッジなしの現状は不可。
- **AC**: 点数行が「—点」または「概算（デモ）N点」のいずれかになり、無印の点数表示が無くなる。
- **検証**: カルテを開き、シート行為列・右トレイの点数表示を目視。`rg "75|225|60" frontend/src/components/chart/sheet/streamModel.ts` で固定値が消えた/バッジ化されたことを確認。
- **依存**: なし。

### FAKE-2 — 受付ホームの救急ビューが捏造データ
- **対象**: `frontend/src/components/ReceptionBoard.tsx:90-91, 276, 288-292, 447-462`
- **現状**: 救急ビュー = 外来患者の先頭3人（`patients.slice(0,3)`）を流用。緊急度 `emergencySeverity=['中等症','軽症',...]` と主訴 `emergencyChiefComplaints=['胸部圧迫感','血糖高値',...]` を `index % 配列長` で機械割当。タブ件数バッジも `Math.min(3, patients.length)`。
- **問題**: 行位置で「胸部圧迫感・中等症」が決まる完全な捏造。救急トリアージ表示は医療的に誤認リスクが高い。
- **決定**: ⚠️要オーナー判断（救急機能を持つのか）。**デフォルト推奨: 救急ビュー（タブごと）を削除**。外来クリニック向けEMRという位置づけ（[memory: project_manta_positioning_narrative]）で救急トリアージは対象外。バックエンドに救急のデータモデルも無い。
  - 将来救急を扱うなら、`Admission`/`Patient` に triage フィールドを持たせた実データで作り直す別フェーズにする。今の捏造ビューは残さない。
- **AC**: 救急タブが無くなる（または実データ接続される）。`emergencySeverity`/`emergencyChiefComplaints` の配列と `index %` 割当が消える。
- **検証**: 受付画面のタブ確認。`rg "emergencySeverity|emergencyChiefComplaints" frontend/src` が0件。
- **依存**: なし。

### FAKE-3 — 「看護必要度」を名乗る即席スコア（臨床用語の誤用）
- **対象**: `frontend/src/components/WardWorkspace.tsx:1205-1211, 1897-1904`
- **現状**: `未実施指示×2 + パス逸脱×2 + 未署名文書 + max(0, 2−本日看護記録)`、≥6で「高」という独自式を「看護必要度」というラベルで表示。
- **問題**: 「看護必要度」は厚労省の重症度・医療看護必要度という定義された制度用語。無関係の即席スコアに使うと制度誤認を招く。
- **決定**: **ラベルを制度用語でない名前に変更**する（例:「病棟タスク負荷」「要対応度」）。計算式自体は運用指標として有用なので残してよいが、**「看護必要度」という語を外す**。制度準拠の看護必要度を将来実装するなら別フェーズ。
- **AC**: UI・コード中の当該表示から「看護必要度」の語が消える。スコアの意味を表す中立的な名称になる。
- **検証**: 病棟画面を目視。`rg "看護必要度" frontend/src` の残存箇所を確認（他に正当な用途があれば区別）。
- **依存**: なし。

### FAKE-4 — 「最近開いたカルテ」が先頭3人（本物の履歴が既にあるのに未配線）
- **対象**: `frontend/src/components/ReceptionBoard.tsx:794-813`, `frontend/src/App.tsx:299-304`
- **現状**: 「最近開いたカルテ」見出しの下に `patients.slice(0,3)` を表示。一方 `App.tsx:299-304` に**本物の閲覧履歴 `recentChartPatients`（localStorage永続）が既に存在**するが使われていない。
- **問題**: 実データがあるのに捏造表示。配線するだけで直る。
- **決定**: `recentChartPatients` を ReceptionBoard に props で渡し、「最近開いたカルテ」を実履歴で描画する。履歴が空のときは EmptyState（「まだカルテを開いていません」）。
- **AC**: カルテを開くと「最近開いたカルテ」に反映され、リロード後も残る（localStorage）。`patients.slice(0,3)` 由来の表示が消える。
- **検証**: 患者A→患者Bの順でカルテを開き、受付に戻って順序を確認。
- **依存**: なし。

### FAKE-5 — 診療科フィルタの選択肢がモックデータ由来
- **対象**: `frontend/src/components/ReceptionBoard.tsx:24, 636`, `frontend/src/data/chartMock.ts:263-265`
- **現状**: 診療科フィルタの選択肢が `chartMock.departmentOptions`（モック4患者=内科/皮膚科/循環器内科から動的導出）。実DBに他科の患者がいてもフィルタに出ない。**モックデータが本番UIに漏れている唯一の経路**。
- **問題**: 実データと乖離。HYG-3（chartMock削除）のブロッカーでもある。
- **決定**: 診療科の選択肢を**実データ由来にする**。案: (a) `listPatients` のレスポンスから科を集約してフィルタを構築、(b) 専用の軽いエンドポイント `GET /api/departments` を追加。**推奨は (a)**（新API不要、現在の受付リストと必ず整合）。
- **AC**: `chartMock` への依存が消え、実際の患者に存在する科がフィルタに出る。
- **検証**: `rg "departmentOptions" frontend/src` が chartMock 由来でなくなる。受付フィルタの選択肢を目視。
- **依存**: HYG-3（chartMock死にコード削除）を完了させるための前提。

### FAKE-6 — 「接続中」「AI ready」バッジが固定表示
- **対象**: `frontend/src/components/StatusFooter.tsx:20-23`, `frontend/src/components/AppHeader.tsx:106-109`
- **現状**: フッタの緑ドット「接続中」、ヘッダの「AI ready」バッジがハードコード。API全滅でも「接続中」、AI疎通確認は存在しないのに「AI ready」。
- **問題**: 状態を表すUIが状態を見ていない。
- **決定**:
  - 「接続中」: **実接続状態に接続する**。最小実装は「直近のAPI呼び出しが成功していれば緑、失敗中なら赤/灰」。大掛かりなら**バッジ自体を削除**（偽の安心表示より無いほうがマシ）。推奨は削除 or 最小接続。
  - 「AI ready」: AI機能は全てルール生成でLLM接続が無い（後述）ので、**「AI ready」バッジは削除**。誤解を招くだけ。将来LLMを繋いだら復活させる。
- **AC**: 固定の「接続中」「AI ready」表示が、実状態接続 or 削除のいずれかになる。
- **検証**: バックエンドを止めた状態でフッタ表示を確認（接続表示を残した場合）。ヘッダから「AI ready」が消える。
- **依存**: なし。

### FAKE-7 — スクライブ（録音）が録音していないのに「録音中」と表示
- **対象**: `frontend/src/components/chart/write/WriteToolsTray.tsx:28-54, 72-117`
- **現状**: 「録音を開始」は `getUserMedia` も音声APIも呼ばず `setInterval` で秒数を数えるだけ。UIは「診察を録音中」と赤点滅。「停止して下書き」は固定文2行を挿入。
- **問題**: スペック（§5.4）は「器のみ・生成はスタブ」と明記済みで、スタブ自体は設計内。だが**「録音中」という表示は虚偽**（マイクは動いていない）。
- **決定**: 表示文言を正直にする。「録音中」→「**下書きデモ（音声認識は未接続）**」等に変更し、赤点滅の「録音インジケータ」感を弱める。挿入する固定文にも「（デモ生成）」を明示。機能自体（器）は残してよい。
- **AC**: 録音していないのに「録音中」と表示する箇所が無くなる。デモであることがUI上明示される。
- **検証**: Writeモードでスクライブを起動し、文言を目視。
- **依存**: なし。

### FAKE-8 — エージェント提案「算定漏れ 225点」が根拠なし＋「会計に追加」が何もしない
- **対象**: `frontend/src/components/chart/panels/agentModel.ts:79-91`, `frontend/src/components/ChartWorkspace.tsx:898-914`
- **現状**: 「算定漏れ: 特定疾患療養管理料 225点 / 今月未算定（施設ルール）」を、会計・算定データを一切見ずに `managedProblemCount >= 1` なら常に表示。「会計に追加」ボタンは React state の Set に id を足すだけ（`ChartWorkspace.tsx:904`）。会計には何も送られない。
- **問題**: 根拠のない算定クレームを出し、ボタンが機能しない。カルテ画面は外来だが、算定を実行するバックエンド経路（外来レセプト）自体が無い（FAKE-9参照）。
- **決定**: 外来算定の実装が無い以上、**このカードは「候補（未実装）」であることを明示するか、外来算定APIが出来るまで非表示にする**。⚠️要オーナー判断。デフォルト推奨:
  - 短期: 「会計に追加」を**「候補（未実装）」ラベルに変え、押下時に「外来算定は未実装」と分かる**ようにする（沈黙してstate操作するのをやめる）。
  - 中期: 外来 ClaimDraft 生成（FAKE-9）ができたら本配線。
- **AC**: 押しても何も起きないのに成功したように見える挙動が無くなる。表示が「候補/未実装」と分かる。
- **依存**: 本配線は FAKE-9（外来レセプト）に依存。表示の正直化は単独で可能。

### FAKE-9 — 外来レセプトが存在しない（「外来クリニック向けEMR」なのに請求できない）
- **対象**: `backend/app/modules/rececon/router.py:1455`（ClaimDraft生成起点）, カルテ画面の算定導線全般
- **現状**: `ClaimDraft` の生成経路は `create_inpatient_claim_draft`（入院）ただ1本。外来の診療行為から請求ドラフトを起こす経路が無い。UKEファイル生成・患者負担金計算・領収書も無い（LOSS/レセコン章参照）。
- **問題**: プロダクトの位置づけ（外来クリニック向け）と実装（入院請求のみ）が乖離。看板機能の欠落。
- **決定**: ⚠️要オーナー判断（大きな機能開発。このドキュメントの他タスクとは規模が違う）。**このタスクは「認識合わせ」まで**。監査事実として記録し、実装計画は別ドキュメント（`docs/RECEIPT_GATEWAY_STRATEGY.md` の更新 or 新規フェーズ計画）に切る。ここで求めるのは:
  - README / スペックから「外来レセが動く」印象を与える記述を除く（HYG-5 と連動）。
  - 点数計算・UKE・負担金が未実装であることをドキュメントに明記。
- **AC**: 外来レセプトの現状（未実装）とロードマップ上の位置が文書化される。誤解を招く「動く」記述が消える。
- **依存**: HYG-5（README更新）と連動。

---

## 4. P2 — データ喪失・保存されない（LOSS）

### LOSS-1 — 「自動保存」が保存していない（下書きがタブを閉じると消える）🔴
- **対象**: `frontend/src/components/chart/hooks/useAutosave.ts`, `frontend/src/components/chart/write/InlineEditor.tsx:68-72, 191-192`, `frontend/src/components/ChartWorkspace.tsx:987`
- **現状**: `useAutosave(draftText, () => setAutosaved(true))` — 3秒アイドルで**ローカルbooleanを立てるだけ**。表示は「自動保存 · vN · HH:MM」（`autosaveLabel`）で保存済みに見えるが、下書きは React state のみ。タブを閉じる/患者を切り替えると編集内容が完全に消失。localStorage退避すらない。スペック §5.1「3秒debounceで下書き保存」は未実装。
- **問題**: 「自動保存」表示 + 実際は未保存 = ユーザーが最も裏切られるパターン。診療中の記載消失は重大。
- **決定**: 段階実装。**最低ライン（このタスクの必須）: localStorage への下書き退避**を実装する。
  1. `useAutosave` の onIdle で `patient_id + section` をキーに draft を localStorage 保存。
  2. カルテを開いたとき、未確定の localStorage 下書きがあれば復元（「未保存の下書きを復元しますか」or 自動復元）。
  3. 版確定（chart/save 成功）時に該当localStorage下書きをクリア。
  - ⚠️中期: サーバー下書き保存（スペック本来の姿）は別タスク。まず消えないことを保証する。
  - **表示との整合**: localStorage保存にした場合「自動保存（この端末）」等に文言を調整。サーバー保存だと誤認させない。
- **AC**: 編集 → タブを閉じる/リロード → 同じ患者のカルテを開くと下書きが残っている。版確定後は残らない。
- **検証**: 手動。SOAP編集→3秒待つ→リロード→復元を確認。
- **依存**: なし。P2最優先。

### LOSS-2 — オーダー・保存エラーが全てユーザーに見えない（握りつぶし）🔴
- **対象**: `frontend/src/components/ChartWorkspace.tsx:223-224, 838-843` ほか各API呼び出しのcatch
- **現状**:
  - `const [, setOrderMessage] = useState(...)` — 表示先ゼロ（コメントで「UI未接続。将来トーストに接続」と自認）。この結果、処方追加失敗(491)・セット追加失敗(523)・検査追加失敗(551)・画像失敗(575)・処置失敗(599)・前回複写失敗(448)・患者情報保存失敗(626)の**全エラーがユーザーに見えない**。
  - `saveMessage` は「未編集かつ未保存」の初期状態でしか出ないため、**カルテ保存失敗(413)・診察終了失敗(676)・予約失敗(723)もエラー文言が不可視**。
  - `const [, setScheduledVisit]`（232, 710-716）も読み手なしで予約成功が反映されない。
- **問題**: API が落ちても UI が沈黙する。データが保存されたと誤認する。
- **決定**: **トースト（通知）機構を導入**し、全catchを配線する。
  1. 軽量トーストを1つ用意（`components/ui` に無ければ最小実装、または sonner 等の導入可否をオーナー確認）。⚠️依存追加の可否だけ判断が要る。**推奨: 依存を増やさず自前の最小トースト**（成功/エラーの2種、数秒で消える）。
  2. `setOrderMessage` / `saveMessage` / 予約結果をトーストに接続。成功も「処方を追加しました」等で明示。
  3. `setScheduledVisit` の結果を予約表示に反映（読み手を作る）。
- **AC**: 各操作の成功/失敗がトーストで見える。API を意図的に失敗させると（例: バックエンド停止）エラートーストが出る。予約成功が画面に反映される。
- **検証**: バックエンドを止めて処方追加 → エラートースト表示を確認。
- **依存**: なし。P2最優先。

### LOSS-3 — 過去カルテがシードJSON固定で、SOAP保存しても増えない
- **対象**: `backend/app/modules/karte/router.py:166-171`（`get_chart_workspace`）
- **現状**: `chart_history`・`visit_history`・`vitals`・`lab_results` は **Patientテーブルの JSON カラム（＝シード値）をそのまま返す**。SOAP保存は `chart_notes` テーブルに入るが `chart_history` JSON には反映されない。→ 何年使っても過去カルテ欄はシードの3〜4件のまま。
- **問題**: カルテの中核である「過去の記録が積み上がる」が成立しない。
- **決定**: **過去カルテ（chart_history）を `chart_notes` テーブルから動的生成する**。`visit_history` も同様に受診（Encounter相当）から導出。JSON静的カラムは初期デモ表示用の seed に留め、実運用データが `chart_notes` に入ったらそちらを正とする（マージ or 切替）。
  - ⚠️設計判断: 「JSONカラムを完全に廃してテーブル駆動にする」のが理想だが影響範囲が広い。**最小手: `chart_history` レスポンスを `chart_notes` の版履歴から組み立て、seed JSON は0件のときのフォールバックにする**。vitals/lab_results は Observation テーブルがあるならそちら駆動に（FHIR mapper が既に読んでいる経路を流用）。
- **AC**: 新規にSOAPを保存 → 過去カルテ欄に当該受診が現れる。リロードしても残る。
- **検証**: SOAP保存 → カルテ再取得 → chart_history に反映を確認。`uv run pytest tests/test_api.py -k chart` にケース追加。
- **依存**: なし（ただし影響範囲があるので設計を1段固めてから着手）。

### LOSS-4 — デモ患者が退院できない（seed が active 入院を毎起動で復元）
- **対象**: `backend/app/seed.py:2038-2122`（`sync_inpatient_demo_data`）, 関連 sync群（1493-1727）
- **現状**: seed の sync群が差分検知でシード値へ強制上書き。`sync_inpatient_demo_data` はデモ患者のアクティブ入院をシード値に復元し（existing検索がactive系のみ対象）、退院させても**再起動で新しいactive入院が自動再作成**、病床もoccupiedに戻る。管理画面でシード由来マスタを編集しても再起動で全部戻る。
- **問題**: デモとして触っても状態が進まない（退院・マスタ編集が巻き戻る）。
- **決定**: SEC-5（seed無効化フラグ）で「seedを実行しない」選択肢は入る。それに加え、**seedの「強制上書き」を「無ければ作成、あれば触らない（idempotent insert-only）」に変える**。具体的には sync群を「既存レコードがあれば更新をスキップ」に寄せる。デモ初期化をやり直したい場合は明示的なreset手段（スクリプト or フラグ）を別途用意。
  - ⚠️判断: 「デモは常にまっさらに戻ってほしい」運用と「触った状態を保ちたい」運用は両立しない。**推奨: 触った状態を保つ（insert-only）**。まっさら化は `MANTA_SEED_RESET=true` のような明示フラグでのみ実行。
- **AC**: デモ患者を退院させて再起動 → 退院状態が保たれる。マスタを編集して再起動 → 編集が保たれる。
- **検証**: 退院操作 → 再起動 → 状態維持を確認。
- **依存**: SEC-5 と同じ seed 周りなので同一PR/連続PRが望ましい。

---

## 5. P3 — 機能退行・実害バグ（REG / BUG）

### REG-1 — 発行済みオーダーの編集・取消がUIから不可能（旧UIからの退行）
- **対象**: `frontend/src/components/chart/sheet/ActsColumn.tsx`, `frontend/src/components/ChartWorkspace.tsx`（`<Sheet>` 呼び出し）, `frontend/src/lib/api.ts`（未使用ラッパー）
- **現状**: バックエンドに PATCH/DELETE が揃い、api.ts に `updateLabOrder`/`cancelLabOrder`/`updateImagingOrder`/`cancelImagingOrder`/`updateProcedureOrder`/`cancelProcedureOrder` の6本があるが**全て未使用**。`ActsColumn` の ⋯メニュー（編集/取消/コピー）は `onActAction` prop を ChartWorkspace が渡さないため**描画すらされない**。旧 OrderPane 削除に伴う機能退行。
- **問題**: 出したオーダーを間違えても UI から直せない。
- **決定**: `onActAction` を ChartWorkspace → Sheet → DayBlock → ActsColumn へ配線し、編集/取消を上記APIに接続する。「コピー」は Do 発行（既存の複写機能）へ。
- **AC**: シートの行為行の ⋯ から取消・編集ができ、バックエンドに反映される。未使用ラッパー6本が使われる。
- **検証**: 検査オーダーを発行 → ⋯ → 取消 → 再取得で status が cancelled。
- **依存**: LOSS-2（トースト）があると成功/失敗表示が付いて望ましいが、独立着手も可。

### REG-2 — 入院登録・退院許可・退院実行のUIが無い
- **対象**: `backend/app/modules/inpatient/router.py:208, 318, 352`（3エンドポイント）, `frontend/src/lib/api.ts`（ラッパー自体が無い）, `frontend/src/components/WardWorkspace.tsx`
- **現状**: バックエンドに `POST .../admissions`（入院登録）・`.../permit-discharge`（退院許可）・`.../discharge`（退院実行）があるが、api.ts にラッパーすら無く、UIから呼べない。病棟画面は転棟・ベッド状態変更・退院計画編集のみ。入退院の状態遷移は seed 依存の表示専用。
- **問題**: README の「入退院が動く」が過大表記。病棟ワークフローの根幹が欠落。
- **決定**: api.ts に3ラッパーを追加し、WardWorkspace に入院登録・退院許可・退院実行の導線を作る。
  - ⚠️UI設計はプロダクト判断が要る（どの画面から入院させるか）。**推奨: 受付or病棟に「入院登録」、病棟の患者詳細に「退院許可→退院実行」の2段ボタン**。
- **AC**: UIから入院→退院までの状態遷移が一通りできる。LOSS-4（seedが復元しない）と併せてデモで完結する。
- **検証**: 入院登録→退院許可→退院実行の手動フロー。
- **依存**: LOSS-4（退院が巻き戻らないこと）とセットで意味を持つ。README修正（HYG-5）の前提。

### REG-3 — SPAルーターが無く、リロードで受付に戻る・URL共有不可
- **対象**: `frontend/src/App.tsx`（`screen` state のみで画面管理）
- **現状**: ルーター不在。画面は `screen` state だけで管理。URLは不変、リロードで常に受付へ、ブラウザバック不可。
- **問題**: カルテのURL共有・ブックマーク・戻る操作という基本的なWeb体験が無い。
- **決定**: ⚠️中規模。React Router 等の導入可否をオーナー確認（依存追加）。**推奨: 導入する**（EMRで患者URL共有は実運用価値が高い）。最小でも `/`, `/chart/:patientId`, `/ward`, `/billing`, `/settings` を切る。
- **AC**: カルテのURLを直打ち/リロードで同じ患者のカルテが開く。ブラウザバックが効く。
- **検証**: カルテを開いた状態でリロード → 同じ画面。
- **依存**: なし。ただし依存追加判断が要る。他タスクより後回し可。

### BUG-1 — 検査フラグに低値異常(L)が無く、低K血症等が「正常」表示になる 🔴臨床安全
- **対象**: `backend/app/modules/karte/services.py:688-689`, `backend/app/modules/karte/schemas.py:51, 69`
- **現状**: 検査フラグが `H/HH/A → high` のみ。スキーマも `Literal["high","normal"]` で**低値異常(L)を表現できない**。
- **問題**: 低カリウム血症・低血糖などの低値異常が「正常」と表示される。臨床的に危険。
- **決定**: フラグに `low` を追加する。`L/LL → low`、スキーマを `Literal["high","low","normal"]` に拡張。フロントの表示（色分け）も `low` に対応させる（`frontend/src/types/workflow.ts` と検査表示コンポーネント）。
- **AC**: 低値異常の検査値が「低」表示・異常色になる。フロント/バックの型が一致。
- **検証**: 低値の検査データで表示確認。`uv run pytest tests/test_api.py -k lab`（ケース追加）。
- **依存**: フロント・バック両方を同一PRで（型が繋がっているため）。

### BUG-2 — オーダー検索が壊れており「CT」で画像プリセット全件ヒット
- **対象**: `frontend/src/components/chart/work/orderSearch.ts:110-124`
- **現状**: 内側条件 `normalize(category).includes(q) || IMAGING_HINT.test(query)` の後半は外側ifで既に真と確定しているため**常にtrue**。「CT」検索で膝XP・腹部エコー含む画像プリセット10件全部がヒット。処置も同一バグ。
- **問題**: 検索が絞り込みにならない。
- **決定**: 冗長な `|| ..HINT.test()` を除去し、`normalize(category/label).includes(q)` で正しく絞る。
- **AC**: 「CT」で CT 系のみがヒットする。
- **検証**: オーダー検索で「CT」入力 → 結果を目視。
- **依存**: なし。

### BUG-3 — 一度取消した検査項目が二度とオーダーできない
- **対象**: `backend/app/modules/karte/router.py:538-540`（重複チェック）
- **現状**: 検査重複チェックが cancelled オーダーも対象に含むため、取消済み項目を再オーダーできない。
- **決定**: 重複チェックの対象から `status == "cancelled"` を除外する。
- **AC**: 検査を取消 → 同項目を再オーダーできる。
- **検証**: `uv run pytest tests/test_api.py -k lab_order`（ケース追加）。
- **依存**: なし。

### BUG-4 — 経過時間ソートが二重に壊れている
- **対象**: `backend/app/modules/karte/router.py:116`
- **現状**: `func.regexp_replace(Patient.elapsed, r"\D", "", "g")` を raw 文字列 `r"\D"` でなく `"\\D"` 相当で渡しており、Postgres には「リテラル`\`+D」が渡って非数字除去にならず no-op。さらに結果を文字列のまま desc ソート（"9" > "10"）。
- **問題**: 経過時間ソートが機能しない。加えて `elapsed` 自体がシード固定文字列（FAKE系/BUG-8と関連）。
- **決定**: `elapsed` を文字列でなく数値（分）で持つべき（BUG-8参照）。当面のソート修正としては、正規表現を正しく（`'\D'`）し、数値キャストしてソート。ただし**根本はBUG-8（elapsedの実データ化）**。
- **AC**: 経過時間で正しく数値順ソートされる。
- **依存**: BUG-8 と合わせて設計するのが望ましい。

### BUG-5 — imaging/procedure の PATCH/DELETE が id を二重解釈（PK と JSON添字）
- **対象**: `backend/app/modules/karte/router.py:648-746, 777-871`
- **現状**: `order_index` を「テーブルPK」と「patient JSON配列の添字」の2通りに解釈。`db.get(ImagingOrder, order_index)` がヒットすればPK、外れればJSON添字。autoincrement PK と 0始まり添字が衝突しうる。imaging/procedure でほぼ同一コードの4連コピペ。
- **問題**: 曖昧仕様で誤ったレコードを更新/削除しうる。
- **決定**: id 解釈を1つに統一する。**推奨: テーブルPK駆動に統一**し、JSON配列由来のオーダー（旧データ）はマイグレーションでテーブルへ移すか、読み取り専用にする。4連コピペは共通関数化。
- **AC**: PATCH/DELETE の対象が一意に定まる。imaging/procedure のロジック重複が解消。
- **検証**: `uv run pytest tests/test_api.py -k "imaging or procedure"`（ケース追加）。
- **依存**: なし。中規模リファクタ。

### BUG-6 — 予約枠 capacity=0 が falsy で 1 に化ける（受付停止を表現できない）
- **対象**: `backend/app/modules/karte/router.py:893`, `backend/app/modules/karte/services.py:776`
- **現状**: `max(slot.capacity or 1, 0)` — `capacity=0` が falsy で 1 になる。
- **決定**: `slot.capacity if slot.capacity is not None else 1` に変える（`or` を使わない）。
- **AC**: capacity=0 の枠が「0枠（受付停止）」として扱われる。
- **検証**: capacity=0 の枠で予約可否を確認。
- **依存**: なし。小。

### BUG-7 — 月次請求の集計が診療月でなくドラフト作成日基準
- **対象**: `backend/app/modules/rececon/router.py:226-227`
- **現状**: 月次集計が `ClaimDraft.created_at` ベース。診療月（入院期間）でなくドラフト作成日で集計するため、月跨ぎ作成で誤った月に計上。
- **決定**: 集計キーを診療月（入院なら退院日/請求対象月、外来なら診療日）に変える。請求対象月を表すフィールドが無ければ ClaimDraft に `claim_month` を追加。
- **AC**: 月跨ぎでドラフトを作っても正しい診療月に集計される。
- **検証**: `uv run pytest tests/test_api.py -k "monthly or claim"`（ケース追加）。
- **依存**: レセコン設計に関わるため FAKE-9 と整合を取る。

### BUG-8 — 患者リストの運用フィールド（経過/受付時刻/年齢）がシード固定文字列
- **対象**: `backend/app/seed.py:2244-2251`, `backend/app/modules/karte/models.py:30-35`
- **現状**: `elapsed="34分"`, `lab_progress="結果到着"`, `reception_time="09:42"`, `status="診察中"` が Patient テーブルの静的文字列。リアルタイム計算なし。`age="68歳"` も固定で birth_date から再計算されない。
- **問題**: 「動いている感」が100%シード。`age` 固定は「68歳歳」表示バグ（BUG-9）の原因。
- **決定**: ⚠️中規模。**受付ステータス・経過時間は本来 Encounter/受付イベントから計算すべき**。最小手として:
  - `age` は `birth_date` から計算して返す（固定文字列を廃止）。→ BUG-9 も同時に解消。
  - `elapsed`/`reception_time`/`status` は「受付」データモデルが無い現状ではデモ値のままになる。**受付機能を実データ化する別フェーズ**が要る。ここでは `age` の実データ化を必須とし、残りは「デモ値である」ことを認識・文書化。
- **AC**: `age` が birth_date から算出される。「68歳歳」バグが消える。
- **依存**: BUG-9 を包含。受付実データ化は別フェーズ。

### BUG-9 — 「68歳歳」二重表示
- **対象**: `frontend/src/components/chart/panels/StoryboardPanel.tsx:87`, `frontend/src/components/chart/panels/CommandPalette.tsx:49`
- **現状**: `${patient.age}歳` だが age は既に `"68歳"`（seed）→「68歳歳」。`ChartWorkspace.tsx:831` には `includes('歳')` ガードがあり一箇所だけ直っている。
- **決定**: BUG-8 で age を数値化するなら `${age}歳` でよい。数値化しないなら全箇所で `includes('歳')` ガードを共通ヘルパ化。**推奨: BUG-8 とセットで age 数値化**。
- **AC**: 年齢表示の「歳歳」重複が全画面で消える。
- **検証**: `rg '\.age\}歳' frontend/src` で未ガード箇所ゼロ。
- **依存**: BUG-8。

### BUG-10（軽微まとめ） — その他の雑な実装
以下は影響が小さいが、見つけたら同系統PRでまとめて直してよい。
- `backend/app/modules/admin/router.py:182-193` — GET の ORCA設定取得に INSERT+commit の副作用。GETを純粋な読み取りにする。
- `backend/app/modules/rececon/services.py:41,51` — 点数パースが `int(float(...))` で小数切り捨て。点数の小数を扱うなら Decimal 化。
- `backend/app/modules/rececon/router.py:1476,1487` / `services.py:111,130` — 処方20件・検査10件でサイレント打ち切り。上限に達したら issue/警告を出す（黙って落とさない）。
- `backend/app/modules/rececon/router.py:207-208` — recheck が draft/reviewed 状態を ready/error へ強制上書き。中間状態を壊さない。
- `frontend/src/App.tsx:43-53` — ログイン失敗分岐が英語メッセージ完全一致（`'Invalid credentials'`）。バックエンドがエラーコードを返し、フロントはコードで分岐する。
- `frontend/src/components/chart/sheet/vitalsModel.ts` / `WardWorkspace.tsx:221-231` — 温度板・バイタルが自由文字列の正規表現/`includes` パース（`'T'` が任意のTに誤マッチ）。構造化データ（Observation）駆動に寄せる。
- FHIR: date検索の gt/lt が境界日を含む（`fhir/router.py:643-646`他）、Encounter/DiagnosticReport read が全患者スキャン、受診時刻09:00固定・予約30分固定（mappers）。

---

## 6. P4 — 衛生（HYG）

### HYG-1 — 新カルテUI一式（約4,073行）が未コミット 🔴
- **対象**: `git status` の `??`（frontend/src/components/chart/hooks|panels|primitives|sheet|shell|summary|work|write/）+ `docs/KARTE_UI_SPEC.md` + `docs/decisions/0006-karte-document-ui.md` + 削除された旧9ファイル + README等の変更。
- **現状**: 「全7フェーズ実装完了」の成果物 29ファイル・約4,073行が working tree にしか無い。`git clean` 一発で消える。
- **決定**: **今すぐコミットする**。論理単位で分けるのが理想だが、まず失わないことが優先。最低限:
  - 新カルテUI + スペック + ADR を1コミット（`feat(karte): ドキュメント型カルテUI（読む/書く/作業する）を実装`）。
  - 旧コンポーネント削除を含める。
  - このドキュメント（AUDIT_2026-07-06）も別コミットで。
- **AC**: `git status` に未追跡の新UIが残らない。`git log` に成果物が記録される。
- **依存**: なし。**他のどのタスクよりも先に済ませてよい**（作業のベースラインを固定するため）。

### HYG-2 — フロントエンドにテストが1本も無い
- **対象**: `frontend/`（test基盤なし）, `.github/workflows/`（フロントCIなし）
- **現状**: package.json に test script なし。vitest/jest/playwright 依存・設定・`*.test.tsx` すべて不在。7フェーズで作ったカルテUI（キーマップ・自動保存・ストリーム構築等）が無検証。バックエンドは140本あるがフロントは0。
- **決定**: Vitest + Testing Library を導入し、**まずロジック層（model系）から**テストを書く。優先対象:
  - `streamModel.ts`（`buildVisitBlocks`, `computeBillingPreview`）
  - `summaryModel.ts`（`buildSummary`）
  - `agentModel.ts`（`buildProposals`）
  - `orderSearch.ts`（BUG-2の回帰防止）
  - `vitalsModel.ts`（パースの脆さの回帰防止）
  そのあとキーマップ・autosave（LOSS-1）の統合テスト。CIに frontend-tests ワークフロー追加。
- **AC**: `npm test` が通る。上記model系に最低1ケースずつ。CIでフロントテストが走る。
- **依存**: なし。ただし各バグ修正（BUG-2, LOSS-1等）と同時にテストを書くのが効率的。

### HYG-3 — 死にコード（モックデータ・旧コンポーネント）の削除
- **対象**: `frontend/src/data/chartMock.ts`（約270行）, `frontend/src/data/workflowMock.ts`（約110行）, `frontend/src/components/SoapSection.tsx`, `frontend/src/App.tsx:205-207`
- **現状**:
  - `chartMock.ts` — 生きているのは型定義・`isVisitClosed`・`departmentOptions` のみ。`patientRecords`/`soap`/`labResults`/`prescriptions`/`visitHistory`/`getPatientById`/`patientNav`/`nextVisit` 等 約270行は参照ゼロの残骸。
  - `workflowMock.ts` — 生きているのは `demoUsers`（ログイン画面デモ）のみ。`prescriptionCatalog`/`labSetOptions`/`reservationSlots` 等 約110行は API 移行済みで参照ゼロ。
  - `SoapSection.tsx` — どこからも import されない旧SOAPコンポーネント。
  - `App.tsx:205-207` — `if (nextPatients.length === 0) { return; }` の無意味な分岐。
- **決定**: 死にコードを削除する。**ただし型定義（`PatientRecord`等）は生きているので、型を残しデータ配列だけ削る**。`demoUsers` は LoginScreen で使用中なので残す（SEC/デモ配布の判断は別途）。`departmentOptions` は FAKE-5 で実データ化してから削除。
- **AC**: 未参照のモックデータ配列・`SoapSection.tsx`・無意味分岐が消える。tsc/biome が通る。
- **検証**: `npx tsc --noEmit` が通る。`rg "patientRecords|getPatientById" frontend/src` が定義含め0（または型のみ）。
- **依存**: FAKE-5（departmentOptions の実データ化）を先に。

### HYG-4 — api.ts の未使用ラッパー11本の扱いを決める
- **対象**: `frontend/src/lib/api.ts`（`createReturnEventFromOrcaSample`, `searchDiagnoses`, `generateChartAiDraft`, `previewCopyLastPrescriptions`, `updateLabOrder`, `cancelLabOrder`, `updateImagingOrder`, `cancelImagingOrder`, `updateProcedureOrder`, `cancelProcedureOrder`, `cancelReservation`）
- **現状**: 11本がどこからも呼ばれていない。多くは「バックエンドにAPIはあるがUIが無い」機能退行の痕跡。
- **決定**: **配線するもの / 消すもの に仕分ける**:
  - 配線（他タスクで使う）: `updateLabOrder`/`cancelLabOrder`/`update|cancelImaging`/`update|cancelProcedure`（REG-1）、`cancelReservation`（予約取消UIを付ける）、`previewCopyLastPrescriptions`（Doプレビュー）、`searchDiagnoses`（病名追加をマスタ検索に）。
  - 削除 or 保留: `generateChartAiDraft`（AI下書きAPI自体がスタブ。FAKE系の整理後に判断）、`createReturnEventFromOrcaSample`（使うなら配線、使わないなら消す）。
- **AC**: 未使用ラッパーが「使われている」か「消えた」かのどちらかになる。
- **依存**: REG-1 と連動。

### HYG-5 — README とスペックの陳腐化を是正
- **対象**: `README.md:72, 73, 94, 147`, `docs/KARTE_UI_SPEC.md:341, 353-360`
- **現状（陳腐化3点 + スペック未実装4本）**:
  - README:73「これから: カルテ画面の再設計（ChartWorkspace.tsx はまだ巨大）」→ 再設計は7フェーズ完了済み、1,202行に分割済み。
  - README:94, 147「StyleSeed（Notion skin）」×2 → ADR 0003 で Apple HIG skin に転換済み（CLAUDE.md が「Notion skin記述は陳腐化」と明言済み）。[memory: project_design_system_pivot_styleseed]
  - README:72「病棟ワークフロー（入退院…）が動く」→ 入院登録・退院許可・退院実行のUIが無い（REG-2）。
  - KARTE_UI_SPEC:341,353-360 が要求する薄いAPI4本（billing-preview / summary / order-search / me-preferences）→ 全て未実装（me-preferences のみ localStorage 容認記述あり）。
- **決定**: [memory: feedback_no_wishy_washy_docs] に従い、**現状に合わせて記述を更新する（両論併記しない）**。「これから」に留まっているものは「これから」、完了したものは完了と明記。入退院は REG-2 完了後に「動く」と書く（それまでは「表示のみ」）。Notion skin 記述は Apple HIG に統一。未実装API4本はスペック内で「未実装」と明示。
- **AC**: README の3点が現状と一致。スペックの未実装APIが明示される。
- **依存**: 「動く」と書く項目は対応タスク（REG-2等）の完了後に。skin記述の修正は即可能。

### HYG-6 — 開発チェンジログ文言がユーザー画面に常設
- **対象**: `frontend/src/components/WardWorkspace.tsx:1594`
- **現状**: 「職種別フィルタと改訂履歴の入口を追加しました。」という開発者向けチェンジログがユーザー画面に常設表示。
- **決定**: 削除する（変更履歴を見せたいなら別途「更新情報」機構で）。
- **AC**: 当該文言が画面から消える。
- **依存**: なし。小。

---

## 7. 触ってはいけない / 壊してはいけないもの（回帰防止リスト）

修正時に以下を壊していないか確認すること。

- **API契約**（フロント↔バックのパス・メソッド・クエリ）。スキーマ変更時はフロント型も同時に。
- **監査ログ**: 書き込み系エンドポイントに `log_audit` の呼び出しが残っているか。同一トランザクション commit を維持。
- **マスタ取込スクリプト**（`backend/app/*_import.py`, `backend/scripts/import_*.py`）とその140テスト。ここは本番品質。触る必要は基本ない。
- **argon2 / CORS限定 / JWT検証 / タイムゾーン処理**（aware UTC + Asia/Tokyo）。SEC系修正で退行させない。
- **FHIR mapper の Decimal維持**（`mappers/observation.py:47` の float回避）。
- **DEMO→実データ移行パス**（`seed.py:1768-1798` の病名マスタ自動移行）。SEC-5/LOSS-4 の seed 変更で壊さない。

---

## 8. 検証手順（全体）

### フロントエンド
```bash
cd frontend
npx tsc --noEmit          # 型（現状: 通る）
npx biome check src       # lint/format（現状: 整形系中心に軽微な指摘）
npm run build             # tsc && vite build
# npm test               # HYG-2 導入後
```
手動確認は [memory: reference_manta_frontend_visual_verify] の手順（使い捨てハーネス + sibling playwright）。ローカルに Manta backend は通常無い点に注意。

### バックエンド（要 PostgreSQL）
```bash
# DB を起動（OrbStack/Docker が必要）
docker compose up -d db
cd backend
uv run alembic upgrade head
uv run pytest -q          # 140本。DBが無いと113本が接続エラーで落ちる（監査時の状況）
uv run lint-imports       # import-linter（モジュール層契約）
```
> **注意**: 監査時点では Docker デーモンが起動できず、pytest の最終確認は未了（113本が `psycopg.OperationalError` で失敗＝DB未接続が原因。テスト内容の失敗ではない）。DB を上げれば通る想定。着手エージェントは必ず DB を起動して現状の緑を確認してから修正に入ること。

### 一括
```bash
python3 scripts/verify_local.py   # pytest / lint / build / migration / compose疎通
```

---

## 9. タスク一覧（チェックリスト）

コピーして進捗管理に使う。

```
P0 セキュリティ
[ ] SEC-1  FHIRゲートウェイに認証必須化（+テストfixture）
[ ] SEC-2  平文パスワードフォールバック削除
[ ] SEC-3  JWTシークレットのデフォルト廃止・本番必須化（MANTA_ENV導入）
[ ] SEC-4  臨床操作のロールチェック（⚠️ロール設計判断）
[ ] SEC-5  seed無効化フラグ（MANTA_SEED_DEMO）

P1 嘘をつく表示
[ ] FAKE-1 点数プレビューを「—点」フォールバックに（⚠️本実装可否）
[ ] FAKE-2 救急ビュー削除 or 実データ化（⚠️）
[ ] FAKE-3 「看護必要度」を中立名称に改名
[ ] FAKE-4 「最近開いたカルテ」を実履歴に配線
[ ] FAKE-5 診療科フィルタを実データ由来に
[ ] FAKE-6 「接続中」「AI ready」バッジの正直化/削除
[ ] FAKE-7 スクライブ「録音中」表示の正直化
[ ] FAKE-8 エージェント提案「会計に追加」の正直化
[ ] FAKE-9 外来レセプト未実装の認識合わせ・文書化（⚠️大規模、別フェーズ）

P2 データ喪失
[ ] LOSS-1 自動保存の実装（最低localStorage退避）
[ ] LOSS-2 エラートースト機構の導入と全catch配線
[ ] LOSS-3 過去カルテをchart_notes駆動に
[ ] LOSS-4 seedのinsert-only化（退院・編集が巻き戻らない）

P3 機能退行・バグ
[ ] REG-1  オーダー編集・取消のUI配線
[ ] REG-2  入院登録・退院許可・退院実行のUI
[ ] REG-3  SPAルーター導入（⚠️依存追加）
[ ] BUG-1  検査フラグに低値異常(low)追加（臨床安全）
[ ] BUG-2  オーダー検索の常時true条件を修正
[ ] BUG-3  取消済み検査の再オーダー
[ ] BUG-4  経過時間ソート修正
[ ] BUG-5  imaging/procedureのid二重解釈統一
[ ] BUG-6  予約枠capacity=0の扱い
[ ] BUG-7  月次集計を診療月基準に
[ ] BUG-8  ageの実データ化（birth_date算出）
[ ] BUG-9  「68歳歳」二重表示
[ ] BUG-10 軽微まとめ（GET副作用/点数Decimal/打ち切り警告/recheck/ログインコード/バイタルパース/FHIR日付）

P4 衛生
[ ] HYG-1  新カルテUI約4,073行をコミット（最優先で）
[ ] HYG-2  フロントテスト基盤導入（Vitest）
[ ] HYG-3  死にコード削除（chartMock/workflowMock/SoapSection）
[ ] HYG-4  api.ts未使用ラッパー11本の仕分け
[ ] HYG-5  README/スペックの陳腐化是正
[ ] HYG-6  病棟の開発チェンジログ文言削除
```

---

## 10. 依存関係マップ（着手順の指針）

```
まず単独で（他をブロックしない・小さい）
  HYG-1（コミット）→ 全作業のベースライン
  SEC-1, SEC-2, BUG-2, BUG-3, BUG-6, FAKE-3, FAKE-6, FAKE-7, HYG-6

環境種別導入でまとめる
  SEC-3 + SEC-5 + LOSS-4（config/seed/env を一括で）

トースト先行で品質が上がる連鎖
  LOSS-2（トースト）→ REG-1, LOSS-1 の成功/失敗表示

型が繋がっているので同一PR
  BUG-1（low追加：フロント型+バック）
  BUG-8 + BUG-9（age実データ化）

実データ化してから削除
  FAKE-5（診療科実データ）→ HYG-3（chartMock削除）

配線が前提
  REG-1 → HYG-4（未使用ラッパー仕分け）
  REG-2 + LOSS-4 → HYG-5（READMEで「入退院が動く」と書ける）

大規模・別フェーズ（このドキュメントでは認識合わせまで）
  FAKE-9（外来レセプト）, REG-3（ルーター）, LOSS-3（過去カルテ駆動）
```
