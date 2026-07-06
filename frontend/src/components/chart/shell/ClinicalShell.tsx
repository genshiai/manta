import { Bed, House, ReceiptText, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../ui/utils';

type RailTarget = 'reception' | 'ward' | 'billing' | 'settings';

type ClinicalShellProps = {
  activeRail: 'outpatient' | 'ward' | 'billing' | 'settings';
  userInitial: string;
  onNavigate: (screen: RailTarget) => void;
  topBar: ReactNode;
  patientBar: ReactNode;
  aiStrip: ReactNode;
  children: ReactNode;
};

const railItems: Array<{
  key: ClinicalShellProps['activeRail'];
  target: RailTarget;
  label: string;
  Icon: typeof House;
}> = [
  { key: 'outpatient', target: 'reception', label: '外来', Icon: House },
  { key: 'ward', target: 'ward', label: '病棟', Icon: Bed },
  { key: 'billing', target: 'billing', label: '医事', Icon: ReceiptText },
];

/**
 * カルテ（外来・入院）のアプリシェル。KARTE_UI_SPEC §3。
 * - `.clinical` でライト基調固定（§9.1）
 * - 全体は h-full overflow-hidden（全体スクロール禁止）
 * - 56px レール ┃ [TopBar 52 / PatientBar 50 / AIStrip 34 / body]
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
      {/* AppRail 56px */}
      <nav
        aria-label="メインナビゲーション"
        className="flex w-14 flex-none flex-col items-center gap-1 border-r border-border bg-card py-2.5"
      >
        <div className="mb-2.5 grid size-[30px] place-items-center rounded-lg bg-primary text-[14px] font-extrabold text-primary-foreground">
          M
        </div>
        {railItems.map(({ key, target, label, Icon }) => (
          <button
            key={key}
            type="button"
            title={label}
            aria-label={label}
            aria-current={activeRail === key ? 'page' : undefined}
            onClick={() => onNavigate(target)}
            className={cn(
              'grid size-[38px] place-items-center rounded-[9px] transition-colors',
              activeRail === key
                ? 'bg-brand-tint text-brand'
                : 'text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary',
            )}
          >
            <Icon size={18} strokeWidth={1.7} />
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          title="設定"
          aria-label="設定"
          aria-current={activeRail === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
          className={cn(
            'grid size-[38px] place-items-center rounded-[9px] transition-colors',
            activeRail === 'settings'
              ? 'bg-brand-tint text-brand'
              : 'text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary',
          )}
        >
          <Settings size={18} strokeWidth={1.7} />
        </button>
        <span className="mt-1 grid size-[30px] place-items-center rounded-full bg-muted text-[11px] font-bold text-text-secondary">
          {userInitial}
        </span>
      </nav>

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
