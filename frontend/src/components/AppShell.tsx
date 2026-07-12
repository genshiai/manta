import { Command, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { UserSession } from '../types/workflow';
import { AppRail, type RailKey, type RailTarget } from './AppRail';
import { Button } from './ui/button';
import { Input } from './ui/input';

type AppShellScreen = 'reception' | 'ward' | 'billing' | 'settings';

const screenLabel: Record<AppShellScreen, string> = {
  reception: 'ホーム',
  ward: '病棟',
  billing: '医事・レセプト',
  settings: '管理設定',
};

const railKeyFor: Record<AppShellScreen, RailKey> = {
  reception: 'outpatient',
  ward: 'ward',
  billing: 'billing',
  settings: 'settings',
};

type AppShellProps = {
  screen: AppShellScreen;
  searchQuery: string;
  currentUser: UserSession;
  onSearchChange: (value: string) => void;
  onNavigate: (screen: RailTarget) => void;
  onSwitchUser: () => void;
  children: ReactNode;
};

/**
 * カルテ以外（受付・病棟・医事・設定）の共通アプリシェル（HENRY_UX_BENCHMARK §7 P0-1）。
 * ClinicalShell と同じ 56px レール + 52px トップバーの骨格を全画面で共有する。
 * 本文は内部スクロール（App シェル固定）。旧 AppHeader のトップバー航法と
 * StatusFooter は本シェルへ統合し廃止。
 */
export function AppShell({
  screen,
  searchQuery,
  currentUser,
  onSearchChange,
  onNavigate,
  onSwitchUser,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-surface-page text-text-primary">
      <AppRail
        activeRail={railKeyFor[screen]}
        userInitial={currentUser.displayName.slice(0, 1)}
        onNavigate={onNavigate}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] flex-none items-center gap-3.5 border-b border-border bg-card px-4">
          <p className="shrink-0 text-[14px] font-bold text-text-primary">{screenLabel[screen]}</p>
          <div className="mx-auto hidden w-full max-w-2xl items-center md:flex">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                aria-label="患者・カルテ横断検索"
                className="h-9 rounded-full border-border bg-surface-subtle pl-9 pr-24 text-[13px]"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="患者、診療録、検査、予約を検索"
                value={searchQuery}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[11px] text-text-tertiary lg:flex">
                <Command size={12} /> K
              </span>
            </div>
          </div>
          <Button className="ml-auto shrink-0" onClick={onSwitchUser} size="sm" type="button" variant="outline">
            {currentUser.displayName}
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
