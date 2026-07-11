# Manta OSS 公開準備レポート

最終更新: 2026-07-11 ／ 対象: `fix/audit-remediation` ブランチ(108 コミット時点)

> 公開準備の進捗管理は、このドキュメントを正本とする。旧 `PUBLIC_RELEASE_CHECKLIST.md` の役割はここに引き継ぎ、同ファイル自体は内部情報を含むため REL-3 でリポジトリ外へ移す。
> コード側の監査タスク(SEC / FAKE / LOSS / REG / BUG / HYG)は [AUDIT_2026-07-06_REMEDIATION.md](AUDIT_2026-07-06_REMEDIATION.md) が正本。このレポートは公開準備タスクを **REL-1〜12** として追加する。

## 結論

**公開ブロッカー(REL-1〜5)は 2026-07-11 に解消した。** 残っているのは、①公開直前にミラーで行う履歴除去(filter-repo。手順は §5 末尾に確定済み)、②公開時に揃える整備(REL-6〜10)、③リポジトリ外の関係者調整、の 3 つ。

コード側の公開ブロッカー(P0 セキュリティと、動いている風の見せかけ表示)は 7/7 の是正スプリントで解消済み。AI・外来レセプト・ORCA 実送信は未実装のまま残るが、UI 上で未実装だと分かる表示に直してあるので、Pre-Alpha として公開する分には妨げにならない。プロセスエコノミーとして出す以上、機能が足りないことより「動いている風の捏造」のほうがブランドを毀損する。是正はその方針で行った。なお、エージェント接続の方針(全機能の MCP 化)を [ADR 0007](decisions/0007-mcp-agent-interface.md) と [MCP_STRATEGY.md](MCP_STRATEGY.md) に確定した。

---

## 1. 公開までの歩み

| 時期 | 出来事 |
|---|---|
| 2026-04-29 | 最初のコミット。外来 1 ループ MVP(SOAP 保存、処方、受付) |
| 2026-04-29〜05-19 | 集中開発 89 コミット。病棟、レセコン基盤、FHIR R4B / JP Core、公的マスタ取込 5 系統(MEDIS 病名、薬価、HOT、PMDA 添付文書、レセ電)、import-linter によるレイヤー強制、backend CI |
| 2026-05-18 | プロセスエコノミーとして公開する方針を決定。ライセンスは FSL や 3 層分割を検討した末、Apache 2.0 一本に([ADR 0005](decisions/0005-oss-process-economy-and-license.md)) |
| 2026-05 下旬〜07-05 | カルテ UI を「読む、書く、作業する」のドキュメント型へ刷新([ADR 0006](decisions/0006-karte-document-ui.md)、全 7 フェーズ) |
| 2026-07-06 | 公開前監査を 2 本実施。①リポジトリ監査(履歴のシークレット、実患者データ、第三者著作物、内部情報) ②実装監査(モック、見せかけ表示、危険実装の全数調査 → [監査指示書](AUDIT_2026-07-06_REMEDIATION.md)、43 タスク) |
| 2026-07-07〜08 | 是正スプリント 19 コミット。FHIR 無認証の閉鎖、環境種別 `MANTA_ENV` の導入、見せかけ表示 8 件の正直化、下書き自動保存など 28 タスクを解消。バックエンド 141 テスト緑 |
| 2026-07-11 | 本レポート作成、残作業を REL 系列に整理。同日中に REL-1〜5(体裁ブロッカー)を解消し、MCP 方針を [ADR 0007](decisions/0007-mcp-agent-interface.md) に起票 |

数字で見る現在地: 108 コミット、追跡ファイル 369、バックエンドは Python 148 ファイルとテスト 141 本、フロントエンドは 124 ファイルとテスト 0 本(テスト基盤の導入は HYG-2)。

実装監査の結論はこうだった。骨格(API 契約約 100 ルート、CRUD 全般、監査ログ、マスタ取込)は本物。一方で対外的な看板(AI、レセプト点数計算、ORCA 連携)はすべてシミュレーションで、公開前提だと FHIR ゲートウェイ無認証という致命傷が 1 つ。是正スプリントで致命傷と危険な既定値を塞ぎ、見せかけ表示は未実装であることが見える方向へ直した。

残っているのはコードではなく OSS の体裁。ライセンスファイルが無い(README がバッジを掲げているのに)。第三者著作物が 3 系統、内部情報を含む文書が 2 本、リポジトリに残っている。以降はその切り分けと作業指示。

---

## 2. 全体ステータス

