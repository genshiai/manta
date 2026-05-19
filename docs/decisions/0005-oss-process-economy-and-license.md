# 0005. Manta を プロセスエコノミー として OSS 公開、ライセンスは FSL-1.1-Apache-2.0 を採用

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

### ライセンス構成

**3 階層のライセンスを使い分ける**:

| 範囲 | ライセンス | 理由 |
|---|---|---|
| **core** (backend application, frontend application) | **FSL-1.1-Apache-2.0** | 競合 SaaS 化を 2 年間防ぎつつ、社内利用・コントリビュート・読解は完全自由。2 年後に Apache 2.0 へ自動変換 |
| **connectors** (`gateway/`, ORCA adapter, FHIR utility, master sync) | **Apache 2.0** | 医療 IT エコシステム全体の標準化に寄与。連携を作りやすくすることが Manta 普及にも資する |
| **design tokens / UI primitives** (`frontend/src/styles/theme.css`, 公開可能な UI コンポーネント) | **MIT** | 視覚的影響力を最大化。「モダンな医療系 UI」のリファレンス実装としての価値を最大化 |

### FSL-1.1-Apache-2.0 の意味

- **許可**: read / modify / internal use / contribute / commercial use (競合 SaaS を除く)
- **禁止**: Manta と機能的に競合する商用 SaaS / 製品の構築・販売
- **自動変換**: 各リリースは公開から 2 年後に Apache 2.0 へ自動切り替え
- **特許**: 貢献者は特許ライセンスを許諾

参考: https://fsl.software/

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
- 2 年後 Apache 2.0 化により、長期的なオープン性は担保

### Negative

- 公開オペレーション (PR レビュー、Issue 対応、Discord 運営) の継続工数が増える
- 競合に設計思想を観察される (ただしレセコン業界の動きは遅く、観察されても先行優位は保てる)
- セキュリティ (脆弱性公開窓口、CVE 対応プロセス) の整備が必須になる
- FSL は日本ではまだ知名度が低く、ライセンス選択の説明コストが発生
- 患者データ取り扱いの誤公開リスク (スクリーンショット、テストデータ) を厳格に管理する必要

### Neutral / Trade-offs

- 「フル OSS で行く」「クローズドで行く」の二択を避け、**Fair Source** という中間解を選択
- 共創コミュニティの規模が想定より小さい場合、ライセンスを後で Apache 2.0 寄りに緩める余地はある (FSL は緩める方向の変更は容易)
- BSL 1.1 (4 年保護) を選ばなかったため、競合に渡る時期は早い。ただし 2 年あれば SaaS としての先行者優位は十分作れる想定

## Alternatives Considered（他に検討した選択肢）

- **完全クローズド**: プロセスエコノミーのメリット (共創、ブランド、信頼) を全て失うため不採用
- **Apache 2.0 単独**: 競合に完全に渡るため不採用。レセコン業界の構造を考えると保護期間が必要
- **BSL 1.1 (4 年)**: 採用例が豊富で説明しやすいが、4 年は医療 AI の進化速度に対して長過ぎる。FSL の 2 年で十分
- **AGPL v3**: SaaS 提供者にソース公開を強制でき保護は強いが、企業ユーザーの忌避感が強く共創スピードが落ちる
- **SSPL**: OSI 非認定で「open washing」の批判を受ける可能性があり、GENSHI AI の Open Knowledge ブランドと相性が悪い
- **CLA 採用**: コントリビュート障壁が上がるため不採用、DCO で十分
- **PR TIMES を継続発信媒体として併用**: 1 件あたりのコストと媒体特性 (点の通知) を考えると、X / Zenn / note の方が継続発信に向く。PR TIMES はマイルストーン専用に絞る

## Lessons Learned / 振り返り（後追い記入）

未記入。

## References

- [Functional Source License (FSL) 公式](https://fsl.software/)
- [Sentry の FSL 採用記事](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)
- [Business Source License 1.1](https://mariadb.com/bsl11/)
- [けんすう氏 プロセスエコノミー note](https://kensuu.com/n/nf4270e069c20)
- 関連: [PUBLIC_RELEASE_CHECKLIST.md](../PUBLIC_RELEASE_CHECKLIST.md)
- 関連 ADR: [0004 Mantaレセコンと AI 算定補助層](0004-receipt-gateway-and-ai-claims-assist.md)
