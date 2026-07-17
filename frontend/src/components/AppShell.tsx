import { Command, PanelRightOpen, Search, Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { PatientRecord } from '../data/chartMock';
import type { CommunicationThread, InpatientAdmission, UserSession } from '../types/workflow';
import { AppRail, type RailKey, type RailTarget } from './AppRail';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { WorkspaceAidPane } from './workspace/WorkspaceAidPane';
import { WorkspaceContextPane } from './workspace/WorkspaceContextPane';
import type { SettingsSection } from './workspace/WorkspaceContextPane';

type AppShellScreen = 'reception' | 'ward' | 'billing' | 'messages' | 'settings';

const screenLabel: Record<AppShellScreen, string> = {
  reception: '外来',
  ward: '病棟',
  billing: '医事',
  messages: '連絡',
  settings: '設定',
};

const railKeyFor: Record<AppShellScreen, RailKey> = {
  reception: 'outpatient',
  ward: 'ward',
  billing: 'billing',
  messages: 'messages',
  settings: 'settings',
};

type AppShellProps = {
  screen: AppShellScreen;
  searchQuery: string;
  currentUser: UserSession;
  patients: PatientRecord[];
  admissions: InpatientAdmission[];
  communicationThreads: CommunicationThread[];
  activeThreadId?: string;
  onSearchChange: (value: string) => void;
  onNavigate: (screen: RailTarget) => void;
  onOpenChart: (patientId: string) => void;
  onOpenThread: (threadId: string) => void;
  onSwitchUser: () => void;
  children: ReactNode;
  settingsSection?: SettingsSection;
  onSettingsSectionChange?: (section: SettingsSection) => void;
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
  patients,
  admissions,
  communicationThreads,
  activeThreadId,
  onSearchChange,
  onNavigate,
  onOpenChart,
  onOpenThread,
  onSwitchUser,
  children,
  settingsSection,
  onSettingsSectionChange,
}: AppShellProps) {
  const [aidOpen, setAidOpen] = useState(true);

  return (
    <div
      className="workspace-shell h-screen min-h-0 overflow-hidden bg-surface-page text-text-primary"
      data-aid-open={aidOpen ? 'true' : 'false'}
    >
      <AppRail
        activeRail={railKeyFor[screen]}
        userInitial={currentUser.displayName.slice(0, 1)}
        userRole={currentUser.role}
        unreadMessages={communicationThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)}
        onNavigate={onNavigate}
        onUserClick={onSwitchUser}
      />
      <WorkspaceContextPane
        admissions={admissions}
        activeThreadId={activeThreadId}
        communicationThreads={communicationThreads}
        onOpenChart={onOpenChart}
        onOpenThread={onOpenThread}
        activeSettingsSection={settingsSection}
        onSettingsSectionChange={onSettingsSectionChange}
        onSearchChange={onSearchChange}
        patients={patients}
        screen={screen}
        searchQuery={searchQuery}
      />
      <div className="workspace-main-container flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] flex-none items-center gap-3.5 border-b border-border bg-card px-5">
          <div className="flex shrink-0 items-center gap-2 text-[12px] text-text-tertiary">
            <span>{screenLabel[screen]}</span>
            <span className="text-border-strong">/</span>
            <strong className="font-semibold text-text-primary">
              {screen === 'reception' ? '今日の患者' : screen === 'ward' ? '入院担当患者' : screen === 'billing' ? '請求ドラフト点検' : screen === 'messages' ? communicationThreads.find((thread) => thread.id === activeThreadId)?.title ?? 'スレッド' : settingsSection === 'users' ? '利用者と権限' : settingsSection === 'rxset' ? '処方セット' : settingsSection === 'labset' ? '検査セット' : settingsSection === 'slot' ? '予約枠' : settingsSection === 'template' ? 'カルテテンプレート' : settingsSection === 'claimRule' ? '施設ルール' : settingsSection === 'orca' ? '外部接続' : '監査ログ'}
            </strong>
          </div>
          <div className="mx-auto hidden w-full max-w-2xl items-center md:flex">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
              <Input
                aria-label="患者・カルテ横断検索"
                className="h-8 rounded-lg border-border bg-surface-subtle ps-9 pe-20 text-[12px]"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="患者・アクションを検索"
                value={searchQuery}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[11px] text-text-tertiary lg:flex">
                <Command size={12} /> K
              </span>
            </div>
          </div>
          {!aidOpen ? (
            <Button className="ms-auto shrink-0" onClick={() => setAidOpen(true)} size="xs" type="button" variant="outline">
              <PanelRightOpen size={13} /> 補助情報
            </Button>
          ) : null}
          <Button className={aidOpen ? 'ms-auto shrink-0' : 'shrink-0'} onClick={() => setAidOpen((open) => !open)} size="xs" type="button" variant="ghost">
            <Sparkles size={14} className="text-brand" /> エージェント
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      {aidOpen ? (
        <WorkspaceAidPane
          admissions={admissions}
          communicationThreads={communicationThreads}
          onClose={() => setAidOpen(false)}
          patients={patients}
          screen={screen}
        />
      ) : null}
    </div>
  );
}
