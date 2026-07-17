import type { ReactNode } from 'react';
import type { UserRole } from '../../../types/workflow';
import { AppRail, type RailKey, type RailTarget } from '../../AppRail';

type ClinicalShellProps = {
  activeRail: RailKey;
  userInitial: string;
  userRole: UserRole;
  unreadMessages?: number;
  onNavigate: (screen: RailTarget) => void;
  onSwitchUser?: () => void;
  topBar: ReactNode;
  patientBar: ReactNode;
  aiStrip: ReactNode;
  vitalsBand?: ReactNode;
  contextPane?: ReactNode;
  aidPane?: ReactNode;
  contextCompact?: boolean;
  children: ReactNode;
};

/**
 * カルテ（外来・入院）のアプリシェル。KARTE_UI_SPEC §3。
 * - `.clinical` でライト基調固定（§9.1）
 * - 全体は h-full overflow-hidden（全体スクロール禁止）
 * - 56px レール（AppRail・全画面共通） ┃ [TopBar 52 / PatientBar 50 / AIStrip 34 / body]
 */
export function ClinicalShell({
  activeRail,
  userInitial,
  userRole,
  unreadMessages = 0,
  onNavigate,
  onSwitchUser,
  topBar,
  patientBar,
  aiStrip,
  vitalsBand,
  contextPane,
  aidPane,
  contextCompact = false,
  children,
}: ClinicalShellProps) {
  return (
    <div
      className="clinical workspace-shell h-full min-h-0 overflow-hidden bg-surface-page text-text-primary"
      data-aid-open={aidPane ? 'true' : 'false'}
      data-context-compact={contextCompact ? 'true' : 'false'}
      data-context-open={contextPane ? 'true' : 'false'}
    >
      <AppRail activeRail={activeRail} userInitial={userInitial} userRole={userRole} unreadMessages={unreadMessages} onNavigate={onNavigate} onUserClick={onSwitchUser} />

      {contextPane}

      {/* main column */}
      <div className="workspace-main-container flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] flex-none items-center gap-3.5 border-b border-border bg-card pe-[18px] ps-5">
          {topBar}
        </div>
        <div className="flex min-h-[54px] flex-none flex-wrap items-center gap-2.5 border-b border-border bg-card px-5 py-2">
          {patientBar}
        </div>
        {aiStrip}
        {vitalsBand}
        <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
      {aidPane}
    </div>
  );
}
