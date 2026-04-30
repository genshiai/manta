import type { ReactNode } from 'react';

type ChartShellProps = {
  topBar: ReactNode;
  tabs: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
};

/**
 * カルテ画面のアプリシェル。
 * - 全体は h-full overflow-hidden で「ページ全体スクロール」を禁止
 * - ヘッダー (topBar) は flex-shrink-0
 * - カルテ専用 7 タブは topBar 直下に固定
 * - 3 ペインはそれぞれ独立してスクロールする overflow-y-auto コンテナ
 * - 左 256px / 中央 flex-1 / 右 320px (デスクトップ前提)
 *
 * 設計指針: frontend/CHART-DESIGN.md セクション 1
 */
export const ChartShell = ({ topBar, tabs, left, center, right }: ChartShellProps) => (
  <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-page">
    <div className="flex-shrink-0 border-b border-border bg-card">{topBar}</div>
    <div className="flex-shrink-0 border-b border-border bg-card">{tabs}</div>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex h-full w-64 flex-col overflow-y-auto border-r border-border bg-card">
        {left}
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">{center}</main>
      <aside className="flex h-full w-80 flex-col overflow-hidden border-l border-border bg-card">
        {right}
      </aside>
    </div>
  </div>
);
