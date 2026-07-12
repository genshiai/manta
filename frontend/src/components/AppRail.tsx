import { Bed, House, ReceiptText, Settings } from 'lucide-react';
import { cn } from './ui/utils';

export type RailKey = 'outpatient' | 'ward' | 'billing' | 'settings';
export type RailTarget = 'reception' | 'ward' | 'billing' | 'settings';

type AppRailProps = {
  activeRail: RailKey;
  userInitial: string;
  onNavigate: (screen: RailTarget) => void;
};

const railItems: Array<{ key: RailKey; target: RailTarget; label: string; Icon: typeof House }> = [
  { key: 'outpatient', target: 'reception', label: '外来', Icon: House },
  { key: 'ward', target: 'ward', label: '病棟', Icon: Bed },
  { key: 'billing', target: 'billing', label: '医事', Icon: ReceiptText },
];

/**
 * 全画面共通の 56px アプリレール（HENRY_UX_BENCHMARK §7 P0-1）。
 * カルテ（ClinicalShell）・受付・病棟・医事・設定が同じ骨格を共有する。
 * 外来／病棟／医事 を上段、設定を下端、最下部にアバター。KARTE_UI_SPEC §3。
 */
export function AppRail({ activeRail, userInitial, onNavigate }: AppRailProps) {
  return (
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
  );
}
