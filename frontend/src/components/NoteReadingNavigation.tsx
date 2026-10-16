'use client';

export interface NoteSection {
  id: string;
  label: string;
  level: number;
}

export { RailToc, type RailTocItem, type RailTocProps } from './ui/rail-toc';

export interface ScrollProgressProps {
  progress: number;
  className?: string;
  size?: number;
}

export function ScrollProgress({ progress, className, size = 14 }: ScrollProgressProps) {
  const percent = Math.round(progress * 100);
  const r = 9;
  const circumference = 2 * Math.PI * r;

  return (
    <span
      data-slot="scroll-progress-circle"
      className={className || 'inline-flex items-center text-[var(--accents-5)] pointer-events-auto cursor-help'}
      title={`${percent}% da nota lida`}
      aria-label={`${percent}% da nota lida`}
    >
      <svg
        viewBox="0 0 24 24"
        style={{ width: `${size}px`, height: `${size}px` }}
        className="shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r={r} fill="none" stroke="var(--accents-3)" strokeWidth="2.5" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
          style={{ transition: 'stroke-dashoffset 150ms ease-out' }}
        />
      </svg>
    </span>
  );
}
