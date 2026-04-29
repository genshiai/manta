import { Button, Input, buttonBaseStyle } from '../vendor/dads';
import { SearchIcon } from './Icons';
import { cn } from '../lib/cn';
import type { UserSession } from '../types/workflow';

type AppHeaderProps = {
  screen: 'reception' | 'chart' | 'settings';
  searchQuery: string;
  currentUser: UserSession;
  onSearchChange: (value: string) => void;
  onNavigate: (screen: 'reception' | 'settings') => void;
  onSwitchUser: () => void;
};

const navItems = [
  { key: 'reception', label: '受付' },
  { key: 'settings', label: '設定' },
] as const;

export const AppHeader = ({
  screen,
  searchQuery,
  currentUser,
  onSearchChange,
  onNavigate,
  onSwitchUser,
}: AppHeaderProps) => (
  <header className='sticky top-0 z-30 border-b border-solid-gray-200 bg-white/95 backdrop-blur'>
    <div className='mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-3 lg:px-6'>
      <div className='flex items-center gap-2'>
        <div className='grid h-8 w-8 place-items-center rounded-8 bg-blue-900 text-[18px] font-bold leading-snug text-white'>
          M
        </div>
        <p className='text-[20px] font-bold leading-snug text-solid-gray-900'>Manta</p>
      </div>

      <nav className='hidden items-center gap-6 xl:flex'>
        {navItems.map((item) => {
          const isActive = item.key === screen || (item.key === 'reception' && screen === 'chart');

          return (
            <button
              className={cn(
                buttonBaseStyle,
                'border-b-2 px-1 pb-3 pt-2 text-[16px] font-bold leading-none transition-colors',
                isActive
                  ? 'border-blue-700 text-blue-900'
                  : 'border-transparent text-solid-gray-536 hover:text-solid-gray-900',
              )}
              key={item.key}
              onClick={() => onNavigate(item.key)}
              type='button'
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className='ml-auto flex flex-1 items-center justify-end gap-3'>
        <div
          className={cn(
            'hidden min-w-[22rem] max-w-[28rem] flex-1 items-center lg:flex',
            screen !== 'reception' && 'invisible',
          )}
        >
          <div className='relative w-full'>
            <SearchIcon className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-solid-gray-536' />
            <Input
              aria-label='患者検索'
              blockSize='md'
              className='w-full pl-12'
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder='患者ID・氏名・診療科・担当医で検索'
              value={searchQuery}
            />
          </div>
        </div>

        <Button onClick={onSwitchUser} size='xs' type='button' variant='outline'>
          {currentUser.displayName}
        </Button>
      </div>
    </div>
  </header>
);