| 領域 | 状態 | 内訳 |
|---|---|---|
| リスク監査(履歴・データ) | ✅ 完了 | gitleaks 全 108 コミット漏洩ゼロ、実患者 PII なし、マスタ実データ非同梱、著者メール noreply 統一 |
| コードの公開ブロッカー(P0/P1) | ✅ 完了 | SEC 系 7 件と FAKE 系 8 件を是正済み。SEC-4(ロール制御)のみ設計判断待ちで公開後早期に |
| コードの残タスク(P3/P4) | 🚧 28/43 完了 | 残 14+1 件。いずれも公開ブロッカーではない(§3) |
| 法務ファイル | ✅ 完了(07-11) | LICENSE、NOTICE、TRADEMARKS.md、license フィールド(REL-1) |
| 第三者著作物・内部情報の除去 | ✅ HEAD 完了(07-11) | PDF・画像・内部文書は ../manta-private/ へ退避、ローカルパス除去(REL-2〜4)。**履歴除去は公開直前に filter-repo** |
| ライセンス記述の統一 | ✅ 完了(07-11) | docs/first を archive 化 + バナー、AGPL 記述を是正(REL-5) |
| コミュニティファイル | ⛔ 未着手 | CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、GOVERNANCE(REL-6) |
| GitHub 整備 | 🚧 一部 | backend CI のみ。frontend CI、DCO チェック、テンプレート、dependabot が無い(REL-7) |
| README 仕上げ | 🚧 一部 | 本文とアーキ図は済。clone URL、スクリーンショット、たたき台の上書きが残る(REL-8) |
| 発信・関係者調整 | ⛔ リポジトリ外 | 私的チェックリストで管理(本レポートの対象外) |

---

## 3. プロダクト実装の切り分け

「何が本物で、何が途中で、何が未実装か」。公開後に Issue で聞かれる前に、自分たちで言えるようにしておく。

### 実装済み(本番相当の品質)

| 機能 | 備考 |
|---|---|
| API 契約 約 100 ルート | フロントとバックエンドの不整合ゼロ |
| 外来カルテ CRUD | SOAP 版管理、オーダー発行、予約、病名、処方コピー、相互作用警告 |
| 病棟ワークフロー | ベッドボード、指示、看護記録、文書署名、クリニカルパス |
| 医事(入院) | ClaimDraft 生成、施設別ルール DSL、点数調整、返戻イベント、月次クローズ |
| 認証・環境安全 | argon2 + JWT、FHIR 含む全ルート認証必須、`MANTA_ENV=production` でデフォルト secret 拒否と demo seed 停止 |
| 監査ログ | 全書き込み操作を同一トランザクションで記録 |
| 公的マスタ取込 5 系統 | 実フォーマットのパーサ + DEMO から実データへの自動移行。データ自体は同梱せず利用者が取得 |
| FHIR R4B / JP Core | Patient、Condition、Observation、MedicationRequest、Appointment |
| バックエンドテスト 141 本 | 異常系(403/404/409)まで。skip ゼロ |

### 実装途中(動くが配線・設計が残る)

| タスク | 内容 | 残っている理由 |
|---|---|---|
| SEC-4 | 臨床操作のロール制御(医事アカウントで処方できてしまう) | ロール体系の設計判断待ち。公開後の最優先 |
| REG-1 / HYG-4 | オーダー編集・取消の UI 配線(API とラッパーは既にある) | UI 目視検証の段取り |
| REG-2 | 入院登録、退院許可、退院実行の UI(バックエンド 3 エンドポイントは実装済み) | 導線の設計判断 |
| REG-3 | SPA ルーター(現状リロードで受付に戻る) | 依存追加の判断 |
| LOSS-3 | 過去カルテを chart_notes 駆動に(現状はシード JSON 表示) | 中規模の設計 |
| BUG-5 / BUG-7 / BUG-10 | id 二重解釈、月次集計の基準月、軽微まとめ | 中規模リファクタ |
| A-8 / A-10 / A-11 | ログイン失敗ロック、監査ログの定型化と user_id | 小〜中 |
| HYG-2 | フロントエンドテスト基盤(Vitest) | 継続タスク |

### 未実装(構想段階。UI では未実装と明示済み)

| 機能 | 現状 |
|---|---|
| AI 機能全般 | LLM 接続はコードベース全体でゼロ。サマリーや提案はルール生成。「AI ready」表示は削除済み |
| エージェント接続(MCP) | 方針確定([ADR 0007](decisions/0007-mcp-agent-interface.md)・[MCP_STRATEGY.md](MCP_STRATEGY.md))。全機能をタスク粒度ツールで公開、確定系は意図的に非公開。実装は SEC-4(ロール設計)の後 |
| 外来レセプト | 点数計算、UKE 生成、患者負担金が存在しない(FAKE-9)。別フェーズの実装計画を立てる |
| ORCA 実送信 | mock アダプタのみ。日レセ API 互換の実通信は未実装 |
| 音声スクライブ | 器のみ。録音デモである旨を UI に明示済み |

