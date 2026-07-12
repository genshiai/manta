import type { ReactNode } from 'react';
import { AppRail, type RailKey, type RailTarget } from '../../AppRail';

type ClinicalShellProps = {
  activeRail: RailKey;
  userInitial: string;
  onNavigate: (screen: RailTarget) => void;
  topBar: ReactNode;
  patientBar: ReactNode;
  aiStrip: ReactNode;
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
  onNavigate,
  topBar,
  patientBar,
  aiStrip,
  children,
}: ClinicalShellProps) {
  return (
    <div className="clinical flex h-full min-h-0 overflow-hidden bg-surface-page text-text-primary">
      <AppRail activeRail={activeRail} userInitial={userInitial} onNavigate={onNavigate} />

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] flex-none items-center gap-3.5 border-b border-border bg-card px-4">
          {topBar}
        </div>
        <div className="flex h-[50px] flex-none items-center gap-3 border-b border-border bg-card px-4">
          {patientBar}
        </div>
        {aiStrip}
        <div className="flex min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
