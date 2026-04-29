import type { ComponentProps } from 'react';

type IconProps = ComponentProps<'svg'>;

export const SearchIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <circle cx='11' cy='11' r='7' stroke='currentColor' strokeWidth='2' />
    <path d='M20 20L16.65 16.65' stroke='currentColor' strokeLinecap='round' strokeWidth='2' />
  </svg>
);

export const PencilIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <path
      d='M4 20L8.5 18.8L18.8 8.5C19.6 7.7 19.6 6.4 18.8 5.6L18.4 5.2C17.6 4.4 16.3 4.4 15.5 5.2L5.2 15.5L4 20Z'
      stroke='currentColor'
      strokeLinejoin='round'
      strokeWidth='2'
    />
  </svg>
);

export const DuplicateIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <rect height='11' rx='2' stroke='currentColor' strokeWidth='2' width='11' x='9' y='9' />
    <path d='M15 9V6C15 4.9 14.1 4 13 4H6C4.9 4 4 4.9 4 6V13C4 14.1 4.9 15 6 15H9' stroke='currentColor' strokeWidth='2' />
  </svg>
);

export const SaveIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <path d='M5 4H16L20 8V20H5V4Z' stroke='currentColor' strokeLinejoin='round' strokeWidth='2' />
    <path d='M8 4V10H16V4' stroke='currentColor' strokeWidth='2' />
    <path d='M8 20V14H16V20' stroke='currentColor' strokeWidth='2' />
  </svg>
);

export const CalendarIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <rect height='18' rx='2' stroke='currentColor' strokeWidth='2' width='18' x='3' y='4' />
    <path d='M8 2V7' stroke='currentColor' strokeWidth='2' />
    <path d='M16 2V7' stroke='currentColor' strokeWidth='2' />
    <path d='M3 10H21' stroke='currentColor' strokeWidth='2' />
  </svg>
);

export const ArrowRightIcon = (props: IconProps) => (
  <svg aria-hidden='true' fill='none' viewBox='0 0 24 24' {...props}>
    <path d='M5 12H19' stroke='currentColor' strokeLinecap='round' strokeWidth='2' />
    <path d='M12 5L19 12L12 19' stroke='currentColor' strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' />
  </svg>
);