---

## 4. OSS 公開要件の切り分け

### 完了

- git 履歴の安全確認: gitleaks で全 108 コミットをスキャンし漏洩ゼロ。`.env` 系の混入は example のみ。シークレットのローテートや履歴洗浄は不要
- 著者情報: author は GitHub noreply に統一済み。過去 contributor は本人のみで、同意取得の課題なし
- デモデータ: 人名はすべて架空(鈴木花子、田中太郎ら)。実在 ID や実患者由来の組み合わせなし
- マスタデータ: MEDIS、薬価、PMDA、レセ電いずれも実データ非同梱。再配布ライセンス問題なし
- 危険な既定値: `MANTA_ENV` 導入で本番のデフォルト secret 起動を拒否(SEC-3/5)

### 途中

- README: 本文、アーキテクチャ図(docs/architecture.html)、ステータス表記は整備済み。clone URL プレースホルダ、スクリーンショット、たたき台マーカーが残る(REL-8)
- CI: backend の lint + pytest は動いている。frontend、DCO、dependabot が無い(REL-7)
- compose: 動作は問題ないが、DB の 5432 が全インターフェースに公開されている(REL-9)

### 未着手

REL-6〜7 と REL-10〜12(REL-1〜5 は 2026-07-11 に解消済み)。詳細は次章。

---

## 5. 残作業の詳細(REL タスク)

タスク ID は不変。1 タスク = 1 PR を原則とし、コミットに `[REL-n]` を付ける。

### 公開ブロッカー(REL-1〜5) — ✅ 2026-07-11 に HEAD で解消。残るは公開直前の filter-repo のみ

#### REL-1 — ライセンス 3 点セットの作成

- **状態**: ✅ 完了(2026-07-11)。ADR 0005 の FSL 時代の残骸も是正し、ライセンス変更の可逆性を追記
- **対象**: リポジトリ直下 `LICENSE`、`NOTICE`、`TRADEMARKS.md`、`backend/pyproject.toml`、`frontend/package.json`、`README.md:219-226`
- **現状**: README が Apache 2.0 バッジを掲げているのに実ファイルが無い。法的には全権利留保のままで、OSS として成立していない。pyproject と package.json にも license フィールドが無い
- **作業**:
  1. `LICENSE` に Apache License 2.0 全文
  2. `NOTICE` に copyright(GENSHI AI 株式会社)と Powered by Manta の attribution 要件。Apache 2.0 §4(d) により派生物へ引き継がれる。文面は [ADR 0005](decisions/0005-oss-process-economy-and-license.md) の方針から起こす
  3. `TRADEMARKS.md` に商標ポリシー(fork は Manta 由来の明記が必要、Powered by Manta バッジは商用でも自由)
  4. `pyproject.toml` に `license = "Apache-2.0"` と authors、`package.json` に `"license": "Apache-2.0"`
  5. README の「ライセンス本文は公開準備中」の一文を削除し、実ファイルへのリンクに差し替え
- **完了条件**: GitHub がリポジトリのライセンスを Apache 2.0 と自動認識する

#### REL-2 — 第三者著作物の削除(履歴ごと)

- **状態**: ✅ HEAD 完了(2026-07-11)。実ファイルは ../manta-private/assets/ へ退避、参照 6 本を注記化。**履歴除去は公開直前の filter-repo で実施**(下記手順)
- **対象**: `docs/requirements/karte-system.pdf`、`docs/karte-images/` 全 5 枚、`docs/design-reference/assets/` の blanc-detail.png、medlocal-blanc-karte.png、localhost-8080-karte.png
- **現状**: 第三者作成の病院 EMR 調達仕様書(170 ページ)と、他社製品の UI 画像がリポジトリに入っている。再配布する権利が確認できない
- **作業**:
  1. 上記ファイルを削除(自社スクリーンショットの manta-*.png 3 枚は残す)
  2. 参照箇所を修正: `docs/Plan.md`(8、76、119、252 行目)と `docs/PDF_ACTION_BACKLOG.md:3` は「原本仕様書は私的資料として保管、リポジトリには含めない」と一文で置き換え。導出済みの要件テキスト自体は自作なのでそのまま残してよい
  3. **履歴からも除去する**(下記「履歴の書き換え」参照)。git clone は全履歴を配布するため、HEAD で消しても第三者著作物の再配布は止まらない
