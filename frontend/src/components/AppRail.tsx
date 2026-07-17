import { Bed, House, MessageSquare, ReceiptText, Settings } from 'lucide-react';
import mantaMark from '../assets/manta-mark.svg';
import type { UserRole } from '../types/workflow';
import { cn } from './ui/utils';

export type RailKey = 'outpatient' | 'ward' | 'billing' | 'messages' | 'settings';
export type RailTarget = 'reception' | 'ward' | 'billing' | 'messages' | 'settings';

type AppRailProps = {
  activeRail: RailKey;
  userInitial: string;
  userRole: UserRole;
  unreadMessages?: number;
  onNavigate: (screen: RailTarget) => void;
  onUserClick?: () => void;
};

const railItems: Array<{ key: RailKey; target: RailTarget; label: string; Icon: typeof House }> = [
  { key: 'outpatient', target: 'reception', label: '外来', Icon: House },
  { key: 'ward', target: 'ward', label: '病棟', Icon: Bed },
  { key: 'billing', target: 'billing', label: '医事', Icon: ReceiptText },
  { key: 'messages', target: 'messages', label: '連絡', Icon: MessageSquare },
];

/**
 * 全画面共通の 56px アプリレール（HENRY_UX_BENCHMARK §7 P0-1）。
 * カルテ（ClinicalShell）・受付・病棟・医事・設定が同じ骨格を共有する。
 * 外来／病棟／医事 を上段、設定を下端、最下部にアバター。KARTE_UI_SPEC §3。
 */
export function AppRail({ activeRail, userInitial, userRole, unreadMessages = 0, onNavigate, onUserClick }: AppRailProps) {
  const visibleRailItems = userRole === '管理者'
    ? railItems.filter((item) => item.key === 'ward' || item.key === 'billing' || item.key === 'messages')
    : railItems.filter((item) => item.key !== 'billing');

  return (
    <nav
      aria-label="メインナビゲーション"
      className="workspace-rail flex w-14 flex-none flex-col items-center gap-1 border-r border-border bg-card pb-3 pt-3"
    >
      <div className="mb-3 grid size-8 place-items-center" title="Manta">
        <img alt="Manta" className="h-auto w-[27px]" src={mantaMark} />
      </div>
      {visibleRailItems.map(({ key, target, label, Icon }) => (
        <button
          key={key}
          type="button"
          title={label}
          aria-label={label}
          aria-current={activeRail === key ? 'page' : undefined}
          onClick={() => onNavigate(target)}
          className={cn(
            'relative grid w-[46px] justify-items-center gap-0.5 rounded-[9px] px-0 py-1.5 text-[10px] font-semibold leading-none transition-colors',
            activeRail === key
              ? 'bg-brand-tint text-brand'
              : 'text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary',
          )}
        >
          <Icon size={18} strokeWidth={1.7} />
          <span>{label}</span>
          {key === 'messages' && unreadMessages > 0 ? (
            <span className="absolute end-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 py-0.5 text-[8px] leading-none text-white tabular-nums">
              {unreadMessages > 99 ? '99+' : unreadMessages}
            </span>
          ) : null}
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
          'grid w-[46px] justify-items-center gap-0.5 rounded-[9px] px-0 py-1.5 text-[10px] font-semibold leading-none transition-colors',
          activeRail === 'settings'
            ? 'bg-brand-tint text-brand'
            : 'text-text-tertiary hover:bg-surface-subtle hover:text-text-secondary',
        )}
      >
        <Settings size={18} strokeWidth={1.7} />
        <span>設定</span>
      </button>
      <button className="mt-1 grid size-[30px] place-items-center rounded-full bg-muted text-[11px] font-bold text-text-secondary hover:bg-surface-muted" onClick={onUserClick} title="利用者を切り替える" type="button">
        {userInitial}
      </button>
    </nav>
  );
}
