import type { ReactNode } from 'react';
import { cn } from '../../ui/utils';

/** キーキャップ表示。モック karte-b.html の .kbd に対応。 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-block rounded border border-border border-b-2 bg-card px-1.5 align-[1px] text-[11px] font-normal text-text-tertiary',
        className,
      )}
      style={{ fontFamily: 'inherit' }}
    >
      {children}
    </kbd>
  );
}
