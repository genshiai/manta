import type { ComponentProps } from 'react';

export type ChipLabelVariant = 'text' | 'outline' | 'filled-outline' | 'fill';
export type ChipLabelColor =
  | 'gray'
  | 'blue'
  | 'light-blue'
  | 'cyan'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'magenta'
  | 'purple';

export type ChipLabelProps = ComponentProps<'span'> & {
  variant?: ChipLabelVariant;
  color?: ChipLabelColor;
};

// North Star 方針: プライマリ1色 + セマンティック3色（success/warning/danger）に集約。
// 旧6色コーディング由来の color 指定は gray にフォールバックする。
const textColorClasses = {
  neutral: 'text-solid-gray-800',
  success: 'text-green-900',
  warning: 'text-yellow-1000',
  danger: 'text-red-900',
} as const;

const outlineColorClasses = {
  neutral: 'border-solid-gray-300 text-solid-gray-800',
  success: 'border-green-700 text-green-900',
  warning: 'border-yellow-900 text-yellow-1000',
  danger: 'border-red-700 text-red-900',
} as const;

const filledOutlineColorClasses = {
  neutral: 'border-solid-gray-200 bg-solid-gray-50 text-solid-gray-800 [&_svg]:text-solid-gray-700',
  success: 'border-green-200 bg-green-50 text-green-900 [&_svg]:text-green-800',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-1100 [&_svg]:text-yellow-1000',
  danger: 'border-red-200 bg-red-50 text-red-1000 [&_svg]:text-red-900',
} as const;

const fillColorClasses = {
  neutral: 'bg-solid-gray-700',
  success: 'bg-green-800',
  warning: 'bg-yellow-1000',
  danger: 'bg-red-800',
} as const;

type SemanticTone = keyof typeof textColorClasses;

const toneByColor: Record<ChipLabelColor, SemanticTone> = {
  gray: 'neutral',
  blue: 'neutral',
  'light-blue': 'neutral',
  cyan: 'neutral',
  lime: 'neutral',
  orange: 'neutral',
  magenta: 'neutral',
  purple: 'neutral',
  green: 'success',
  yellow: 'warning',
  red: 'danger',
};

const colorClasses: Record<ChipLabelVariant, Record<SemanticTone, string>> = {
  text: textColorClasses,
  outline: outlineColorClasses,
  'filled-outline': filledOutlineColorClasses,
  fill: fillColorClasses,
};

export const ChipLabel = (props: ChipLabelProps) => {
  const { className, children, variant = 'text', color = 'gray', ...rest } = props;

  const colorClass = colorClasses[variant][toneByColor[color]];

  return (
    <span
      className={`
        inline-grid grid-cols-[auto_auto] items-baseline content-center min-h-8 rounded-8 text-oln-16N-100 [overflow-wrap:anywhere]
        data-[variant=text]:py-1 data-[variant=text]:px-2
        data-[variant=outline]:py-[calc(3/16*1rem)] data-[variant=outline]:px-[calc(7/16*1rem)] data-[variant=outline]:border
        data-[variant=filled-outline]:py-[calc(3/16*1rem)] data-[variant=filled-outline]:px-[calc(7/16*1rem)] data-[variant=filled-outline]:border
        data-[variant=fill]:py-[calc(3/16*1rem)] data-[variant=fill]:px-[calc(7/16*1rem)] data-[variant=fill]:border data-[variant=fill]:border-transparent data-[variant=fill]:text-white
        [&_svg]:forced-colors:fill-[CanvasText]
        ${colorClass} ${className ?? ''}
      `}
      data-variant={variant}
      data-color={color}
      {...rest}
    >
      {children}
    </span>
  );
};
