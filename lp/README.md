# Manta LP（mantajp.com）

Manta 公式ランディングページ。**ビルド不要の静的サイト**です——フレームワークも npm も要りません。ここのファイルをそのまま配信します。

## 構成

```
lp/
├─ index.html        ホーム（ヒーロー + カルテUIモック + 全体像）
├─ about.html        ビジョン全文（docs/vision.md の組版）
├─ technology.html   技術・アーキテクチャ・ADR
├─ community.html    プロセスエコノミー・貢献の流れ
├─ faq.html          よくある質問（FAQPage 構造化データ付き）
├─ assets/
│  ├─ css/site.css   デザインシステム（ライトテーマ固定）
│  ├─ js/site.js     ナビ・スクロール表示・パララックス・カウントアップ（依存なし）
│  ├─ fonts/         PlemolJP35 サブセット woff2（OFL.txt 同梱）
│  ├─ img/           生成アートワーク 11 枚（webp）・OGP 画像
│  └─ brand/         ロゴ一式（リポジトリ /brand からコピー）
└─ tools/build-fonts.py  フォント再サブセットスクリプト
```

## ローカルプレビュー

```bash
python3 -m http.server 8080 --directory lp
# → http://localhost:8080
```

`file://` 直開きでも表示されますが、woff2 の読み込みに HTTP サーバーを推奨します。

## デプロイ

Cloudflare Pages / GitHub Pages などに `lp/` を公開ディレクトリとして指定するだけです。

- 本番 URL 前提: `https://mantajp.com/`（canonical / OGP / sitemap / robots に記載済み）
- `/about` のような拡張子なし URL は Cloudflare Pages が自動で `about.html` に解決します（サイト内リンクは `.html` 付きなのでどちらでも動作）
- 公開一式は同梱済み: `favicon.ico`（16/32/48）・`site.webmanifest`（192/512 アイコン）・`robots.txt`・`sitemap.xml`・`404.html`
- OGP `assets/img/og.jpg` はブランドブルー地 + 白ロックアップの 1200x630。ページ共通で使用

## 文言を変えたとき（フォントの再サブセット）

本文フォント PlemolJP35 は、LP 全ページ + リポジトリ docs の文字集合でサブセットしています。
LP に新しい漢字を追加して豆腐（□）が出たら再生成してください：

```bash
# PlemolJP v3.0.0 を https://github.com/yuru7/PlemolJP/releases から取得して展開
python3 lp/tools/build-fonts.py /path/to/PlemolJP_v3.0.0/PlemolJP35
```

ライセンスは SIL OFL 1.1（`assets/fonts/OFL.txt`）。woff2 の name テーブルにも著作権表記を保持しています。

## 画像

`assets/img/art-*.webp` は Higgsfield（gpt_image_2）で生成したアートワーク 2 系統です。

- **ガラス × 深海ブルー系**（pillar 3 枚・layers・oss・masterdata・stopped）— プロダクト/技術の説明用
- **海の写真系**（manta・community・surface・currents）— 物語・情緒用

`og.jpg` は単体マンタのアートに白マーク + PlemolJP タイポを載せた OGP（1200x630、`-gravity northwest` で合成）。
差し替える場合もトーンは「ブランドブルー #0071e3 の単色系・余白多め・文字なし」を維持してください。

## デザインの約束

- **ライトテーマ固定**。ダークモード・テーマトグルは置かない（LP はヲタク臭を出さない）。
- **カラートークンはアプリ本体に準拠**——`frontend/src/styles/theme.css`（ADR 0003 / Apple HIG 実測値）から移植。
  LP 独自の色を発明しない。`#f5f5f7` / `#1d1d1f` / `#d2d2d7` / brand `#0071e3` → hover `#0066cc`。
- **ロゴを前面に**。ナビとフッターはロックアップ SVG、ヒーローはマーク単体、CTA バンドは白ロックアップ、OGP にも白マーク。
- **チップ/バッジの羅列をしない**。ヒーローのステータスは 1 つのピルまで。事実の列挙は mono の 1 行テキストで。
- **「約束/原則」のナンバリングカードを作らない**。思想はプロダクト説明・モックの演出・キャプションに溶かす。
- **内部事情を書かない**。ライセンスの検討経緯・「競争優位」等の経営ナラティブは LP に載せない。外に見せるのは
  「Apache 2.0 / 商用も fork も自由 / 特許条項が守る」という事実だけ。経緯はリポジトリ内の ADR に。
- タイポグラフィ: PlemolJP35（和文 = IBM Plex Sans JP / 欧文 = IBM Plex Mono）。OSS らしさの核。
- モーション: Google / Gemini 水準を目標。ヒーローのグラデーションブロブ、グラデ見出し、自動スタッガー付きリビール、
  アートのパララックス、統計カウントアップ、カルテモック内の「AI 候補 → 人間が承認」ループ。すべて `prefers-reduced-motion` 対応。
- ヒーローのカルテモックは `docs/KARTE_UI_SPEC.md` の画面仕様（AIサマリー常時1行・レンズ・点数は行為の影）に基づく。
- コピーの正本は `docs/vision.md` / `README.md` / `docs/why-manta.md`。トーンは「謙虚な理想主義」、征服系の比喩は使わない。