- **完了条件**: `git log --all -- docs/requirements/karte-system.pdf` が空になる

#### REL-3 — 内部文書の退避(履歴ごと)

- **状態**: ✅ HEAD 完了(2026-07-11)。2 ファイルを ../manta-private/docs/ へ移動、参照 9 箇所を差し替え。**履歴除去は公開直前の filter-repo で実施**
- **対象**: `docs/PUBLIC_RELEASE_CHECKLIST.md`、`docs/DESIGN_REVIEW_KARTE_UX.md`
- **現状**: 前者に協力者の実名、提携先、公開後の数値目標などの内部情報。後者に競合製品の詳細分析と、非公開の姉妹リポジトリへの参照
- **作業**:
  1. 2 ファイルをリポジトリ外の私的メモへ移す(必要な項目はこのレポートと私的チェックリストに引き継ぎ済み)
  2. 参照箇所を修正: `README.md:104` のリンクを本レポートへ差し替え。`docs/DESIGN_GUIDELINES.md:343` と `docs/IMPLEMENTATION_PLAN_UI_REFRESH.md`(50、684、786 行目)の DESIGN_REVIEW 参照は「UI 検討メモ(私的保管)」の注記に置き換え
  3. 履歴からも除去(REL-2 と同時に実施)
- **完了条件**: リポジトリ内の grep で協力者名、提携先名がゼロ件

#### REL-4 — ローカルパスと壊れリンクの掃除

- **状態**: ✅ 完了(2026-07-11)。7/7 コミットで新たに入った私的リポジトリ参照(KARTE_UI_SPEC、ADR 0006)も含めて除去
- **対象**: `/Users/daichi/...` を含む docs 8 ファイル(MASTER_DATA_DOWNLOADS.md に約 15 箇所、他に AUTH_DECISION、IMPLEMENTATION_PLAN、IMPLEMENTATION_PLAN_UI_REFRESH、MASTER_DATA_REQUIREMENTS、PDF_ACTION_BACKLOG、Plan)、`frontend/CLAUDE.md:64`、`docs/decisions/0001:44` と `0002:69`
- **現状**: 開発機のユーザー名とディレクトリ構造が露出。frontend/CLAUDE.md と ADR 2 本が、公開リポジトリに存在しない `.claude/` 配下(個人メモリと内部プラン)へリンクしており、他人には壊れリンクになる
- **作業**: ローカル絶対パスは `~/Downloads/manta-master-data/` のような一般表記へ置換。CLAUDE.md のメモリ参照は原則を本文にインライン化。ADR のプランリンクは「内部作業メモ(非公開)」の注記に変更
- **完了条件**: `grep -r "/Users/" --include="*.md"` と `grep -r ".claude/" docs/ frontend/CLAUDE.md` が実質ゼロ(コード例を除く)

#### REL-5 — ライセンス記述の統一(AGPL の残骸)

- **状態**: ✅ 完了(2026-07-11)。docs/archive/first-concept/ へ移設し全ファイルにバナー付与
- **対象**: `docs/first/` ディレクトリ一式、`docs/DEVELOPMENT_GUIDELINES.md:16`
- **現状**: 最初期の構想文書(2026-04 の Tauri デスクトップ前提、AGPL-3.0 前提)がそのまま残っており、ADR 0005 の Apache 2.0 統一と矛盾する。DEVELOPMENT_GUIDELINES にも AGPL の記述が 1 箇所
- **作業**: `docs/first/` は削除せず `docs/archive/first-concept/` へ移し、冒頭に「2026-04 時点の初期構想。ライセンスは ADR 0005 で Apache 2.0 に、デスクトップ構想は Web 優先に転換済み」のバナーを付ける(紆余曲折ごと公開する方針に沿って、消すのではなく履歴として残す)。DEVELOPMENT_GUIDELINES:16 は Apache 2.0 に修正
- **完了条件**: リポジトリ内の AGPL 言及が archive 内の歴史的記述(バナー付き)のみになる

#### 履歴の書き換え(REL-2 と REL-3 の共通手順)

対象 7 パスを全履歴から抜く。単独著者なので履歴書き換えの同意問題は無い。作業はミラーで行い、元の private リポジトリはアーカイブとして残す。

