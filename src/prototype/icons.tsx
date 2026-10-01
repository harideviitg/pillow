import { useId, type ReactNode, type SVGProps } from 'react';

function Stroke({ size = 16, width = '2.2', children, ...rest }: { size?: number; width?: string; children: ReactNode } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto' }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const TasksIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5.5" />
    <path d="m8.25 12.25 2.5 2.5 5-5.5" />
  </Stroke>
);

export const LinkIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}>
    <path d="M9.5 17H8a5 5 0 0 1 0-10h1.5" />
    <path d="M14.5 7H16a5 5 0 0 1 0 10h-1.5" />
    <path d="M8.5 12h7" />
  </Stroke>
);

export const BookingIcon = ({ size }: { size?: number }) => (
  <Stroke size={size}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
    <path d="M3.5 10.25h17" />
    <path d="M8 2.75v3.5M16 2.75v3.5" />
  </Stroke>
);

export const ChainIcon = () => (
  <Stroke size={14} width="2.3">
    <path d="M10.5 13.5a4.5 4.5 0 0 0 6.79.49l2.5-2.5a4.5 4.5 0 0 0-6.36-6.36l-1.4 1.4" />
    <path d="M13.5 10.5a4.5 4.5 0 0 0-6.79-.49l-2.5 2.5a4.5 4.5 0 0 0 6.36 6.36l1.4-1.4" />
  </Stroke>
);

export const PlusIcon = () => (
  <Stroke size={14} width="2.6">
    <path d="M12 5v14M5 12h14" />
  </Stroke>
);

export const CheckIcon = ({ size = 14, strokeWidth = 2.6 }: { size?: number; strokeWidth?: number }) => (
  <Stroke size={size} width={String(strokeWidth)}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Stroke>
);

const CHEVRONS = {
  left: 'M15 5.5 8.5 12l6.5 6.5',
  right: 'm9 5.5 6.5 6.5L9 18.5',
  up: 'm5.5 15 6.5-6.5 6.5 6.5',
  down: 'm5.5 9 6.5 6.5L18.5 9',
};

export const ChevronIcon = ({ direction }: { direction: keyof typeof CHEVRONS }) => (
  <Stroke size={14} width="2.6">
    <path d={CHEVRONS[direction]} />
  </Stroke>
);

export function TrashIcon() {
  const id = useId();
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flex: '0 0 auto' }}>
      <mask id={id}>
        <path d="M5.5 9.5h13l-.85 9.75a2.25 2.25 0 0 1-2.25 2H8.6a2.25 2.25 0 0 1-2.25-2L5.5 9.5Z" fill="white" />
        <path d="M10 12.75v5M14 12.75v5" stroke="black" strokeWidth="2.2" strokeLinecap="round" />
      </mask>
      <rect x="3.5" y="5" width="17" height="3.2" rx="1.6" fill="currentColor" />
      <path d="M9.25 5V4.25A1.75 1.75 0 0 1 11 2.5h2a1.75 1.75 0 0 1 1.75 1.75V5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <rect width="24" height="24" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

export function ClockIcon() {
  const id = useId();
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color: 'color-mix(in srgb, var(--cal-text) 62%, var(--cal-muted))', flex: '0 0 auto' }}
    >
      <mask id={id} stroke="none">
        <circle cx="12" cy="12" r="9.5" fill="white" />
        <path d="M12 7.25v5.15l3.2 2" stroke="black" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <circle cx="12" cy="12" r="9.5" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

/** The paint cursor used when marking free time: a small pill on a crosshair. */
export const PAINT_CURSOR = `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='5'><rect x='0.5' y='0.5' width='23' height='4' rx='2' fill='white'/><rect x='1' y='1' width='22' height='3' rx='1.5' fill='%23141414'/></svg>") 12 2, crosshair`;
