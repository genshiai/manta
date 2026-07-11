> **アーカイブ**: 2026-04 の初期構想スナップショット。現在の正本は `docs/decisions/`（ADR）と各計画書。主な転換点は [README](README.md) 冒頭のバナーを参照。

# ADR-0002: Vite + React SPA を採用（Next.js 不採用）

## ステータス

承認済

## 背景

フロントエンド技術として Next.js（BFF + SSR）と Vite + React（SPA）を比較検討した。将来的に Tauri v2 でデスクトップアプリも提供する計画がある。

## 決定

**Vite + React + TanStack（SPA）を採用する。** Next.js は使用しない。

## 理由

### Next.js を不採用にした理由

1. **Tauri との互換性**: Next.js の Server Components / Server Actions / API Routes はサーバー側で動作する。Tauri デスクトップアプリではNode.jsサーバーを内包する必要が生じ、本末転倒。
2. **フロントの二重管理回避**: Next.js を Web 用、Vite を Tauri 用で分けると、フロントのコードベースが2つになる。OSSでこれをメンテナンスするのは現実的でない。
3. **SSR は不要**: 電子カルテは全ページがログイン後。SEO や初期表示速度の恩恵がほぼゼロ。
4. **安定性**: Next.js は半年ごとに新パラダイム（App Router, PPR 等）を導入する。医療システムの基盤にはリスク。
5. **バックエンドの分散回避**: Next.js の API Routes と FastAPI でバックエンドが分散すると、OpenAPI spec による一貫した型管理が崩れる。

### Vite + React を採用した理由

1. **Tauri公式サポート**: Vite は Tauri との統合が公式にサポートされている
2. **SPA = Web / Tauri 共有**: 同一のビルド成果物を Web（Cloudflare Pages）と Tauri で使える
3. **バックエンドとの分離**: FastAPI が唯一の API 層。OpenAPI spec → クライアント自動生成で型安全
4. **コントリビューター人口**: React は最大のエコシステム。AI によるコード生成品質も最高
5. **ビルド速度**: Vite は高速

### 将来 BFF が必要になった場合

Hono 等の軽量フレームワークを BFF 層として足す。Next.js ほど重くなく、必要な機能だけ提供できる。

## 帰結

- フロントエンドは SPA として完全にバックエンドから独立する
- API 通信は OpenAPI spec から自動生成されたクライアントを使用する
- TanStack Router で型安全なルーティングを実現する
- TanStack Query でサーバー状態管理、Zustand でクライアント状態管理
- フォームは React Hook Form + Zod でバリデーション
- Tauri v2 デスクトップアプリは同一の React コードを内包する
