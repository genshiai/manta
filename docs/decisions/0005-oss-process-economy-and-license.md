# 0005. Manta を プロセスエコノミー として OSS 公開、ライセンスは Apache 2.0 統一、商標で別途保護

- **Status**: Proposed
- **Date**: 2026-05-18
- **Deciders**: 長島大智 (GENSHI AI 代表)
- **Tags**: license, oss, community, marketing, governance

## Context（なぜこの決定が必要か）

GENSHI AI のミッション 4 本柱には **Open Knowledge** と **GENSHI Base (コミュニティ)** が既に含まれている。Manta はカルテ + レセコン + AI 算定補助という、日本の医療現場で「ブラックボックスのレガシー製品が支配する領域」を相手にする。

Manta を密室で作って完成品だけ世に出す従来型より、**作る過程をプロセスエコノミーとして公開し、医師・医療事務・エンジニア・投資家を共創ネットワークに巻き込む方が GENSHI AI ブランドと整合性が高く、競争優位を作れる**。

ただし以下の制約がある。

- **競合リスク**: 既存レセコン大手 / 病院 HIS ベンダーが完全 OSS を fork して類似 SaaS を展開できると、商用化の余地が削られる
- **医療データ機密性**: 患者データを扱う領域なので、公開素材は厳密に管理が必要
- **将来の商用化**: GENSHI AI は VC 出資を想定するスタートアップであり、将来的に Manta Cloud / Mantaレセコン SaaS として有償提供する余地を残す必要がある
- **コントリビューターの安心感**: ライセンスがコントリビューターに「自分の貢献が将来クローズドにされるのでは」という不安を与えると、共創が伸びない

伝統的な選択肢は以下のトレードオフを持つ。

| ライセンス | 共創スピード | 商用保護 | 説明コスト | 備考 |
|---|---|---|---|---|
| Apache 2.0 | ◎ | ✕ | 低 | 競合に完全に渡る |
| MIT | ◎ | ✕ | 低 | 特許保護なし |
| AGPL v3 | △ | ○ | 中 | SaaS 提供者に強制公開、企業忌避 |
| BSL 1.1 | ○ | ◎ (4年) | 高 | MariaDB, CockroachDB 採用 |
| FSL 1.1 | ◎ | ○ (2年) | 中 | Sentry 採用、BSL より簡潔 |
| SSPL | △ | ◎ | 高 | OSI 非認定、印象悪化 |

## Decision（何を決めたか）

### 公開方針

Manta は **プロセスエコノミー** として GitHub public 化し、**継続的な開発過程**を公開する。具体的には:

- リポジトリ全体 (backend / frontend / docs) を public
- ADR ([docs/decisions/](../decisions/)) を中心とした「なぜそう決めたか」の継続公開
- 進捗を週次で X、隔週で Zenn、月次で note に出す
- GitHub Discussions / Issues での機能投票・デザインレビューを公開で行う
- コミュニティを **GENSHI Base 配下の「Manta開発WG (Working Group)」** として運営。サブ部会: 臨床WG / 技術WG / 経営WG
- コミュニティ基盤は **2 段階導入**:
  - **Phase 1 (公開〜2-4 週)**: GitHub Discussions + 月例 Zoom + 公開ドキュメントサイト (manta.genshi.ai/docs)。運営負荷ピークを抑え、初動反応を観察
  - **Phase 1.5 (公開 2-4 週後)**: **Discord** を「Manta開発WG」サーバーとして導入。雑談・もくもく・show-and-tell をホスト。議事録化したい議論は Discussions / docs サイトに転記する運用ルール

### 公開ドキュメントサイトの構成

**Notion は採用しない**。理由: ADR / 設計文化と一貫しない、版管理が PR でできない、独自ドメイン・SEO・速度で劣る、エクスポートが汚い。

代わりに **git/markdown + 静的サイトジェネレータ** で `manta.genshi.ai/docs/` を構築。

