import { Command, House, Search, Settings, Sparkles } from 'lucide-react';
import type { PatientRecord } from '../data/chartMock';
import type { UserSession } from '../types/workflow';
import { Button } from './ui/button';
import { Input } from './ui/input';

type AppHeaderProps = {
  screen: 'reception' | 'chart' | 'settings';
  searchQuery: string;
  currentUser: UserSession;
  currentPatient?: PatientRecord | null;
  onSearchChange: (value: string) => void;
  onNavigate: (screen: 'reception' | 'settings') => void;
  onSwitchUser: () => void;
};

const screenLabel = {
  reception: 'ホーム',
  chart: 'AIカルテ',
  settings: '管理設定',
} as const;

export const AppHeader = ({
  screen,
  searchQuery,
  currentUser,
  currentPatient,
  onSearchChange,
  onNavigate,
  onSwitchUser,
}: AppHeaderProps) => (
  <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
    <div className="flex h-14 items-center gap-3 px-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="grid size-8 place-items-center rounded-md bg-primary text-[15px] font-bold text-primary-foreground">
          M
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold leading-tight text-text-primary">Manta</p>
          <p className="truncate text-[11px] text-text-tertiary">{screenLabel[screen]}</p>
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onNavigate('reception')}
        className="ml-2 hidden shrink-0 gap-1.5 xl:inline-flex"
      >
        <House size={15} />
        ホーム
      </Button>

      {currentPatient ? (
        <div className="hidden min-w-0 items-center gap-2 rounded-full border border-border bg-surface-subtle px-3 py-1.5 lg:flex">
          <span className="grid size-6 place-items-center rounded-full bg-brand-tint text-[12px] font-bold text-brand">
            {currentPatient.name.slice(0, 1)}
          </span>
          <span className="truncate text-[13px] font-bold text-text-primary">{currentPatient.name}</span>
          <span className="text-[12px] text-text-tertiary">{currentPatient.id}</span>
        </div>
      ) : null}

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

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-[12px] font-medium text-brand lg:inline-flex">
          <Sparkles size={14} />
          AI ready
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onNavigate('reception')}
          title="ホーム"
        >
          <House size={17} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onNavigate('settings')}
          title="管理設定"
        >
          <Settings size={17} />
        </Button>
        <Button onClick={onSwitchUser} size="sm" type="button" variant="outline">
          {currentUser.displayName}
        </Button>
      </div>
    </div>
  </header>
);