```bash
git clone --mirror <private-repo> manta-mirror && cd manta-mirror
git filter-repo \
  --invert-paths \
  --path docs/requirements/karte-system.pdf \
  --path docs/karte-images \
  --path docs/design-reference/assets/blanc-detail.png \
  --path docs/design-reference/assets/medlocal-blanc-karte.png \
  --path docs/design-reference/assets/localhost-8080-karte.png \
  --path docs/PUBLIC_RELEASE_CHECKLIST.md \
  --path docs/DESIGN_REVIEW_KARTE_UX.md
# → これを公開用リポジトリとして push する
```

コミットハッシュは変わるが、ADR や docs はパスで相互参照しているので壊れない。公開後の履歴書き換えは不可能に近いので、この 7 パスに漏れが無いかを public 化の直前にもう一度確認する(§6 のチェックリスト)。

### 公開時に揃えるもの(REL-6〜10。ブロッカーではないが初日に有る方が良い)

#### REL-6 — コミュニティ文書 4 本

- `CONTRIBUTING.md`: 開発環境(compose、uv、npm)、PR ルール(Conventional Commits + 日本語 subject)、DCO(`git commit -s`)、ADR の起票方法
- `CODE_OF_CONDUCT.md`: Contributor Covenant 2.1 の日本語版
- `SECURITY.md`: 脆弱性報告先、初動と修正の目安、実患者データに影響する脆弱性は最優先と明記
- `GOVERNANCE.md`: 現状は BDFL(GENSHI AI)、意思決定は ADR ベース、と短く
- **前提**: 報告用と行動規範用のメールボックス開設。開設が間に合わなければ GitHub の Private vulnerability reporting を一次窓口にして README にその旨を書く(こちらを推奨。メール運用より漏れない)
- README の「CONTRIBUTING は公開準備中」の一文を実リンクに差し替え

#### REL-7 — .github 整備

- Issue テンプレート 3 種(bug_report、feature_request、医療現場からの業務提案)と config.yml(Discussions への誘導)
- PULL_REQUEST_TEMPLATE.md(Conventional Commits、DCO、テスト方針のチェック欄)
- DCO チェックワークフロー(README が DCO を要求しているのにチェックが無い状態を解消)
- dependabot.yml(pip と npm と actions)
- frontend CI(tsc --noEmit、biome check、vite build。テストは HYG-2 完了後に追加)

#### REL-8 — README 仕上げ

- clone URL のプレースホルダを公開 URL に差し替え
- スクリーンショット 1〜2 枚(カルテ画面と受付)を `docs/screenshots/` に追加して挿入
- たたき台マーカー(HTML コメント)の中身を本人の声で確定し、マーカーを外す。`docs/why-manta.md` の同マーカーも同様

#### REL-9 — compose の公開ポート最小化

- `compose.yaml:10-11` の db を `"127.0.0.1:5432:5432"` バインドに変更。デモ credential(manta/manta)のまま LAN に晒さない

#### REL-10 — 小修正まとめ(1 PR で)

- `backend/app/modules/gateway/fhir/loinc.py` 冒頭に LOINC(Regenstrief Institute)の出典と利用条件の一文
- `docs/why-manta.md:108` の「ORCA の CLAIM 通信は 2026 年 3 月末で廃止予定」を過去形に(既に廃止済み)
- `docs/mock-html/README.md` に「患者名と ID はすべて架空」の一文

### 公開後でよいもの

- **REL-11** — 英語 README(海外コミュニティへ届けたくなった時点で)
- **REL-12** — ブランド資産(ロゴ、Powered by Manta バッジの PNG/SVG、docs/brand/)
- コード側の残タスク(§3 の実装途中の表)。SEC-4 のみ公開後の最優先とする

---

## 6. 公開判断

### Go の条件

1. REL-1〜5 の完了(法務と情報衛生)
2. filter-repo 後のミラーで最終確認 3 点: `gitleaks detect`、削除 7 パスの `git log --all` が空、`grep -r` で内部固有名詞ゼロ
3. リポジトリ外の調整(関係者への事前共有、告知記事)は私的チェックリストで管理。ここが済んでいること

REL-6〜10 は初日に有る方が良いが、Go を止めるほどではない。CONTRIBUTING が無くても PR は来るし、来てから整えても間に合う。

### 止める条件

- filter-repo 後の最終確認で新たな混入が見つかったとき
- 公開直前の 1 週間に、患者安全に関わる P0 級のバグが未修正で見つかったとき

---

## 7. この文書の運用

- REL タスクの完了ごとに §2 と §5 を更新する(タスク ID は変えない)
- 公開後は、このレポート自体がプロセスエコノミーの記録として残る。内部情報を書かないこと(協力者名、提携先、数値目標、私的リポジトリのパスは書かない。それらは私的チェックリストへ)