- **採用**: [Zensical](https://zensical.org/) (Material for MkDocs の作者陣による次世代 SSG、Rust コア、2025-11 リリース)
- **Phase 1 用ホスティング**: Cloudflare Pages または GitHub Pages
- **公開内容**:
  - `docs/decisions/` の ADR をそのまま公開
  - ロードマップ (`docs/PDF_PROGRESS.md` 由来)
  - Manta開発WG メンバー名簿 (`docs/wg/members.md`)
  - 月例議事録 (`docs/wg/meetings/YYYY-MM.md`)
  - 貢献ガイド・行動規範
  - 用語集 (rezeko / FHIR / SOAP / 算定 等)
  - 議題収集は GitHub Discussions に集約 (誰でも書ける場として)

### Zensical 採用のリスクとフォールバック

Zensical は 2025-11 リリースで実績が少ない。リスクが顕在化した場合は **`mkdocs.yml` 互換性により Material for MkDocs へフォールバック可能**。コンテンツ (markdown) は変更不要。
- PR TIMES は **β公開 / 初導入医療機関 / 主要提携 / 資金調達** などのマイルストーンと紐づけて投下、継続発信媒体としては使わない

### ライセンス: 全領域 Apache 2.0 統一

**3 層分割や FSL は採用しない**。リポジトリ全体に **Apache 2.0** 一本で統一する。

| 観点 | Apache 2.0 単独 | FSL 3 層分割 (旧案) |
|---|---|---|
| 説明コスト | 最小 | 高 (3 種類のライセンス境界を維持) |
| コントリビューター混乱 | なし | あり |
| 普及スピード | 最大 | 中 |
| 商用 fork リスク | あり (受容) | 低 (2 年保護) |
| 「本気度」シグナル | ◎ Kubernetes / TensorFlow と同等 | △ 「保護を残している」と読まれる |

**Apache 2.0 を選ぶ理由**:
- 普及最大化 (Kubernetes, Android, TensorFlow, Apache Spark など定番)
- 特許条項あり = コントリビューターが後から特許で殴ってこない保証
- 大企業採用に好まれる
- MIT より少し長いが、特許保護で医療AI 領域には適切
- GPL は「コードを使うと自分のコードも GPL になる」連鎖が嫌われ、貢献者離れに繋がる

**商用 fork リスクは受容**: 既存レセコン大手 / HIS ベンダーが fork して自社製品化する可能性はあるが、コミュニティ・ブランド・ドメイン知識・実装速度は fork できない。Linux / Apache HTTP Server / Kubernetes も同じ前提で世界制覇した。

### ブランド戦略: 「Powered by Manta」モデル (攻撃的普及)

従来の OSS の防御的ブランド保護 (Firefox/IceWeasel: 名前を使わせない) ではなく、**攻撃的普及型** を採用する。fork や派生プロダクトに対して「Manta 由来であることを明記せよ」を強制し、Manta ブランドの偏在を作る。

**参考モデル**:
- **Intel Inside**: 搭載 PC は Intel ロゴ表示が条件、Intel ブランドが PC エコシステムに偏在
- **Powered by Vercel / Made with Next.js**: フロントエンドフレームワークが利用先で常に可視化
- **Built on Stripe**: 決済 SaaS が組み込み先で信頼の証として表示
- **WordPress**: 公式テーマで "Powered by WordPress" フッター、世界の Web の 40% で可視化
- **Creative Commons BY**: 出典明記が義務、明記しないと違反

**ロジック**: 名前を使わせない (防御) より、名前を使わせて出典強制 (攻撃) の方がブランド拡散は圧倒的に強い。Manta が使われるほど Manta の名前が世界に増える。

### Apache 2.0 §4(d) の NOTICE 条項で実現

Apache 2.0 はライセンス本文で「NOTICE ファイルの中身は derived work でも保持必須」と定めている (§4(d))。NOTICE に attribution 要件を書けば、fork も派生サービスもそれを引き継ぐ義務がある。

### NOTICE 雛形

```text
Manta
Copyright 2026 GENSHI AI, Inc.

This product is based on Manta (https://manta.genshi.ai/),
an open-source EHR and medical billing platform developed by
GENSHI AI, Inc.

Derived works and products built on Manta MUST:
- Retain this NOTICE file in source distributions
- Display "Based on Manta" or "Powered by Manta" attribution
  in user-facing documentation, "About" screens, and the
  primary README
- Link back to https://manta.genshi.ai/ where reasonable
- Use the official "Powered by Manta" badge (provided at
  manta.genshi.ai/brand) where a visual mark is appropriate

The "Manta" and "GENSHI AI" names and logos are trademarks of
GENSHI AI, Inc. See TRADEMARKS.md for full guidelines.
```

### TRADEMARKS.md の方針 (攻撃的普及型)

- 「Manta」「Manta開発WG」「GENSHI AI」は GENSHI AI 株式会社の商標
- **fork や派生プロダクトは Manta 由来であることを明記する義務**
- **「Based on Manta」「Powered by Manta」「Manta-compatible」は積極推奨**。これらの表記は商用サービスでも自由に使える
- **公式「Powered by Manta」バッジを配布**、誰でも商用サービスに貼ってよい
- ただし、混乱防止のため以下は禁止:
  - プロダクト名そのものを単に「Manta」「Manta XX」と名乗ること (例: "Manta Pro", "Manta Cloud" を Manta 公式と誤認させる名乗りは NG)
  - 「Manta 公式」「Manta 認定」を許可なく名乗ること
- 教育・記事・スクショ・解説は fair use として完全自由

### ブランド資産配布

- `manta.genshi.ai/brand/` で公式ロゴ・「Powered by Manta」バッジ・color hex を PNG/SVG/Figma で配布
- `manta.genshi.ai/showcase/` (Hall of Fame) で Manta 採用サービスを掲載、相互利益で採用ハードルを下げる
- 将来的に「Manta Compatible」認定プログラム検討 (Kubernetes Certified 風)

### 商標登録 (別途タスク)

- 特許庁に「Manta」を出願 (クラス 9: ソフトウェア、クラス 42: SaaS)
- 既登録の GENSHI AI 商標と同等に保護
- 「Powered by Manta」マーク自体も商標として保護検討

### 必須ファイル

- `LICENSE`: Apache 2.0 全文 (リポジトリルート)
- `NOTICE`: Copyright と attribution 要件、再配布時必須
- `TRADEMARKS.md`: 商標ポリシー全文、「Powered by Manta」推奨運用

### コントリビューター契約

- **DCO (Developer Certificate of Origin)** を採用。CLA (Contributor License Agreement) は採らない
- 理由: CLA は手続きコストが高くコントリビュートを阻害する。DCO は `git commit -s` の Signed-off-by で済む
- GitHub Actions で DCO check を自動化

### ガバナンス

- 当面は GENSHI AI が **BDFL (Benevolent Dictator)** モデルで意思決定
- ADR を意思決定の公式記録とし、外部 contributor も ADR PR で提案可能
- 将来コミュニティが拡大したらガバナンス見直し (Steering Committee 等) を別 ADR で

## Consequences（帰結）

### Positive

- GENSHI AI の Open Knowledge / GENSHI Base ミッションと完全整合、ブランド強化
- 医師×医療事務×エンジニア×投資家 の 4 層共創ネットワークを構築できる
- 「医師が作る OSS レセコン」という稀少性で日本の医療 IT 業界での認知を獲得
- 透明性が高い = 医療機関の信頼を得やすい (ブラックボックスでない)
- 採用力強化: GENSHI AI 全体の採用にも効くトップ・オブ・ファネル
- ADR / コードレビューが「公開素材」として常時整う品質ドライブ
- Apache 2.0 により、長期的なオープン性を初日から担保

### Negative

- 公開オペレーション (PR レビュー、Issue 対応、Discord 運営) の継続工数が増える
- 競合に設計思想を観察される (ただしレセコン業界の動きは遅く、観察されても先行優位は保てる)
- セキュリティ (脆弱性公開窓口、CVE 対応プロセス) の整備が必須になる
- 商用 fork・SaaS 化をライセンスで防ぐ保護は無い (受容した上で、コミュニティ・ブランド・実装速度で勝負する)
- 患者データ取り扱いの誤公開リスク (スクリーンショット、テストデータ) を厳格に管理する必要

### Neutral / Trade-offs

- **ライセンス変更は一方通行**。この非対称性が「まず Apache 2.0 で始める」ことの隠れた利点でもある:
  - **Apache 2.0 → copyleft (AGPL 等) は開いている**。Apache 2.0 は GPLv3 / AGPLv3 に片道互換なので、将来版のライセンスを AGPL に切り替えることは外部コントリビューターの同意なしに可能。公開済みの版は Apache 2.0 のまま残り、そこから fork を続ける自由も残る (守れるのは将来の開発分だけ)
  - **AGPL → Apache 2.0 は事実上閉じる**。copyleft を緩める変更は全著作権者の同意が必要。CLA を課さず DCO で受ける Manta の方針 (著作権は各コントリビューターに残る) では、外部 PR を 1 本マージした時点で単独では変更できなくなる
- **AGPL への将来分岐は最後の手段として位置づける**。引き金は「大手が還元なしに SaaS 化し、コミュニティの持続性を実際に損なう事態」。ただし AGPL は企業の利用ポリシーで一律忌避されることが多く普及最大化と矛盾するうえ、外部貢献を含む AGPL コードベースは自社の SaaS 提供 (Manta Cloud 構想) にも改変ソースの公開義務を課す。発動は別 ADR を起票して判断する

## Alternatives Considered（他に検討した選択肢）

- **完全クローズド**: プロセスエコノミーのメリット (共創、ブランド、信頼) を全て失うため不採用
- **FSL-1.1-Apache-2.0 (旧案)**: 競合 SaaS 化を 2 年間防げるが、説明コストが高く、コントリビューターに「商用利用への制約」と誤読されて参加を躊躇させるため不採用。普及最大化を優先
- **3 層分割 (FSL core / Apache connectors / MIT design)**: 説明コストが高すぎ、コントリビューターが「自分の貢献がどのライセンスに入るか」を悩む。普及スピードが落ちるため不採用
- **BSL 1.1 (4 年)**: 採用例豊富だが商用保護を残す形で、Linux/Kubernetes 路線とは哲学が違うため不採用
- **AGPL v3**: SaaS 提供者にソース公開強制で保護強だが、企業ユーザーの忌避感が強く共創スピード低下
- **GPL v3 / GPL v2 (Linux/Git 路線)**: copyleft で「コードを使うと自分のコードも GPL」連鎖が嫌われ、特に企業エンジニア・派生プロダクトから敬遠される。普及最大化と矛盾
- **MIT 単独**: 最もシンプルだが特許条項なし。医療AI 領域では特許リスクが高いため、Apache 2.0 の特許保護を優先
- **SSPL**: OSI 非認定で「open washing」の批判を受ける可能性
- **CLA 採用**: コントリビュート障壁が上がるため不採用、DCO で十分
- **PR TIMES を継続発信媒体として併用**: 1 件あたりのコストと媒体特性 (点の通知) を考えると、X / Zenn / note の方が継続発信に向く。PR TIMES はマイルストーン専用に絞る
- **ブランド保護をライセンスでやる (例: 旧 BSD 4-Clause の広告条項)**: 現代では非推奨、ライセンス汚染・互換性問題を起こす。Apache 2.0 NOTICE + 商標で別レイヤー管理が正解
- **「IceWeasel モデル」(fork は別名強制)**: 防御的だが普及スピードが落ちる。Manta は **攻撃的普及型 (Powered by Manta モデル)** を選択し、fork に Manta 由来明記を強制することでブランド偏在を狙う

## Lessons Learned / 振り返り（後追い記入）

未記入。

## References

- [Apache License 2.0 全文](https://www.apache.org/licenses/LICENSE-2.0)
- [Apache Software Foundation 商標ポリシー](https://www.apache.org/foundation/marks/) (参考にできる)
- [Linux 商標と Linux Foundation の管理](https://www.linuxfoundation.org/legal/trademark-usage)
- [Mozilla 商標ポリシー (Firefox の参考事例)](https://www.mozilla.org/en-US/foundation/trademarks/policy/)
- [CNCF (Kubernetes) 商標ポリシー](https://www.linuxfoundation.org/legal/trademark-usage)
- [けんすう氏 プロセスエコノミー note](https://kensuu.com/n/nf4270e069c20)
- 関連: [PUBLIC_RELEASE_CHECKLIST.md](../PUBLIC_RELEASE_CHECKLIST.md)
- 関連 ADR: [0004 Mantaレセコンと AI 算定補助層](0004-receipt-gateway-and-ai-claims-assist.md)
