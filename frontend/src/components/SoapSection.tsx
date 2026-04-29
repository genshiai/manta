import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type SoapSectionProps = {
  label: 'S' | 'O' | 'A' | 'P';
  title: string;
  accentClassName: string;
  children: ReactNode;
};

export const SoapSection = ({
  label,
  title,
  accentClassName,
  children,
}: SoapSectionProps) => (
  <section className='overflow-hidden rounded-8 border border-solid-gray-200 bg-white'>
    <header className='flex items-center gap-4 border-b border-solid-gray-200 bg-white px-4 py-4 lg:px-6'>
      <span
        className={cn(
          'grid h-11 w-11 place-items-center rounded-8 text-[20px] font-bold leading-snug text-white',
          accentClassName,
        )}
      >
        {label}
      </span>
      <h2 className='text-[18px] font-bold leading-snug text-solid-gray-900'>{title}</h2>
    </header>
    <div className='flex flex-col gap-4 p-4 lg:p-6'>{children}</div>
  </section>
);

